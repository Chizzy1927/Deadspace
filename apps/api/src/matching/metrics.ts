// Pure metric helpers for truck matching. Inputs are straight-line miles precomputed by PostGIS.
import { AVG_SPEED_MPH, ROAD_FACTOR } from './config.js';

/**
 * Straight-line miles between the four points of a leg serving a request:
 * O = leg origin, P = pickup, D = dropoff, X = leg destination.
 */
export interface LegRequestDistances {
  originToPickup: number;
  pickupToDropoff: number;
  dropoffToDestination: number;
  originToDestination: number;
}

/** Converts straight-line miles to estimated road miles. */
export function estRoadMiles(straightLineMiles: number): number {
  return straightLineMiles * ROAD_FACTOR;
}

/** Estimated hours to drive a straight-line distance at the average speed. */
export function estDriveHours(straightLineMiles: number): number {
  return estRoadMiles(straightLineMiles) / AVG_SPEED_MPH;
}

/**
 * Straight-line detour of O→P→D→X versus the planned O→X: d(O,P) + d(P,D) + d(D,X) − d(O,X).
 * Never negative in theory (triangle inequality); clamped at 0 to absorb float noise.
 */
export function detourMiles(d: LegRequestDistances): number {
  return Math.max(0, d.originToPickup + d.pickupToDropoff + d.dropoffToDestination - d.originToDestination);
}

/** Extra road miles the carrier drives to serve the request. */
export function estAdditionalMiles(d: LegRequestDistances): number {
  return estRoadMiles(detourMiles(d));
}

/**
 * EMPTY legs only: planned empty miles that now carry freight, min(d(P,D), d(O,X)) as road miles.
 * PARTIAL legs weren't running empty, so they recover none (null rather than 0).
 */
export function estEmptyMilesRecovered(loadState: 'EMPTY' | 'PARTIAL', d: LegRequestDistances): number | null {
  if (loadState !== 'EMPTY') return null;
  return estRoadMiles(Math.min(d.pickupToDropoff, d.originToDestination));
}

export interface Utilisation {
  before: number;
  after: number;
}

/** Share of capacity used before and after adding the request's quantity. */
export function utilisation(committed: number, requested: number, total: number): Utilisation {
  return { before: committed / total, after: (committed + requested) / total };
}

/** FLAT → the listed price; PER_LOADED_MILE → rate × est. loaded miles. Rounded to cents. */
export function estPrice(
  pricingBasis: 'FLAT' | 'PER_LOADED_MILE',
  priceAmount: number,
  estLoadedMiles: number,
): number {
  const price = pricingBasis === 'FLAT' ? priceAmount : priceAmount * estLoadedMiles;
  return Math.round(price * 100) / 100;
}
