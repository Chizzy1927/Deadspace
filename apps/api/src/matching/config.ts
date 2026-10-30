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

/**
 * Highlight thresholds (presentation only; they never affect score or rank). Rules compare the
 * unrounded values; only the highlight text is rounded for display.
 */
export const HIGHLIGHT_THRESHOLDS = {
  /** ON_ROUTE below this many est. additional miles. */
  onRouteMaxMiles: 5,
  /** NEAR_ROUTE from onRouteMaxMiles up to and including this. */
  nearRouteMaxMiles: 25,
  /** LARGE_DETOUR caution at or above this (none between nearRouteMaxMiles and this). */
  largeDetourMinMiles: 60,
  /** UNDER_BUDGET / BELOW_TYPICAL_PRICE when est. price ≤ this share of the reference. */
  belowReferenceRatio: 0.9,
  /** BELOW_TYPICAL_PRICE needs at least this many feasible matches for the median to mean much. */
  minMatchesForMedian: 3,
  /** USES_MOST_SPARE_CAPACITY at or above this share of the carrier's spare room (capacityFit). */
  mostSpareCapacityShare: 0.75,
  /** TIGHT_SCHEDULE caution below this many est. hours of slack. */
  tightSlackHours: 2,
  /** COMFORTABLE_SCHEDULE at or above this (the slack that earns full timing credit). */
  comfortableSlackHours: TIMING_FULL_SLACK_HOURS,
} as const;

// --- Warehouse space ↔ storage request (Phase 4) ---

/** Weight of each warehouse score component (each component is 0–1). Must sum to 1. */
export interface WarehouseScoreWeights {
  location: number;
  price: number;
  capacityFit: number;
  roomToExtend: number;
}

/** Warehouse score weights (approved V1 defaults). */
export const WAREHOUSE_SCORE_WEIGHTS: Readonly<WarehouseScoreWeights> = {
  location: 0.35,
  price: 0.35,
  capacityFit: 0.15,
  roomToExtend: 0.15,
};

/**
 * Est. road miles at which the location component reaches 0 (1 at the warehouse door, 0.5 at
 * half this). A fixed reference, not the shipper's search radius: the radius only decides which
 * warehouses are candidates, so widening it never changes an existing candidate's score. A
 * tunable V1 heuristic, not an empirical logistics constant.
 */
export const LOCATION_REFERENCE_MILES = 50;

/**
 * Days of availability after the requested move-out day that earn full room-to-extend credit.
 * Room beyond this earns nothing more, so a long-open listing isn't rewarded without limit.
 */
export const EXTENSION_FULL_CREDIT_DAYS = 14;

/**
 * Days per pricing period, used only to prorate a quoted rate into an est. stay cost so DAY, WEEK
 * and MONTH listings can be compared. A comparison convention (a month is 30 days), not a claim
 * about how an operator will invoice.
 */
export const PRICING_PERIOD_DAYS = { DAY: 1, WEEK: 7, MONTH: 30 } as const;

/** Storage highlight thresholds (presentation only; never affect score or rank). Unrounded values. */
export const STORAGE_HIGHLIGHT_THRESHOLDS = {
  /** NEARBY at or below this many est. miles. */
  nearbyMaxMiles: 10,
  /**
   * NEAR_EDGE_OF_RADIUS caution at or above this share of the shipper's radius, and only when
   * not NEARBY (so a small radius never flags a warehouse that is close in absolute terms). A V1
   * presentation heuristic describing the site relative to the shipper's stated tolerance, not a
   * warehouse-domain truth. It never affects score or rank.
   */
  nearEdgeOfRadiusShare: 0.9,
  /** UNDER_BUDGET / BELOW_TYPICAL_PRICE when est. total cost ≤ this share of the reference. */
  belowReferenceRatio: 0.9,
  /** BELOW_TYPICAL_PRICE needs at least this many feasible matches for the median to mean much. */
  minMatchesForMedian: 3,
  /** ROOM_TO_EXTEND at or above this many days after move-out (the full-credit amount). */
  roomToExtendMinDays: EXTENSION_FULL_CREDIT_DAYS,
} as const;
