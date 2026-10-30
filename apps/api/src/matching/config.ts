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

/**
 * V0 score weights (Phase 2): route efficiency only. Phase 3 adds capacity, price and timing
 * components and normalises route efficiency against a reference (docs/ARCHITECTURE.md §9).
 */
export const TRUCK_SCORE_WEIGHTS = {
  routeEfficiency: 1,
} as const;
