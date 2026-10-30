// Truck leg ↔ transport request matching, V0 (Phase 2). Pure and deterministic: no DB, HTTP,
// clock or randomness. Reads top to bottom: hard constraints → metrics → score → reasons → rank.
// Spec: docs/ARCHITECTURE.md §5. Weights and thresholds: ./config.ts (tunable defaults).
import type { LoadState, Status, TrailerType, TruckMatchMetrics, TruckPricingBasis } from '@deadspace/shared';
import { HANDLING_HOURS, MAX_RESULTS, TRUCK_SCORE_WEIGHTS } from './config.js';
import {
  estAdditionalMiles,
  estDriveHours,
  estEmptyMilesRecovered,
  estPrice,
  estRoadMiles,
  type LegRequestDistances,
  utilisation,
} from './metrics.js';

const HOUR_MS = 3_600_000;

export interface TruckMatchRequest {
  pickupEarliest: Date;
  pickupLatest: Date;
  deliverBy: Date | null;
  trailerType: TrailerType;
  pallets: number;
  weightLbs: number;
  maxBudget: number | null;
}

export interface TruckLegFacts {
  id: string;
  status: Status;
  trailerType: TrailerType;
  loadState: LoadState;
  departureEarliest: Date;
  departureLatest: Date;
  arriveBy: Date | null;
  totalPallets: number;
  totalWeightLbs: number;
  committedPallets: number;
  committedWeightLbs: number;
  maxDetourMiles: number;
  pricingBasis: TruckPricingBasis;
  priceAmount: number;
}

/** A leg plus the straight-line distances PostGIS computed for this request. */
export interface TruckCandidate {
  leg: TruckLegFacts;
  distances: LegRequestDistances;
}

export type TruckRejection =
  | 'INACTIVE'
  | 'TRAILER_MISMATCH'
  | 'INSUFFICIENT_PALLETS'
  | 'INSUFFICIENT_WEIGHT'
  | 'PICKUP_WINDOW'
  | 'DETOUR_LIMIT'
  | 'DELIVER_BY'
  | 'ARRIVE_BY';

export interface TruckMatchResult {
  legId: string;
  score: number;
  breakdown: { routeEfficiency: number };
  metrics: TruckMatchMetrics;
  reasons: string[];
}

const addHours = (date: Date, hours: number) => new Date(date.getTime() + hours * HOUR_MS);

/**
 * Earliest feasible timeline if the truck leaves at the start of its departure window, drives to
 * the pickup (waiting for the pickup window to open if early), then serves both stops.
 */
export function earliestSchedule(request: TruckMatchRequest, { leg, distances }: TruckCandidate) {
  const arriveAtPickup = addHours(leg.departureEarliest, estDriveHours(distances.originToPickup));
  const pickup = new Date(Math.max(arriveAtPickup.getTime(), request.pickupEarliest.getTime()));
  const arriveAtDropoff = addHours(pickup, HANDLING_HOURS + estDriveHours(distances.pickupToDropoff));
  const arriveAtDestination = addHours(arriveAtDropoff, HANDLING_HOURS + estDriveHours(distances.dropoffToDestination));
  return { pickup, arriveAtDropoff, arriveAtDestination };
}

/**
 * Hard constraints. Returns every violated constraint; an empty list means the leg is feasible.
 * The SQL candidate query applies the same rules (except the deadlines); this is the authority.
 */
export function checkTruckFeasibility(request: TruckMatchRequest, candidate: TruckCandidate): TruckRejection[] {
  const { leg, distances } = candidate;
  const rejections: TruckRejection[] = [];

  if (leg.status !== 'ACTIVE') rejections.push('INACTIVE');
  if (leg.trailerType !== request.trailerType) rejections.push('TRAILER_MISMATCH');
  if (leg.totalPallets - leg.committedPallets < request.pallets) rejections.push('INSUFFICIENT_PALLETS');
  if (leg.totalWeightLbs - leg.committedWeightLbs < request.weightLbs) rejections.push('INSUFFICIENT_WEIGHT');

  // Arrival-adjusted overlap: the departure window, shifted by the est. drive to the pickup,
  // must overlap the pickup window.
  const toPickupHours = estDriveHours(distances.originToPickup);
  const reachPickupEarliest = addHours(leg.departureEarliest, toPickupHours).getTime();
  const reachPickupLatest = addHours(leg.departureLatest, toPickupHours).getTime();
  if (reachPickupEarliest > request.pickupLatest.getTime() || reachPickupLatest < request.pickupEarliest.getTime()) {
    rejections.push('PICKUP_WINDOW');
  }

  if (estAdditionalMiles(distances) > leg.maxDetourMiles) rejections.push('DETOUR_LIMIT');

  if (request.deliverBy || leg.arriveBy) {
    const schedule = earliestSchedule(request, candidate);
    if (request.deliverBy && schedule.arriveAtDropoff > request.deliverBy) rejections.push('DELIVER_BY');
    if (leg.arriveBy && schedule.arriveAtDestination > leg.arriveBy) rejections.push('ARRIVE_BY');
  }
  return rejections;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;
const miles = (n: number) => `${Math.round(n).toLocaleString('en-US')} mi`;
const usd = (n: number) =>
  `$${n.toLocaleString('en-US', Number.isInteger(n) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Metrics for a feasible candidate (full precision; rounded only for output). */
function computeMetrics(request: TruckMatchRequest, { leg, distances }: TruckCandidate) {
  const additional = estAdditionalMiles(distances);
  const loaded = estRoadMiles(distances.pickupToDropoff);
  const pallets = utilisation(leg.committedPallets, request.pallets, leg.totalPallets);
  const weight = utilisation(leg.committedWeightLbs, request.weightLbs, leg.totalWeightLbs);
  const recovered = estEmptyMilesRecovered(leg.loadState, distances);
  return {
    additional,
    metrics: {
      estDirectLegMiles: round1(estRoadMiles(distances.originToDestination)),
      estAdditionalMiles: round1(additional),
      estLoadedMiles: round1(loaded),
      estEmptyMilesRecovered: recovered === null ? null : round1(recovered),
      sparePallets: leg.totalPallets - leg.committedPallets,
      spareWeightLbs: leg.totalWeightLbs - leg.committedWeightLbs,
      palletUtilisation: pallets,
      weightUtilisation: weight,
      limitingCapacity: weight.after > pallets.after ? 'WEIGHT' : 'PALLETS',
      estPrice: estPrice(leg.pricingBasis, leg.priceAmount, loaded),
    } satisfies TruckMatchMetrics,
  };
}

/**
 * V0 route efficiency: 1 − est. additional miles / the carrier's max detour, clamped to 0–1.
 * Known limitation, fixed in Phase 3: dividing by the carrier's own limit lets a higher declared
 * limit inflate the score (docs/ARCHITECTURE.md §9).
 */
export function routeEfficiency(estAdditional: number, maxDetourMiles: number): number {
  return clamp01(1 - estAdditional / maxDetourMiles);
}

/** Plain-language reasons, in a fixed order: route, load, capacity, timing, price. */
function explain(
  request: TruckMatchRequest,
  { leg, distances }: TruckCandidate,
  additional: number,
  metrics: TruckMatchMetrics,
): string[] {
  const reasons: string[] = [];

  reasons.push(
    additional < 1
      ? "On the carrier's planned route: serving you adds almost no miles (est. under 1 mi)"
      : `Adds est. ${miles(additional)} to the carrier's planned route (their limit: ${miles(leg.maxDetourMiles)})`,
  );

  if (metrics.estEmptyMilesRecovered !== null) {
    reasons.push(
      `Empty leg: your load fills est. ${miles(metrics.estEmptyMilesRecovered)} the truck would otherwise run empty`,
    );
  } else {
    reasons.push(
      `Part-loaded trailer with room to spare: ${metrics.sparePallets} of ${leg.totalPallets} pallets and ` +
        `${metrics.spareWeightLbs.toLocaleString('en-US')} lb free`,
    );
  }

  const limiting = metrics.limitingCapacity === 'WEIGHT' ? metrics.weightUtilisation : metrics.palletUtilisation;
  const by = metrics.limitingCapacity === 'WEIGHT' ? 'weight' : 'pallets';
  reasons.push(
    `Your load takes the trailer from ${percent(limiting.before)} to ${percent(limiting.after)} full (by ${by})`,
  );

  const toPickupHours = estDriveHours(distances.originToPickup);
  reasons.push(
    toPickupHours < 0.1
      ? 'Departs from your pickup area during your pickup window'
      : `Can reach your pickup during your pickup window (est. ${toPickupHours.toFixed(1)} h drive from its start)`,
  );
  if (request.deliverBy) reasons.push('Est. to reach your dropoff before your deliver-by time');

  const priceBasis =
    leg.pricingBasis === 'FLAT'
      ? 'flat rate'
      : `${usd(leg.priceAmount)} per loaded mile × est. ${miles(metrics.estLoadedMiles)}`;
  let priceReason = `Est. price ${usd(metrics.estPrice)} (${priceBasis})`;
  if (request.maxBudget !== null) {
    priceReason +=
      metrics.estPrice <= request.maxBudget
        ? `, within your ${usd(request.maxBudget)} budget`
        : `, est. ${usd(Math.round((metrics.estPrice - request.maxBudget) * 100) / 100)} over your ${usd(request.maxBudget)} budget`;
  }
  reasons.push(priceReason);

  return reasons;
}

/** Scores and explains a candidate that has already passed checkTruckFeasibility. */
export function scoreTruckLeg(request: TruckMatchRequest, candidate: TruckCandidate) {
  const { additional, metrics } = computeMetrics(request, candidate);
  const breakdown = { routeEfficiency: routeEfficiency(additional, candidate.leg.maxDetourMiles) };
  const score = Math.round(100 * TRUCK_SCORE_WEIGHTS.routeEfficiency * breakdown.routeEfficiency);
  const result: TruckMatchResult = {
    legId: candidate.leg.id,
    score,
    breakdown,
    metrics,
    reasons: explain(request, candidate, additional, metrics),
  };
  return { result, additional };
}

/**
 * Drops infeasible candidates, then ranks the rest: score desc, then fewer est. additional miles,
 * then lower est. price, then leg id (so equal inputs always produce the same order). Capped.
 */
export function rankTruckLegs(request: TruckMatchRequest, candidates: readonly TruckCandidate[]): TruckMatchResult[] {
  return candidates
    .filter((candidate) => checkTruckFeasibility(request, candidate).length === 0)
    .map((candidate) => scoreTruckLeg(request, candidate))
    .sort(
      (a, b) =>
        b.result.score - a.result.score ||
        a.additional - b.additional ||
        a.result.metrics.estPrice - b.result.metrics.estPrice ||
        (a.result.legId < b.result.legId ? -1 : a.result.legId > b.result.legId ? 1 : 0),
    )
    .slice(0, MAX_RESULTS)
    .map(({ result }) => result);
}
