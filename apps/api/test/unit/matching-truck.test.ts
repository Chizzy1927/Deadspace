import { describe, expect, it } from 'vitest';
import { HANDLING_HOURS, MAX_RESULTS, ROAD_FACTOR, TRUCK_SCORE_WEIGHTS } from '../../src/matching/config.js';
import { estDriveHours } from '../../src/matching/metrics.js';
import {
  checkTruckFeasibility,
  rankTruckLegs,
  scheduleSlack,
  scoreTruckLeg,
  type TruckCandidate,
  type TruckLegFacts,
  type TruckMatchRequest,
} from '../../src/matching/truck.js';
import { timingScore, weightedScore } from '../../src/matching/truck-score.js';

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

describe('schedule slack (timing input)', () => {
  // On-route defaults: leave 13:00, at the pickup 13:00, window closes 20:00.
  const dropoff = hoursAfter(at('13:00'), HANDLING_HOURS + estDriveHours(225));
  const destination = hoursAfter(dropoff, HANDLING_HOURS);

  it('is limited by the pickup window when no deadline is set', () => {
    expect(scheduleSlack(request(), candidate())).toEqual({ hours: 7, limitedBy: 'PICKUP_WINDOW' });
  });

  it('is zero when the truck can only just reach the pickup before the window closes', () => {
    const leg = { departureEarliest: at('20:00'), departureLatest: at('21:00') };
    expect(checkTruckFeasibility(request(), candidate(leg))).toEqual([]);
    expect(scheduleSlack(request(), candidate(leg))).toEqual({ hours: 0, limitedBy: 'PICKUP_WINDOW' });
  });

  it('measures from the drive-adjusted arrival at the pickup', () => {
    // 50 straight-line miles ≈ 1.2 h: leaving 13:00 reaches the pickup 14:12, 5.8 h before 20:00.
    const slack = scheduleSlack(request(), candidate({}, { originToPickup: 50, originToDestination: 260 }));
    expect(slack.limitedBy).toBe('PICKUP_WINDOW');
    expect(slack.hours).toBeCloseTo(7 - estDriveHours(50), 10);
  });

  it('is limited by a tight deliver-by', () => {
    const slack = scheduleSlack(request({ deliverBy: hoursAfter(dropoff, 0.5) }), candidate());
    expect(slack.limitedBy).toBe('DELIVER_BY');
    expect(slack.hours).toBeCloseTo(0.5, 10);
  });

  it("is limited by a tight carrier arrive-by (the carrier's next commitment)", () => {
    const slack = scheduleSlack(request(), candidate({ arriveBy: hoursAfter(destination, 0.25) }));
    expect(slack.limitedBy).toBe('ARRIVE_BY');
    expect(slack.hours).toBeCloseTo(0.25, 10);
  });

  it('takes the tightest of all applicable slacks', () => {
    const req = request({ deliverBy: hoursAfter(dropoff, 3) });
    const slack = scheduleSlack(req, candidate({ arriveBy: hoursAfter(destination, 1) }));
    expect(slack.limitedBy).toBe('ARRIVE_BY');
    expect(slack.hours).toBeCloseTo(1, 10);
  });

  it('gives full timing credit to a narrow declared departure window with comfortable slack', () => {
    const leg = { departureEarliest: at('13:00'), departureLatest: at('13:15') };
    expect(scheduleSlack(request(), candidate(leg))).toEqual({ hours: 7, limitedBy: 'PICKUP_WINDOW' });
    expect(scoreTruckLeg(request(), candidate(leg)).result.breakdown.timing).toBe(1);
  });

  it('stays meaningful for a zero-width pickup window', () => {
    const req = request({ pickupEarliest: at('12:00'), pickupLatest: at('12:00') });
    const leg = { departureEarliest: at('10:00'), departureLatest: at('13:00') };
    expect(checkTruckFeasibility(req, candidate(leg))).toEqual([]);
    expect(scheduleSlack(req, candidate(leg))).toEqual({ hours: 2, limitedBy: 'PICKUP_WINDOW' });
    expect(scoreTruckLeg(req, candidate(leg)).result.breakdown.timing).toBe(0.5);
  });
});

describe('scoring', () => {
  it('derives the 0–100 score from the four configured components', () => {
    // 22.5 est. mi detour; 6 of 26 spare pallets; a single match (price neutral); 7 h slack.
    const { result } = scoreTruckLeg(request(), candidate({}, detourOf(22.5)));
    expect(result.breakdown.routeEfficiency).toBeCloseTo(0.775, 10);
    expect(result.breakdown.capacityFit).toBeCloseTo(6 / 26, 10);
    expect(result.breakdown.price).toBe(0.5);
    expect(result.breakdown.timing).toBe(1);
    // 100 × (0.55 × 0.775 + 0.15 × 6/26 + 0.15 × 0.5 + 0.15 × 1) = 68.59
    expect(result.score).toBe(69);
    expect(result.score).toBe(weightedScore(result.breakdown, TRUCK_SCORE_WEIGHTS));
  });

  it("ignores the carrier's declared detour allowance when scoring route efficiency", () => {
    const routeScores = [30, 100, 300].map((maxDetourMiles) => {
      const c = candidate({ maxDetourMiles }, detourOf(22.5));
      expect(checkTruckFeasibility(request(), c)).toEqual([]);
      return scoreTruckLeg(request(), c).result.breakdown.routeEfficiency;
    });
    expect(routeScores[0]).toBeCloseTo(0.775, 10);
    expect(new Set(routeScores).size).toBe(1);
  });

  it('scores the same spare room equally, whatever freight is already on board', () => {
    const emptySmallTruck = candidate({ totalPallets: 12, totalWeightLbs: 22_000 });
    const partialBigTruck = candidate({ loadState: 'PARTIAL', committedPallets: 14, committedWeightLbs: 22_000 });
    const fit = (c: TruckCandidate) => scoreTruckLeg(request(), c).result.breakdown.capacityFit;
    expect(fit(emptySmallTruck)).toBe(0.5);
    expect(fit(partialBigTruck)).toBe(0.5);
  });

  it('scores capacity by weight when weight is the scarcer spare dimension', () => {
    const leg = { loadState: 'PARTIAL', committedPallets: 10, committedWeightLbs: 8_000 } as const;
    const { result } = scoreTruckLeg(request({ pallets: 4, weightLbs: 30_000 }), candidate(leg));
    expect(result.breakdown.capacityFit).toBeCloseTo(30_000 / 36_000, 10);
  });

  it('scores timing from the tightest est. schedule slack', () => {
    const leg = { departureEarliest: at('19:00'), departureLatest: at('21:00') };
    expect(scoreTruckLeg(request(), candidate(leg)).result.breakdown.timing).toBe(0.25);
  });

  it('prices against the budget when one is given', () => {
    const { result } = scoreTruckLeg(request({ maxBudget: 1_000 }), candidate());
    expect(result.breakdown.price).toBeCloseTo(1.5 - 650 / 1_000, 10);
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
      // Phase 3 presentation metrics: 15,000 of 22,000 spare lb; departs 13:00, 15 est. mi (0.3 h) to
      // the pickup, window closes 20:00; no budget and no other matches, so its own price is the median.
      spareCapacityUsed: 15_000 / 22_000,
      estScheduleSlackHours: 6.7,
      scheduleLimitedBy: 'PICKUP_WINDOW',
      priceReference: { basis: 'MATCH_MEDIAN', amount: 650 },
    });
  });

  it('exposes spare-capacity use and schedule slack on the same basis as the score', () => {
    const leg = { loadState: 'PARTIAL', committedPallets: 14, committedWeightLbs: 22_000 } as const;
    const req = request({ weightLbs: 15_000, deliverBy: at('20:30') });
    const c = candidate(leg, detourOf(30));
    const { result } = scoreTruckLeg(req, c);
    const slack = scheduleSlack(req, c);
    expect(result.metrics.spareCapacityUsed).toBe(result.breakdown.capacityFit);
    expect(result.metrics.estScheduleSlackHours).toBe(Math.round(slack.hours * 10) / 10);
    expect(result.metrics.scheduleLimitedBy).toBe(slack.limitedBy);
    expect(result.breakdown.timing).toBe(timingScore(slack.hours));
  });

  it('reports the budget as the price reference when one is set', () => {
    const { result } = scoreTruckLeg(request({ maxBudget: 700 }), candidate());
    expect(result.metrics.priceReference).toEqual({ basis: 'BUDGET', amount: 700 });
  });

  it('picks the limiting capacity by share of spare room, not by how full the trailer ends up', () => {
    // 20 of 26 pallets but only 5,000 of 44,000 lb already on board; request 3 pallets, 20,000 lb.
    // Trailer fill after: pallets 23/26 ≈ 88% vs weight 25,000/44,000 ≈ 57% (old basis: PALLETS).
    // Share of spare room: pallets 3/6 = 50% vs weight 20,000/39,000 ≈ 51% (spare basis: WEIGHT).
    const leg = { loadState: 'PARTIAL', committedPallets: 20, committedWeightLbs: 5_000 } as const;
    const { result } = scoreTruckLeg(request({ pallets: 3, weightLbs: 20_000 }), candidate(leg));
    expect(result.metrics.limitingCapacity).toBe('WEIGHT');
    expect(result.breakdown.capacityFit).toBeCloseTo(20_000 / 39_000, 10);
  });

  it('picks PALLETS as the limiting capacity on an exact tie of spare-room shares', () => {
    // Empty 24-pallet / 44,000 lb trailer: 6/24 pallets and 11,000/44,000 lb are both exactly 25%.
    const leg = { totalPallets: 24 };
    const { result } = scoreTruckLeg(request({ pallets: 6, weightLbs: 11_000 }), candidate(leg));
    expect(result.metrics.limitingCapacity).toBe('PALLETS');
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
    // Phase 3 weighted score (was route efficiency alone: 100 and 10). Both: 6 of 26 spare pallets,
    // same price (median → 0.5), ≥ 4 h slack. On-route: 55 + 3.46 + 7.5 + 15; detour: R = 0.1.
    expect(ranked[0]?.score).toBe(81);
    expect(ranked[1]?.score).toBe(31);
  });

  it('only returns feasible legs', () => {
    const ranked = rankTruckLegs(request(), [
      candidate({ id: 'reefer', trailerType: 'REEFER' }),
      candidate({ id: 'ok' }),
      candidate({ id: 'too-far' }, detourOf(150)),
    ]);
    expect(ranked.map((m) => m.legId)).toEqual(['ok']);
  });

  it('attaches highlights, counting only feasible legs toward the median comparison', () => {
    const cheap = candidate({ id: 'cheap', priceAmount: 400 });
    const others = [candidate({ id: 'mid', priceAmount: 650 }), candidate({ id: 'dear', priceAmount: 900 })];
    const highlightsOf = (ranked: ReturnType<typeof rankTruckLegs>) =>
      ranked.find((m) => m.legId === 'cheap')?.highlights.map((h) => h.code);

    // Three feasible legs, median $650: $400 is ≤ 90% of it.
    expect(highlightsOf(rankTruckLegs(request(), [cheap, ...others]))).toEqual(['ON_ROUTE', 'BELOW_TYPICAL_PRICE']);
    // Swap one for an infeasible reefer: two feasible legs are too few for "typical".
    const twoFeasible = [cheap, others[0] as TruckCandidate, candidate({ id: 'reefer', trailerType: 'REEFER' })];
    expect(highlightsOf(rankTruckLegs(request(), twoFeasible))).toEqual(['ON_ROUTE', 'COMFORTABLE_SCHEDULE']);
  });

  it('breaks score ties by fewer additional miles, then lower price, then leg id', () => {
    // Price now feeds the score, so the fixture uses a fixed budget and price gaps small enough
    // that every leg still rounds to the same integer score (86).
    const ranked = rankTruckLegs(request({ maxBudget: 1_000 }), [
      candidate({ id: 'd-pricier', priceAmount: 651 }),
      candidate({ id: 'c-same' }),
      candidate({ id: 'b-same' }),
      // Cheapest, but more additional miles (0.4 est. mi) than the others: miles outrank price.
      candidate({ id: 'a-more-miles', priceAmount: 649 }, detourOf(0.4)),
    ]);
    expect(ranked.map((m) => m.score)).toEqual([86, 86, 86, 86]);
    expect(ranked.map((m) => m.legId)).toEqual(['b-same', 'c-same', 'd-pricier', 'a-more-miles']);
  });

  it('takes the no-budget price reference from every feasible leg, before the result cap', () => {
    // 20 on-route legs at $1,000 fill the results; 21 cheaper 90-mile detours rank below the cap.
    // The median over all 41 feasible legs is $100, so the shown legs score 0 on price.
    const shown = Array.from({ length: MAX_RESULTS }, (_, i) =>
      candidate({ id: `on-${String(i).padStart(2, '0')}`, priceAmount: 1_000 }),
    );
    const cut = Array.from({ length: 21 }, (_, i) =>
      candidate({ id: `detour-${String(i).padStart(2, '0')}`, priceAmount: 100 }, detourOf(90)),
    );
    const infeasible = candidate({ id: 'reefer', trailerType: 'REEFER', priceAmount: 5_000 });
    const ranked = rankTruckLegs(request(), [...cut, infeasible, ...shown]);
    expect(ranked.map((m) => m.legId)).toEqual(shown.map((c) => c.leg.id));
    expect(ranked.every((m) => m.breakdown.price === 0)).toBe(true);
  });

  it('applies custom weights deterministically', () => {
    // No budget: median $750, so the on-route leg is dear (P ≈ 0.17) and the detour cheap (P ≈ 0.83).
    const candidates = [
      candidate({ id: 'on-route', priceAmount: 1_000 }),
      candidate({ id: 'cheap-detour', priceAmount: 500 }, detourOf(60)),
    ];
    expect(rankTruckLegs(request(), candidates).map((m) => m.legId)).toEqual(['on-route', 'cheap-detour']);
    const priceOnly = { routeEfficiency: 0, capacityFit: 0, price: 1, timing: 0 };
    const ranked = rankTruckLegs(request(), candidates, priceOnly);
    expect(ranked.map((m) => [m.legId, m.score])).toEqual([
      ['cheap-detour', 83],
      ['on-route', 17],
    ]);
    expect(rankTruckLegs(request(), [...candidates].reverse(), priceOnly)).toEqual(ranked);
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
