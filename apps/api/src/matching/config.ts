// Matching weights and thresholds. These are tunable heuristic defaults chosen for V1, not
// optimal or scientifically derived values. Change them here and nowhere else.

/** Road miles ≈ straight-line miles × ROAD_FACTOR. An estimate, not a routed distance. */
export const ROAD_FACTOR = 1.2;

/** Average truck speed used to estimate drive times. */
export const AVG_SPEED_MPH = 50;

/** Loading or unloading time allowed at each stop (pickup and dropoff). */
export const HANDLING_HOURS = 2;

/** Most matches returned for one request. */
export const MAX_RESULTS = 20;

/** Weight of each score component (each component is 0–1). Must sum to 1. */
export interface TruckScoreWeights {
  routeEfficiency: number;
  capacityFit: number;
  price: number;
  timing: number;
}

/** Truck score weights. Route efficiency is deliberately dominant. */
export const TRUCK_SCORE_WEIGHTS: Readonly<TruckScoreWeights> = {
  routeEfficiency: 0.55,
  capacityFit: 0.15,
  price: 0.15,
  timing: 0.15,
};

/**
 * Est. additional miles at which route efficiency reaches 0. A fixed reference, not the carrier's
 * own maxDetourMiles, so a larger declared allowance widens feasibility but never raises ranking.
 * Equal to the default detour allowance, so default listings score as they did in Phase 2.
 */
export const ROUTE_EFFICIENCY_REFERENCE_MILES = 100;

/**
 * Price component = clamp01(PRICE_ZERO_SCORE_RATIO − price / reference). With 1.5, a price at the
 * reference (budget, or median of feasible matches) scores 0.5, half of it 1, and 1.5× of it 0.
 */
export const PRICE_ZERO_SCORE_RATIO = 1.5;

/** Hours of est. schedule slack that earn full timing credit (absorbs drive-time estimate error). */
export const TIMING_FULL_SLACK_HOURS = 4;
