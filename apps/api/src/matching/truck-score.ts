// Pure score components for truck matching, each 0–1, and their weighted 0–100 combination.
// Plain numbers in, plain numbers out. Weights and reference values: ./config.ts (tunable defaults).
import {
  PRICE_ZERO_SCORE_RATIO,
  ROUTE_EFFICIENCY_REFERENCE_MILES,
  TIMING_FULL_SLACK_HOURS,
  TRUCK_SCORE_WEIGHTS,
  type TruckScoreWeights,
} from './config.js';

export type TruckScoreComponents = TruckScoreWeights;

export interface Capacity {
  pallets: number;
  weightLbs: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** 1 − est. additional miles / the fixed reference, clamped. Independent of the carrier's limit. */
export function routeEfficiency(estAdditionalMiles: number): number {
  return clamp01(1 - estAdditionalMiles / ROUTE_EFFICIENCY_REFERENCE_MILES);
}

/**
 * Share of the carrier's spare room (total − committed) the request takes, in whichever dimension
 * it takes more of. Freight already on board doesn't count: only capacity the carrier has to sell.
 * Feasibility guarantees requested ≤ spare, so the result is in (0, 1].
 */
export function capacityFit(requested: Capacity, spare: Capacity): number {
  return Math.max(requested.pallets / spare.pallets, requested.weightLbs / spare.weightLbs);
}

/** Median of a non-empty list (mean of the middle two for an even count). Order-independent. */
export function medianPrice(prices: readonly number[]): number {
  if (prices.length === 0) throw new Error('medianPrice needs at least one price');
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** The shipper's budget if given; otherwise the median est. price of all feasible matches. */
export function priceReference(maxBudget: number | null, feasiblePrices: readonly number[]): number {
  return maxBudget ?? medianPrice(feasiblePrices);
}

/** 1 at half the reference or less, 0.5 at the reference, 0 at 1.5× or more (linear between). */
export function priceScore(estPrice: number, reference: number): number {
  return clamp01(PRICE_ZERO_SCORE_RATIO - estPrice / reference);
}

/** Tightest est. schedule slack as a share of the full-credit slack, clamped. */
export function timingScore(slackHours: number): number {
  return clamp01(slackHours / TIMING_FULL_SLACK_HOURS);
}

/** 100 × Σ weight × component, rounded to an integer. */
export function weightedScore(
  components: TruckScoreComponents,
  weights: Readonly<TruckScoreWeights> = TRUCK_SCORE_WEIGHTS,
): number {
  return Math.round(
    100 *
      (weights.routeEfficiency * components.routeEfficiency +
        weights.capacityFit * components.capacityFit +
        weights.price * components.price +
        weights.timing * components.timing),
  );
}
