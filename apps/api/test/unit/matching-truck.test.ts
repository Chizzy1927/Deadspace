import { describe, expect, it } from 'vitest';
import { HANDLING_HOURS, MAX_RESULTS, ROAD_FACTOR, TRUCK_SCORE_WEIGHTS } from '../../src/matching/config.js';
import { estDriveHours } from '../../src/matching/metrics.js';
import {
  checkTruckFeasibility,
  rankTruckLegs,
  routeEfficiency,
  scoreTruckLeg,
  type TruckCandidate,
  type TruckLegFacts,
  type TruckMatchRequest,
} from '../../src/matching/truck.js';

const at = (iso: string) => new Date(`2026-11-02T${iso}:00Z`);
const hoursAfter = (date: Date, h: number) => new Date(date.getTime() + h * 3_600_000);

// Dallas → Houston, 6 pallets, pickup 12:00–20:00 UTC.
const request = (overrides: Partial<TruckMatchRequest> = {}): TruckMatchRequest => ({
  pickupEarliest: at('12:00'),
  pickupLatest: at('20:00'),
  deliverBy: null,
  trailerType: 'DRY_VAN',
  pallets: 6,
  weightLbs: 9_000,
  maxBudget: null,
  ...overrides,
});

const ON_ROUTE = { originToPickup: 0, pickupToDropoff: 225, dropoffToDestination: 0, originToDestination: 225 };

const candidate = (
  leg: Partial<TruckLegFacts> = {},
  distances: Partial<TruckCandidate['distances']> = {},
): TruckCandidate => ({
  leg: {
    id: 'leg-a',
    status: 'ACTIVE',
    trailerType: 'DRY_VAN',
    loadState: 'EMPTY',
    departureEarliest: at('13:00'),
    departureLatest: at('19:00'),
    arriveBy: null,
    totalPallets: 26,
    totalWeightLbs: 44_000,
    committedPallets: 0,
    committedWeightLbs: 0,
    maxDetourMiles: 100,
    pricingBasis: 'FLAT',
    priceAmount: 650,
    ...leg,
  },
  distances: { ...ON_ROUTE, ...distances },
});

/** Straight-line detour that yields `estMiles` additional road miles, placed on d(O,P). */
const detourOf = (estMiles: number) => ({
  originToPickup: estMiles / ROAD_FACTOR / 2,
  dropoffToDestination: estMiles / ROAD_FACTOR / 2,
});

describe('hard constraints', () => {
  it('accepts an on-route, compatible, roomy leg', () => {
    expect(checkTruckFeasibility(request(), candidate())).toEqual([]);
  });

  it.each([
    ['INACTIVE', { status: 'CLOSED' }],
    ['TRAILER_MISMATCH', { trailerType: 'REEFER' }],
    ['INSUFFICIENT_PALLETS', { loadState: 'PARTIAL', committedPallets: 21, committedWeightLbs: 1_000 }],
    ['INSUFFICIENT_WEIGHT', { loadState: 'PARTIAL', committedPallets: 1, committedWeightLbs: 36_000 }],
  ] as const)('rejects %s', (code, leg) => {
    expect(checkTruckFeasibility(request(), candidate(leg))).toEqual([code]);
  });

  it('accepts spare capacity exactly equal to the request', () => {
    const leg = { loadState: 'PARTIAL', committedPallets: 20, committedWeightLbs: 35_000 } as const;
    expect(checkTruckFeasibility(request(), candidate(leg))).toEqual([]);
  });

  // Distances are floats from PostGIS, so the boundary is tested just either side, not at equality.
  it('rejects a detour over the carrier limit and accepts one just within it', () => {
    expect(checkTruckFeasibility(request(), candidate({}, detourOf(100.5)))).toEqual(['DETOUR_LIMIT']);
    expect(checkTruckFeasibility(request(), candidate({}, detourOf(99.9)))).toEqual([]);
    expect(checkTruckFeasibility(request(), candidate({ maxDetourMiles: 25 }, detourOf(30)))).toEqual(['DETOUR_LIMIT']);
  });

  describe('pickup window (arrival-adjusted overlap)', () => {
    it('rejects a leg whose departure window ends before the pickup window opens', () => {
      const leg = { departureEarliest: at('02:00'), departureLatest: at('08:00') };
      expect(checkTruckFeasibility(request(), candidate(leg))).toEqual(['PICKUP_WINDOW']);
    });

    it('rejects a leg that cannot depart until after the pickup window closes', () => {
      const leg = { departureEarliest: at('21:00'), departureLatest: at('23:00') };
      expect(checkTruckFeasibility(request(), candidate(leg))).toEqual(['PICKUP_WINDOW']);
    });

    it('accepts a leg that departs before the window but reaches the pickup inside it', () => {
      // 190 straight-line miles away ≈ 4.6 h: departing 06:00–08:00 reaches the pickup 10:34–12:34.
      const leg = { departureEarliest: at('06:00'), departureLatest: at('08:00') };
      const far = { originToPickup: 190, originToDestination: 415 };
      expect(checkTruckFeasibility(request(), candidate(leg, far))).toEqual([]);
      // Without the drive time, the same departure window would not overlap 12:00–20:00.
      expect(checkTruckFeasibility(request(), candidate(leg))).toEqual(['PICKUP_WINDOW']);
    });

    it('rejects a leg whose departure overlaps the window but which reaches the pickup after it closes', () => {
      const leg = { departureEarliest: at('17:00'), departureLatest: at('19:00') };
      const far = { originToPickup: 190, originToDestination: 415 };
      expect(checkTruckFeasibility(request(), candidate(leg, far))).toEqual(['PICKUP_WINDOW']);
    });
  });

  describe('deadlines', () => {
    // On-route: pickup at max(13:00, 12:00) = 13:00, + 2 h handling + 5.4 h drive → dropoff 20:24.
    const dropoff = hoursAfter(at('13:00'), HANDLING_HOURS + estDriveHours(225));

    it('rejects a deliver-by the truck cannot meet and accepts one it can', () => {
      expect(checkTruckFeasibility(request({ deliverBy: hoursAfter(dropoff, -0.1) }), candidate())).toEqual([
        'DELIVER_BY',
      ]);
      expect(checkTruckFeasibility(request({ deliverBy: dropoff }), candidate())).toEqual([]);
    });

    it('rejects a leg whose own arrive-by commitment would be missed after serving the request', () => {
      // Destination = dropoff here, so the truck arrives after a further 2 h of unloading.
      const destination = hoursAfter(dropoff, HANDLING_HOURS);
      expect(checkTruckFeasibility(request(), candidate({ arriveBy: hoursAfter(destination, -0.1) }))).toEqual([
        'ARRIVE_BY',
      ]);
      expect(checkTruckFeasibility(request(), candidate({ arriveBy: destination }))).toEqual([]);
    });

    it('waits for the pickup window to open before starting the timeline', () => {
      // Truck can leave at 06:00 but the shipper is ready at 12:00, so dropoff is 19:24, not 13:24.
      const req = request({ deliverBy: at('19:00') });
      const leg = { departureEarliest: at('06:00'), departureLatest: at('14:00') };
      expect(checkTruckFeasibility(req, candidate(leg))).toEqual(['DELIVER_BY']);
    });
  });

  it('reports every violated constraint', () => {
    const leg = { trailerType: 'FLATBED', maxDetourMiles: 10 } as const;
    expect(checkTruckFeasibility(request(), candidate(leg, detourOf(50)))).toEqual([
      'TRAILER_MISMATCH',
      'DETOUR_LIMIT',
    ]);
  });
});

describe('scoring', () => {
  it('scores route efficiency as 1 − est. additional miles / max detour, clamped', () => {
    expect(routeEfficiency(0, 100)).toBe(1);
    expect(routeEfficiency(25, 100)).toBe(0.75);
    expect(routeEfficiency(150, 100)).toBe(0);
  });

  it('derives the 0–100 score from the configured weight', () => {
    const { result } = scoreTruckLeg(request(), candidate({}, detourOf(20)));
    expect(result.breakdown.routeEfficiency).toBeCloseTo(0.8);
    expect(result.score).toBe(Math.round(100 * TRUCK_SCORE_WEIGHTS.routeEfficiency * 0.8));
  });
});

describe('EMPTY vs PARTIAL legs', () => {
  it('reports empty miles recovered for an EMPTY leg', () => {
    const { result } = scoreTruckLeg(request(), candidate());
    expect(result.metrics.estEmptyMilesRecovered).toBe(270);
    expect(result.reasons.join('\n')).toContain('Empty leg: your load fills est. 270 mi');
  });

  it('omits empty miles recovered for a PARTIAL leg and shows spare capacity instead', () => {
    const leg = { loadState: 'PARTIAL', committedPallets: 14, committedWeightLbs: 22_000 } as const;
    const { result } = scoreTruckLeg(request(), candidate(leg));
    expect(result.metrics.estEmptyMilesRecovered).toBeNull();
    expect(result.metrics).toMatchObject({ sparePallets: 12, spareWeightLbs: 22_000 });
    expect(result.reasons.join('\n')).toContain('12 of 26 pallets and 22,000 lb free');
    expect(result.reasons.join('\n')).not.toContain('Empty leg');
  });
});

describe('metrics', () => {
  it('computes est. mileage, utilisation and price for a feasible leg', () => {
    const leg = { loadState: 'PARTIAL', committedPallets: 14, committedWeightLbs: 22_000 } as const;
    const { result } = scoreTruckLeg(request({ weightLbs: 15_000 }), candidate(leg, detourOf(30)));
    expect(result.metrics).toEqual({
      estDirectLegMiles: 270,
      estAdditionalMiles: 30,
      estLoadedMiles: 270,
      estEmptyMilesRecovered: null,
      sparePallets: 12,
      spareWeightLbs: 22_000,
      palletUtilisation: { before: 14 / 26, after: 20 / 26 },
      weightUtilisation: { before: 0.5, after: 37_000 / 44_000 },
      limitingCapacity: 'WEIGHT',
      estPrice: 650,
    });
  });

  it('prices PER_LOADED_MILE legs from est. loaded miles', () => {
    const { result } = scoreTruckLeg(request(), candidate({ pricingBasis: 'PER_LOADED_MILE', priceAmount: 2.1 }));
    expect(result.metrics.estPrice).toBe(567);
    expect(result.reasons.join('\n')).toContain('Est. price $567 ($2.10 per loaded mile × est. 270 mi)');
  });
});

describe('reasons', () => {
  it('explains an on-route leg in plain language, in a fixed order', () => {
    const { result } = scoreTruckLeg(request(), candidate());
    expect(result.reasons).toEqual([
      "On the carrier's planned route: serving you adds almost no miles (est. under 1 mi)",
      'Empty leg: your load fills est. 270 mi the truck would otherwise run empty',
      'Your load takes the trailer from 0% to 23% full (by pallets)',
      'Departs from your pickup area during your pickup window',
      'Est. price $650 (flat rate)',
    ]);
  });

  it('states the extra miles against the carrier limit, the drive to pickup and the deliver-by', () => {
    const req = request({ deliverBy: at('23:59') });
    const { result } = scoreTruckLeg(req, candidate({}, { originToPickup: 31, originToDestination: 238 }));
    expect(result.reasons[0]).toBe("Adds est. 22 mi to the carrier's planned route (their limit: 100 mi)");
    expect(result.reasons).toContain(
      'Can reach your pickup during your pickup window (est. 0.7 h drive from its start)',
    );
    expect(result.reasons).toContain('Est. to reach your dropoff before your deliver-by time');
  });

  it('compares the est. price with the budget when one is given', () => {
    expect(scoreTruckLeg(request({ maxBudget: 800 }), candidate()).result.reasons.at(-1)).toBe(
      'Est. price $650 (flat rate), within your $800 budget',
    );
    expect(scoreTruckLeg(request({ maxBudget: 600.5 }), candidate()).result.reasons.at(-1)).toBe(
      'Est. price $650 (flat rate), est. $49.50 over your $600.50 budget',
    );
  });
});

describe('ranking', () => {
  it('ranks an on-route leg above a 90-mile detour', () => {
    const ranked = rankTruckLegs(request(), [candidate({ id: 'detour' }, detourOf(90)), candidate({ id: 'on-route' })]);
    expect(ranked.map((m) => m.legId)).toEqual(['on-route', 'detour']);
    expect(ranked[0]?.score).toBe(100);
    expect(ranked[1]?.score).toBe(10);
  });

  it('only returns feasible legs', () => {
    const ranked = rankTruckLegs(request(), [
      candidate({ id: 'reefer', trailerType: 'REEFER' }),
      candidate({ id: 'ok' }),
      candidate({ id: 'too-far' }, detourOf(150)),
    ]);
    expect(ranked.map((m) => m.legId)).toEqual(['ok']);
  });

  it('breaks score ties by fewer additional miles, then lower price, then leg id', () => {
    const ranked = rankTruckLegs(request(), [
      candidate({ id: 'd-pricier', priceAmount: 700 }),
      candidate({ id: 'c-same' }),
      candidate({ id: 'b-same' }),
      // Score 100 after rounding (0.4 est. mi), but more additional miles than the others.
      candidate({ id: 'a-more-miles', priceAmount: 100 }, detourOf(0.4)),
    ]);
    expect(ranked.map((m) => m.score)).toEqual([100, 100, 100, 100]);
    expect(ranked.map((m) => m.legId)).toEqual(['b-same', 'c-same', 'd-pricier', 'a-more-miles']);
  });

  it('is deterministic regardless of candidate order', () => {
    const candidates = [10, 0, 45, 0, 80, 22, 45].map((miles, i) => candidate({ id: `leg-${i}` }, detourOf(miles)));
    const expected = rankTruckLegs(request(), candidates).map((m) => m.legId);
    expect(rankTruckLegs(request(), [...candidates].reverse()).map((m) => m.legId)).toEqual(expected);
    expect(rankTruckLegs(request(), [...candidates.slice(3), ...candidates.slice(0, 3)]).map((m) => m.legId)).toEqual(
      expected,
    );
    expect(expected).toEqual(['leg-1', 'leg-3', 'leg-0', 'leg-5', 'leg-2', 'leg-6', 'leg-4']);
  });

  it(`returns at most ${MAX_RESULTS} matches`, () => {
    const candidates = Array.from({ length: MAX_RESULTS + 5 }, (_, i) =>
      candidate({ id: `leg-${String(i).padStart(2, '0')}` }),
    );
    expect(rankTruckLegs(request(), candidates)).toHaveLength(MAX_RESULTS);
  });
});
