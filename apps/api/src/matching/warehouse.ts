// Warehouse space ↔ storage request matching. Pure and deterministic: no DB, HTTP, clock or
// randomness. Reads top to bottom: hard constraints → metrics → score → reasons → rank.
// Spec: docs/ARCHITECTURE.md §5. Weights and references: ./config.ts (tunable defaults).
//
// Dates are calendar days as UTC-midnight Dates (shared CalendarDateInput / Prisma @db.Date).
// endDate is the move-out day, so stay = endDate − startDate days; availableTo is the last day
// goods may be on site, so a listing covers a stay iff availableFrom ≤ startDate and
// endDate ≤ availableTo.
import {
  daysBetween,
  type Status,
  type StorageMatchHighlight,
  type StorageMatchMetrics,
  type StoragePricingPeriod,
  type StorageScoring,
} from '@deadspace/shared';
import {
  EXTENSION_FULL_CREDIT_DAYS,
  LOCATION_REFERENCE_MILES,
  MAX_RESULTS,
  PRICE_ZERO_SCORE_RATIO,
  PRICING_PERIOD_DAYS,
  WAREHOUSE_SCORE_WEIGHTS,
  type WarehouseScoreWeights,
} from './config.js';
import { miles, percent, usd } from './format.js';
import { estRoadMiles } from './metrics.js';
import { priceReference, priceScore } from './price.js';
import { storageHighlights } from './warehouse-highlights.js';
import {
  locationScore,
  roomToExtendScore,
  storageCapacityFit,
  type WarehouseScoreComponents,
  weightedWarehouseScore,
} from './warehouse-score.js';

export interface StorageMatchRequest {
  /** Search radius in est. road miles: a hard limit only, never a ranking input. */
  maxDistanceMiles: number;
  pallets: number;
  /** Move-in day. */
  startDate: Date;
  /** Move-out day. */
  endDate: Date;
  needsTemperatureControl: boolean;
  needsFoodGrade: boolean;
  maxBudgetTotal: number | null;
}

export interface WarehouseSpaceFacts {
  id: string;
  status: Status;
  /** Free pallet positions the operator is offering (not the site's total capacity). */
  quantityAvailable: number;
  minPallets: number | null;
  availableFrom: Date;
  /** Last day goods may be on site. */
  availableTo: Date;
  minStorageDays: number;
  temperatureControlled: boolean;
  foodGrade: boolean;
  pricingPeriod: StoragePricingPeriod;
  pricePerPalletPerPeriod: number;
  /** One combined in-and-out fee per pallet. */
  handlingFeePerPallet: number | null;
}

/** A listing plus the straight-line distance PostGIS computed to the request's location. */
export interface WarehouseCandidate {
  space: WarehouseSpaceFacts;
  straightLineMiles: number;
}

export type WarehouseRejection =
  | 'INACTIVE'
  | 'TOO_FAR'
  | 'WINDOW_NOT_COVERED'
  | 'INSUFFICIENT_PALLETS'
  | 'BELOW_MIN_PALLETS'
  | 'BELOW_MIN_DURATION'
  | 'MISSING_TEMPERATURE_CONTROL'
  | 'MISSING_FOOD_GRADE';

export interface WarehouseMatchResult {
  spaceId: string;
  score: number;
  breakdown: WarehouseScoreComponents;
  metrics: StorageMatchMetrics;
  highlights: StorageMatchHighlight[];
  reasons: string[];
}

/** The model matches are scored with, for the response (see StorageScoringSchema). */
export const WAREHOUSE_SCORING: StorageScoring = {
  weights: { ...WAREHOUSE_SCORE_WEIGHTS },
  locationReferenceMiles: LOCATION_REFERENCE_MILES,
  extensionFullCreditDays: EXTENSION_FULL_CREDIT_DAYS,
  priceZeroScoreRatio: PRICE_ZERO_SCORE_RATIO,
};

/** Requested stay in days (move-in to move-out). */
export const stayDays = (request: StorageMatchRequest) => daysBetween(request.startDate, request.endDate);

/**
 * Hard constraints. Returns every violated constraint; an empty list means the space is feasible.
 * Distance is compared as est. road miles, inclusive at the radius.
 */
export function checkWarehouseFeasibility(
  request: StorageMatchRequest,
  { space, straightLineMiles }: WarehouseCandidate,
): WarehouseRejection[] {
  const rejections: WarehouseRejection[] = [];

  if (space.status !== 'ACTIVE') rejections.push('INACTIVE');
  if (estRoadMiles(straightLineMiles) > request.maxDistanceMiles) rejections.push('TOO_FAR');
  if (space.availableFrom > request.startDate || request.endDate > space.availableTo) {
    rejections.push('WINDOW_NOT_COVERED');
  }
  if (request.pallets > space.quantityAvailable) rejections.push('INSUFFICIENT_PALLETS');
  if (space.minPallets !== null && request.pallets < space.minPallets) rejections.push('BELOW_MIN_PALLETS');
  if (stayDays(request) < space.minStorageDays) rejections.push('BELOW_MIN_DURATION');
  if (request.needsTemperatureControl && !space.temperatureControlled) rejections.push('MISSING_TEMPERATURE_CONTROL');
  if (request.needsFoodGrade && !space.foodGrade) rejections.push('MISSING_FOOD_GRADE');
  return rejections;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export interface EstStayCost {
  pricingPeriodDays: number;
  storage: number;
  handling: number;
  total: number;
}

/**
 * Est. cost of the stay, for comparing listings quoted per DAY, WEEK or MONTH:
 * storage = rate × pallets × stayDays / periodDays (prorated by day; no rounding up to whole
 * periods, no minimum charge) and handling = the combined in-and-out fee × pallets.
 * Each part and the total are rounded to cents.
 */
export function estStayCost(space: WarehouseSpaceFacts, pallets: number, days: number): EstStayCost {
  const pricingPeriodDays = PRICING_PERIOD_DAYS[space.pricingPeriod];
  const storage = cents((space.pricePerPalletPerPeriod * pallets * days) / pricingPeriodDays);
  const handling = cents((space.handlingFeePerPallet ?? 0) * pallets);
  return { pricingPeriodDays, storage, handling, total: cents(storage + handling) };
}

const candidateCost = (request: StorageMatchRequest, { space }: WarehouseCandidate) =>
  estStayCost(space, request.pallets, stayDays(request)).total;

const round1 = (n: number) => Math.round(n * 10) / 10;

const PERIOD_NOUN: Record<StoragePricingPeriod, string> = { DAY: 'day', WEEK: 'week', MONTH: 'month' };

/** Plain-language reasons, in a fixed order: location, dates, space, features, price. */
function explain(
  request: StorageMatchRequest,
  space: WarehouseSpaceFacts,
  distance: number,
  metrics: StorageMatchMetrics,
): string[] {
  const reasons: string[] = [];

  reasons.push(
    distance < 1
      ? 'At your location (est. under 1 mi away)'
      : `Est. ${miles(distance)} from your location (your radius: ${miles(request.maxDistanceMiles)})`,
  );

  const extension =
    metrics.daysAfterEnd === 0
      ? "availability ends on your move-out day, so there's no room to extend"
      : `available for ${metrics.daysAfterEnd} more ${metrics.daysAfterEnd === 1 ? 'day' : 'days'} if you need to extend`;
  reasons.push(`Free for your whole ${metrics.stayDays}-day stay; ${extension}`);

  let spaceReason =
    `Your ${request.pallets} pallets take ${percent(metrics.availableSpaceUsed)} of the ` +
    `${space.quantityAvailable} pallet positions offered`;
  if (space.minPallets !== null) spaceReason += ` (minimum block: ${space.minPallets})`;
  reasons.push(spaceReason);

  const needed = [
    request.needsTemperatureControl && 'temperature-controlled',
    request.needsFoodGrade && 'food-grade',
  ].filter((f): f is string => typeof f === 'string');
  if (needed.length > 0) {
    reasons.push(`Offers the ${needed.join(', ')} space you need (self-declared by the operator)`);
  }

  let priceReason =
    `Est. total ${usd(metrics.estTotalCost)}: ${usd(space.pricePerPalletPerPeriod)} per pallet per ` +
    `${PERIOD_NOUN[space.pricingPeriod]}, prorated over ${metrics.stayDays} days`;
  if (metrics.estHandlingCost > 0 && space.handlingFeePerPallet !== null) {
    priceReason += `, plus ${usd(space.handlingFeePerPallet)} per pallet handling (in and out)`;
  }
  if (request.maxBudgetTotal !== null) {
    priceReason +=
      metrics.estTotalCost <= request.maxBudgetTotal
        ? `; within your ${usd(request.maxBudgetTotal)} budget`
        : `; est. ${usd(cents(metrics.estTotalCost - request.maxBudgetTotal))} over your ${usd(request.maxBudgetTotal)} budget`;
  }
  reasons.push(priceReason);

  return reasons;
}

export interface WarehouseScoreOptions {
  /**
   * Cost the est. total is compared with (rankWarehouseSpaces passes the budget or the median of
   * all feasible matches). Defaults to scoring the candidate as the only match.
   */
  priceReference?: number;
  /** Feasible candidates the price median was taken over (for highlights only). Defaults to 1. */
  feasibleMatches?: number;
  weights?: Readonly<WarehouseScoreWeights>;
}

/** Scores and explains a candidate that has already passed checkWarehouseFeasibility. */
export function scoreWarehouseSpace(
  request: StorageMatchRequest,
  candidate: WarehouseCandidate,
  options: WarehouseScoreOptions = {},
) {
  const { space } = candidate;
  const days = stayDays(request);
  const distance = estRoadMiles(candidate.straightLineMiles);
  const cost = estStayCost(space, request.pallets, days);
  const reference = options.priceReference ?? priceReference(request.maxBudgetTotal, [cost.total]);

  const metrics: StorageMatchMetrics = {
    estDistanceMiles: round1(distance),
    stayDays: days,
    daysAfterEnd: daysBetween(request.endDate, space.availableTo),
    availableSpaceUsed: storageCapacityFit(request.pallets, space.quantityAvailable),
    pricingPeriodDays: cost.pricingPeriodDays,
    estStorageCost: cost.storage,
    estHandlingCost: cost.handling,
    estTotalCost: cost.total,
    priceReference: {
      basis: request.maxBudgetTotal === null ? 'MATCH_MEDIAN' : 'BUDGET',
      amount: cents(reference),
    },
  };
  const breakdown: WarehouseScoreComponents = {
    location: locationScore(distance),
    price: priceScore(cost.total, reference),
    capacityFit: metrics.availableSpaceUsed,
    roomToExtend: roomToExtendScore(metrics.daysAfterEnd),
  };
  const result: WarehouseMatchResult = {
    spaceId: space.id,
    score: weightedWarehouseScore(breakdown, options.weights),
    breakdown,
    metrics,
    highlights: storageHighlights({
      metrics,
      estDistanceMiles: distance,
      maxDistanceMiles: request.maxDistanceMiles,
      feasibleMatches: options.feasibleMatches ?? 1,
    }),
    reasons: explain(request, space, distance, metrics),
  };
  return { result, distance };
}

/**
 * Drops infeasible candidates, then ranks the rest: score desc, then nearer (unrounded est.
 * distance), then lower est. total cost, then space id (so equal inputs always produce the same
 * order, whatever order the candidates arrive in). Capped at MAX_RESULTS. Without a budget, cost is
 * scored against the median est. total cost of every feasible candidate, taken before the cap.
 */
export function rankWarehouseSpaces(
  request: StorageMatchRequest,
  candidates: readonly WarehouseCandidate[],
  weights: Readonly<WarehouseScoreWeights> = WAREHOUSE_SCORE_WEIGHTS,
): WarehouseMatchResult[] {
  const feasible = candidates.filter((candidate) => checkWarehouseFeasibility(request, candidate).length === 0);
  if (feasible.length === 0) return [];
  const reference = priceReference(
    request.maxBudgetTotal,
    feasible.map((candidate) => candidateCost(request, candidate)),
  );
  return feasible
    .map((candidate) =>
      scoreWarehouseSpace(request, candidate, { priceReference: reference, feasibleMatches: feasible.length, weights }),
    )
    .sort(
      (a, b) =>
        b.result.score - a.result.score ||
        a.distance - b.distance ||
        a.result.metrics.estTotalCost - b.result.metrics.estTotalCost ||
        (a.result.spaceId < b.result.spaceId ? -1 : a.result.spaceId > b.result.spaceId ? 1 : 0),
    )
    .slice(0, MAX_RESULTS)
    .map(({ result }) => result);
}
