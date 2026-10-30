// Pure score components for warehouse matching, each 0–1, and their weighted 0–100 combination.
// Plain numbers in, plain numbers out. Weights and references: ./config.ts (tunable defaults).
// The price component is shared with trucks (./price.ts).
import {
  EXTENSION_FULL_CREDIT_DAYS,
  LOCATION_REFERENCE_MILES,
  WAREHOUSE_SCORE_WEIGHTS,
  type WarehouseScoreWeights,
} from './config.js';

export type WarehouseScoreComponents = WarehouseScoreWeights;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * 1 − est. distance / LOCATION_REFERENCE_MILES, clamped: 1 at 0 mi, 0.5 at 25, 0 at 50 or more.
 * Deliberately independent of the shipper's search radius, which only decides feasibility.
 */
export function locationScore(estDistanceMiles: number): number {
  return clamp01(1 - estDistanceMiles / LOCATION_REFERENCE_MILES);
}

/**
 * Share of the listing's free pallet positions the request takes: pallets / quantityAvailable.
 * quantityAvailable is the space the operator has to sell, so space already in use at the site
 * never counts. Feasibility guarantees pallets ≤ quantityAvailable, so the result is in (0, 1].
 */
export function storageCapacityFit(pallets: number, quantityAvailable: number): number {
  return pallets / quantityAvailable;
}

/**
 * Days available after the move-out day as a share of the full-credit days, clamped: 0 when
 * availability ends on the move-out day, 1 from EXTENSION_FULL_CREDIT_DAYS on (no extra credit
 * beyond). Full coverage of the stay is a hard constraint, so daysAfterEnd is never negative here.
 */
export function roomToExtendScore(daysAfterEnd: number): number {
  return clamp01(daysAfterEnd / EXTENSION_FULL_CREDIT_DAYS);
}

/** 100 × Σ weight × component, rounded to an integer. */
export function weightedWarehouseScore(
  components: WarehouseScoreComponents,
  weights: Readonly<WarehouseScoreWeights> = WAREHOUSE_SCORE_WEIGHTS,
): number {
  return Math.round(
    100 *
      (weights.location * components.location +
        weights.price * components.price +
        weights.capacityFit * components.capacityFit +
        weights.roomToExtend * components.roomToExtend),
  );
}
