import { describe, expect, it } from 'vitest';
import { AVG_SPEED_MPH, ROAD_FACTOR } from '../../src/matching/config.js';
import {
  detourMiles,
  estAdditionalMiles,
  estDriveHours,
  estEmptyMilesRecovered,
  estPrice,
  estRoadMiles,
  utilisation,
} from '../../src/matching/metrics.js';

const onRoute = { originToPickup: 0, pickupToDropoff: 225, dropoffToDestination: 0, originToDestination: 225 };

describe('distance estimates', () => {
  it('scales straight-line miles by the configured road factor', () => {
    expect(estRoadMiles(100)).toBeCloseTo(100 * ROAD_FACTOR);
  });

  it('estimates drive hours from road miles at the configured average speed', () => {
    expect(estDriveHours(100)).toBeCloseTo((100 * ROAD_FACTOR) / AVG_SPEED_MPH);
  });
});

describe('detour', () => {
  it('is d(O,P) + d(P,D) + d(D,X) − d(O,X)', () => {
    // Fort Worth → Houston leg serving Dallas → Houston (approximate straight-line miles).
    const d = { originToPickup: 31, pickupToDropoff: 225, dropoffToDestination: 0, originToDestination: 238 };
    expect(detourMiles(d)).toBeCloseTo(18);
    expect(estAdditionalMiles(d)).toBeCloseTo(18 * ROAD_FACTOR);
  });

  it('is zero for a request exactly on the planned leg', () => {
    expect(detourMiles(onRoute)).toBe(0);
  });

  it('is clamped at zero when float noise would make it negative', () => {
    expect(detourMiles({ ...onRoute, originToDestination: 225.0000001 })).toBe(0);
  });

  it('counts the return trip when the dropoff overshoots the leg destination', () => {
    // Dallas → Huntsville leg serving Dallas → Houston: Houston is past Huntsville.
    const d = { originToPickup: 0, pickupToDropoff: 225, dropoffToDestination: 67, originToDestination: 160 };
    expect(detourMiles(d)).toBeCloseTo(132);
  });
});

describe('empty miles recovered', () => {
  it('is min(d(P,D), d(O,X)) as road miles for EMPTY legs', () => {
    expect(estEmptyMilesRecovered('EMPTY', onRoute)).toBeCloseTo(225 * ROAD_FACTOR);
    const shortRequest = { ...onRoute, pickupToDropoff: 80, dropoffToDestination: 145 };
    expect(estEmptyMilesRecovered('EMPTY', shortRequest)).toBeCloseTo(80 * ROAD_FACTOR);
    const shortLeg = { originToPickup: 10, pickupToDropoff: 300, dropoffToDestination: 50, originToDestination: 200 };
    expect(estEmptyMilesRecovered('EMPTY', shortLeg)).toBeCloseTo(200 * ROAD_FACTOR);
  });

  it('is null (not zero) for PARTIAL legs, which were not running empty', () => {
    expect(estEmptyMilesRecovered('PARTIAL', onRoute)).toBeNull();
  });
});

describe('utilisation', () => {
  it('reports committed/total before and (committed + requested)/total after', () => {
    expect(utilisation(0, 6, 24)).toEqual({ before: 0, after: 0.25 });
    expect(utilisation(14, 6, 26)).toEqual({ before: 14 / 26, after: 20 / 26 });
  });
});

describe('estimated price', () => {
  it('uses the listed amount for FLAT pricing', () => {
    expect(estPrice('FLAT', 650, 270)).toBe(650);
  });

  it('multiplies the rate by est. loaded miles for PER_LOADED_MILE, rounded to cents', () => {
    expect(estPrice('PER_LOADED_MILE', 2.1, 270)).toBe(567);
    expect(estPrice('PER_LOADED_MILE', 1.95, 100.123)).toBe(195.24);
  });
});
