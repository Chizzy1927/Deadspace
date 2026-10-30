import { addDays, StorageMatchesResponseSchema, StorageMatchSchema } from '@deadspace/shared';
import { describe, expect, it } from 'vitest';
import { MAX_RESULTS, ROAD_FACTOR, WAREHOUSE_SCORE_WEIGHTS } from '../../src/matching/config.js';
import { estRoadMiles } from '../../src/matching/metrics.js';
import { medianPrice } from '../../src/matching/price.js';
import {
  checkWarehouseFeasibility,
  rankWarehouseSpaces,
  scoreWarehouseSpace,
  type StorageMatchRequest,
  WAREHOUSE_SCORING,
  type WarehouseCandidate,
  type WarehouseSpaceFacts,
} from '../../src/matching/warehouse.js';
import { weightedWarehouseScore } from '../../src/matching/warehouse-score.js';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

// 40 pallets near the shipper, moving in Nov 10 and out Dec 10 (a 30-day stay), 25 est. mi radius.
const START = day('2026-11-10');
const END = day('2026-12-10');
const request = (overrides: Partial<StorageMatchRequest> = {}): StorageMatchRequest => ({
  maxDistanceMiles: 25,
  pallets: 40,
  startDate: START,
  endDate: END,
  needsTemperatureControl: false,
  needsFoodGrade: false,
  maxBudgetTotal: null,
  ...overrides,
});

const candidate = (space: Partial<WarehouseSpaceFacts> = {}, straightLineMiles = 10): WarehouseCandidate => ({
  space: {
    id: 'space-a',
    status: 'ACTIVE',
    quantityAvailable: 100,
    minPallets: null,
    availableFrom: day('2026-11-01'),
    availableTo: day('2026-12-31'),
    minStorageDays: 1,
    temperatureControlled: false,
    foodGrade: false,
    pricingPeriod: 'MONTH',
    pricePerPalletPerPeriod: 15,
    handlingFeePerPallet: null,
    ...space,
  },
  straightLineMiles,
});

/** Straight-line miles that come out as `estMiles` est. road miles. */
const straightFor = (estMiles: number) => estMiles / ROAD_FACTOR;

describe('hard constraints', () => {
  it('accepts an active, nearby, covering, roomy listing', () => {
    expect(checkWarehouseFeasibility(request(), candidate())).toEqual([]);
  });

  it.each([
    ['INACTIVE', { status: 'CLOSED' }],
    ['INSUFFICIENT_PALLETS', { quantityAvailable: 39 }],
    ['BELOW_MIN_PALLETS', { minPallets: 41 }],
    ['BELOW_MIN_DURATION', { minStorageDays: 31 }],
    ['WINDOW_NOT_COVERED', { availableFrom: day('2026-11-11') }],
    ['WINDOW_NOT_COVERED', { availableTo: day('2026-12-09') }],
  ] as const)('rejects %s', (code, space) => {
    expect(checkWarehouseFeasibility(request(), candidate(space))).toEqual([code]);
  });

  it('accepts each quantity and duration limit at its exact boundary', () => {
    expect(checkWarehouseFeasibility(request(), candidate({ quantityAvailable: 40 }))).toEqual([]);
    expect(checkWarehouseFeasibility(request(), candidate({ minPallets: 40 }))).toEqual([]);
    expect(checkWarehouseFeasibility(request(), candidate({ minStorageDays: 30 }))).toEqual([]);
  });

  it('rejects a listing beyond the radius, inclusive at the radius (compared as est. road miles)', () => {
    // 25 straight-line mi × 1.2 = exactly 30 est. mi.
    expect(estRoadMiles(25)).toBe(30);
    const r = request({ maxDistanceMiles: 30 });
    expect(checkWarehouseFeasibility(r, candidate({}, 25))).toEqual([]);
    expect(checkWarehouseFeasibility(r, candidate({}, 25.001))).toEqual(['TOO_FAR']);
    // The radius is est. road miles, not straight-line: 24 straight-line mi is 28.8 est. mi.
    expect(checkWarehouseFeasibility(request({ maxDistanceMiles: 28 }), candidate({}, 24))).toEqual(['TOO_FAR']);
  });

  describe('date coverage (availableTo = last day on site, endDate = move-out day)', () => {
    it('accepts availability starting exactly on the move-in day', () => {
      expect(checkWarehouseFeasibility(request(), candidate({ availableFrom: START }))).toEqual([]);
    });

    it('rejects availability starting one day after the move-in day', () => {
      expect(checkWarehouseFeasibility(request(), candidate({ availableFrom: addDays(START, 1) }))).toEqual([
        'WINDOW_NOT_COVERED',
      ]);
    });

    it('accepts availability ending exactly on the move-out day', () => {
      expect(checkWarehouseFeasibility(request(), candidate({ availableTo: END }))).toEqual([]);
    });

    it('rejects availability ending one day before the move-out day', () => {
      expect(checkWarehouseFeasibility(request(), candidate({ availableTo: addDays(END, -1) }))).toEqual([
        'WINDOW_NOT_COVERED',
      ]);
    });

    it('accepts a window exactly equal to the stay, and a whole-window stay at the minimum duration', () => {
      const exact = candidate({ availableFrom: START, availableTo: END, minStorageDays: 30 });
      expect(checkWarehouseFeasibility(request(), exact)).toEqual([]);
    });

    it('rejects a window that lies entirely before or after the stay', () => {
      const before = candidate({ availableFrom: day('2026-10-01'), availableTo: day('2026-11-05') });
      const after = candidate({ availableFrom: day('2026-12-15'), availableTo: day('2027-01-31') });
      expect(checkWarehouseFeasibility(request(), before)).toEqual(['WINDOW_NOT_COVERED']);
      expect(checkWarehouseFeasibility(request(), after)).toEqual(['WINDOW_NOT_COVERED']);
    });
  });

  describe('compatibility features', () => {
    it.each([
      ['MISSING_TEMPERATURE_CONTROL', { needsTemperatureControl: true }, { foodGrade: true }],
      ['MISSING_FOOD_GRADE', { needsFoodGrade: true }, { temperatureControlled: true }],
    ] as const)('rejects %s', (code, needs, has) => {
      expect(checkWarehouseFeasibility(request(needs), candidate(has))).toEqual([code]);
    });

    it('accepts a listing with every required feature', () => {
      const r = request({ needsTemperatureControl: true, needsFoodGrade: true });
      expect(checkWarehouseFeasibility(r, candidate({ temperatureControlled: true, foodGrade: true }))).toEqual([]);
    });

    it('accepts extra features the request does not need', () => {
      expect(checkWarehouseFeasibility(request(), candidate({ temperatureControlled: true, foodGrade: true }))).toEqual(
        [],
      );
    });
  });

  it('reports every violated constraint', () => {
    const r = request({ needsTemperatureControl: true, needsFoodGrade: true });
    const bad = candidate(
      { status: 'CLOSED', quantityAvailable: 20, minPallets: 50, minStorageDays: 60, availableTo: END },
      100,
    );
    expect(checkWarehouseFeasibility(r, bad)).toEqual([
      'INACTIVE',
      'TOO_FAR',
      'INSUFFICIENT_PALLETS',
      'BELOW_MIN_PALLETS',
      'BELOW_MIN_DURATION',
      'MISSING_TEMPERATURE_CONTROL',
      'MISSING_FOOD_GRADE',
    ]);
  });
});

describe('scoreWarehouseSpace', () => {
  it('returns metrics, a breakdown and a score that agree with each other', () => {
    const c = candidate({ pricePerPalletPerPeriod: 16, handlingFeePerPallet: 8 }, straightFor(12.5));
    const { result } = scoreWarehouseSpace(request(), c);
    expect(result.metrics).toEqual({
      estDistanceMiles: 12.5,
      stayDays: 30,
      daysAfterEnd: 21,
      availableSpaceUsed: 0.4,
      pricingPeriodDays: 30,
      estStorageCost: 640,
      estHandlingCost: 320,
      estTotalCost: 960,
      priceReference: { basis: 'MATCH_MEDIAN', amount: 960 },
    });
    expect(result.breakdown.location).toBeCloseTo(0.75, 10);
    expect(result.breakdown.price).toBe(0.5);
    expect(result.breakdown.capacityFit).toBe(0.4);
    expect(result.breakdown.roomToExtend).toBe(1);
    // 100 × (0.35 × 0.75 + 0.35 × 0.5 + 0.15 × 0.4 + 0.15 × 1) = 26.25 + 17.5 + 6 + 15 = 64.75.
    expect(result.score).toBe(65);
    expect(result.score).toBe(weightedWarehouseScore(result.breakdown));
    expect(StorageMatchSchema.omit({ space: true }).parse(result)).toBeTruthy();
  });

  it('scores room to extend from availableTo − endDate, capped at 14 days', () => {
    const extend = (availableTo: Date) => scoreWarehouseSpace(request(), candidate({ availableTo })).result;
    expect(extend(END).metrics.daysAfterEnd).toBe(0);
    expect(extend(END).breakdown.roomToExtend).toBe(0);
    expect(extend(addDays(END, 7)).breakdown.roomToExtend).toBe(0.5);
    expect(extend(addDays(END, 13)).breakdown.roomToExtend).toBeCloseTo(13 / 14, 10);
    expect(extend(addDays(END, 14)).breakdown.roomToExtend).toBe(1);
    expect(extend(addDays(END, 90)).breakdown.roomToExtend).toBe(1);
    expect(extend(addDays(END, 90)).score).toBe(extend(addDays(END, 14)).score);
  });

  it('scores capacity fit from free pallet positions only', () => {
    expect(scoreWarehouseSpace(request(), candidate({ quantityAvailable: 40 })).result.breakdown.capacityFit).toBe(1);
    expect(scoreWarehouseSpace(request(), candidate({ quantityAvailable: 400 })).result.breakdown.capacityFit).toBe(
      0.1,
    );
  });

  describe('location is independent of the search radius', () => {
    it('gives an already-feasible candidate the same location score and total for any radius', () => {
      const c = candidate({}, straightFor(20));
      const narrow = scoreWarehouseSpace(request({ maxDistanceMiles: 20 }), c).result;
      const wide = scoreWarehouseSpace(request({ maxDistanceMiles: 250 }), c).result;
      expect(narrow.breakdown.location).toBeCloseTo(0.6, 10);
      expect(wide.breakdown).toEqual(narrow.breakdown);
      expect(wide.score).toBe(narrow.score);
      // The radius-relative caution is presentation only: it appears without changing the score.
      expect(narrow.highlights.map((h) => h.code)).toContain('NEAR_EDGE_OF_RADIUS');
      expect(wide.highlights.map((h) => h.code)).not.toContain('NEAR_EDGE_OF_RADIUS');
    });

    it('lets a wider radius add candidates without changing existing candidates’ location scores', () => {
      const near = candidate({ id: 'near' }, straightFor(10));
      const far = candidate({ id: 'far' }, straightFor(60));
      const narrow = rankWarehouseSpaces(request({ maxDistanceMiles: 25 }), [near, far]);
      const wide = rankWarehouseSpaces(request({ maxDistanceMiles: 100 }), [near, far]);
      expect(narrow.map((m) => m.spaceId)).toEqual(['near']);
      expect(wide.map((m) => m.spaceId)).toEqual(['near', 'far']);
      expect(wide[0]!.breakdown.location).toBe(narrow[0]!.breakdown.location);
      // Beyond the 50 mi reference, location earns nothing.
      expect(wide[1]!.breakdown.location).toBe(0);
    });
  });
});

describe('price reference', () => {
  const priced = (id: string, monthly: number) => candidate({ id, pricePerPalletPerPeriod: monthly });

  it('is neutral (0.5) for a single match with no budget', () => {
    const [match] = rankWarehouseSpaces(request(), [priced('a', 15)]);
    expect(match!.metrics.priceReference).toEqual({ basis: 'MATCH_MEDIAN', amount: 600 });
    expect(match!.breakdown.price).toBe(0.5);
  });

  it('uses the median est. total cost of feasible matches when there is no budget', () => {
    // 40 pallets × 30 days of a monthly rate: totals 400, 600, 1000. Median 600.
    const matches = rankWarehouseSpaces(request(), [priced('a', 10), priced('b', 15), priced('c', 25)]);
    for (const m of matches) expect(m.metrics.priceReference).toEqual({ basis: 'MATCH_MEDIAN', amount: 600 });
    const byId = Object.fromEntries(matches.map((m) => [m.spaceId, m.breakdown.price]));
    expect(byId.a).toBeCloseTo(1.5 - 400 / 600, 10);
    expect(byId.b).toBe(0.5);
    expect(byId.c).toBe(0);
  });

  it('ignores infeasible candidates when taking the median', () => {
    const tooSmall = candidate({ id: 'small', quantityAvailable: 10, pricePerPalletPerPeriod: 1 });
    const matches = rankWarehouseSpaces(request(), [priced('a', 10), priced('b', 20), tooSmall]);
    expect(matches.map((m) => m.metrics.priceReference.amount)).toEqual([600, 600]);
  });

  it('uses the shipper’s total budget when given', () => {
    const [match] = rankWarehouseSpaces(request({ maxBudgetTotal: 800 }), [priced('a', 15), priced('b', 25)]);
    expect(match!.metrics.priceReference).toEqual({ basis: 'BUDGET', amount: 800 });
    expect(match!.breakdown.price).toBeCloseTo(1.5 - 600 / 800, 10);
  });

  it('without a budget, adding a feasible candidate can move the median and existing price scores (intended)', () => {
    const existing = [priced('a', 10), priced('b', 15)];
    const before = rankWarehouseSpaces(request(), existing);
    const after = rankWarehouseSpaces(request(), [...existing, priced('c', 40)]);
    const priceOf = (ms: typeof before, sid: string) => ms.find((m) => m.spaceId === sid)!.breakdown.price;
    // Totals 400 and 600: median 500. Adding 1600 makes the median 600.
    expect(before[0]!.metrics.priceReference.amount).toBe(500);
    expect(after[0]!.metrics.priceReference.amount).toBe(600);
    expect(priceOf(before, 'b')).toBeCloseTo(1.5 - 600 / 500, 10);
    expect(priceOf(after, 'b')).toBe(0.5);
    expect(priceOf(after, 'a')).not.toBe(priceOf(before, 'a'));
  });

  it('with a budget, adding candidates changes neither the reference nor existing price scores', () => {
    const r = request({ maxBudgetTotal: 800 });
    const existing = [priced('a', 10), priced('b', 15)];
    const before = rankWarehouseSpaces(r, existing);
    const after = rankWarehouseSpaces(r, [...existing, priced('c', 40), priced('d', 5)]);
    for (const sid of ['a', 'b']) {
      const b = before.find((m) => m.spaceId === sid)!;
      const a = after.find((m) => m.spaceId === sid)!;
      expect(a.metrics.priceReference).toEqual({ basis: 'BUDGET', amount: 800 });
      expect(a.metrics.priceReference).toEqual(b.metrics.priceReference);
      expect(a.breakdown.price).toBe(b.breakdown.price);
    }
  });

  it('compares the total including handling, not the storage rate alone', () => {
    const noFee = candidate({ id: 'no-fee', pricePerPalletPerPeriod: 20 });
    const withFee = candidate({ id: 'with-fee', pricePerPalletPerPeriod: 15, handlingFeePerPallet: 10 });
    const [a, b] = rankWarehouseSpaces(request({ maxBudgetTotal: 800 }), [noFee, withFee]);
    // 800 vs 600 + 400 = 1000: the cheaper headline rate is the dearer stay.
    expect(a!.spaceId).toBe('no-fee');
    expect(b!.metrics.estTotalCost).toBe(1000);
  });
});

describe('rankWarehouseSpaces', () => {
  it('drops infeasible candidates and orders the rest by score', () => {
    const matches = rankWarehouseSpaces(request(), [
      candidate({ id: 'far' }, straightFor(24)),
      candidate({ id: 'closed', status: 'CLOSED' }, 0),
      candidate({ id: 'near' }, straightFor(1)),
    ]);
    expect(matches.map((m) => m.spaceId)).toEqual(['near', 'far']);
    expect(matches[0]!.score).toBeGreaterThan(matches[1]!.score);
  });

  it('returns [] when nothing is feasible', () => {
    expect(rankWarehouseSpaces(request(), [candidate({ status: 'CLOSED' })])).toEqual([]);
    expect(rankWarehouseSpaces(request(), [])).toEqual([]);
  });

  it('breaks equal scores by nearer est. distance', () => {
    // 5.1 vs 5 est. mi changes location by 0.002 (score 69.93 vs 70), so the rounded scores tie.
    const a = candidate({ id: 'a' }, straightFor(5.1));
    const b = candidate({ id: 'b' }, straightFor(5));
    const [first, second] = rankWarehouseSpaces(request(), [a, b]);
    expect(first!.score).toBe(second!.score);
    expect([first!.spaceId, second!.spaceId]).toEqual(['b', 'a']);
  });

  it('then by lower est. total cost', () => {
    const dearer = candidate({ id: 'a', pricePerPalletPerPeriod: 15.01 });
    const cheaper = candidate({ id: 'z', pricePerPalletPerPeriod: 15 });
    const [first, second] = rankWarehouseSpaces(request(), [dearer, cheaper]);
    expect(first!.score).toBe(second!.score);
    expect([first!.spaceId, second!.spaceId]).toEqual(['z', 'a']);
  });

  it('then by space id, regardless of input order', () => {
    const ids = ['m', 'c', 'x', 'a'];
    const forward = rankWarehouseSpaces(
      request(),
      ids.map((id) => candidate({ id })),
    );
    const backward = rankWarehouseSpaces(
      request(),
      [...ids].reverse().map((id) => candidate({ id })),
    );
    expect(forward.map((m) => m.spaceId)).toEqual(['a', 'c', 'm', 'x']);
    expect(backward).toEqual(forward);
  });

  it(`caps results at ${MAX_RESULTS}, taking the price median over every feasible match first`, () => {
    const candidates = Array.from({ length: MAX_RESULTS + 5 }, (_, i) =>
      candidate({ id: `s${String(i).padStart(2, '0')}`, pricePerPalletPerPeriod: 10 + i }),
    );
    const matches = rankWarehouseSpaces(request(), candidates);
    expect(matches).toHaveLength(MAX_RESULTS);
    const allTotals = candidates.map((c) => c.space.pricePerPalletPerPeriod * 40);
    expect(matches[0]!.metrics.priceReference.amount).toBe(medianPrice(allTotals));
  });

  it('applies custom weights', () => {
    const weights = { location: 0, price: 0, capacityFit: 1, roomToExtend: 0 };
    const [match] = rankWarehouseSpaces(request(), [candidate()], weights);
    expect(match!.score).toBe(40);
    expect(WAREHOUSE_SCORE_WEIGHTS.location).toBe(0.35);
  });
});

describe('explainability', () => {
  it('publishes the scoring model in the response contract', () => {
    expect(WAREHOUSE_SCORING).toEqual({
      weights: WAREHOUSE_SCORE_WEIGHTS,
      locationReferenceMiles: 50,
      extensionFullCreditDays: 14,
      priceZeroScoreRatio: 1.5,
    });
    const response = { request: {}, scoring: WAREHOUSE_SCORING, matches: [] };
    expect(StorageMatchesResponseSchema.shape.scoring.parse(response.scoring)).toEqual(WAREHOUSE_SCORING);
  });

  it('explains location, dates, space and price in order, labelling estimates', () => {
    const c = candidate({ minPallets: 20, pricePerPalletPerPeriod: 16, handlingFeePerPallet: 8 }, straightFor(12));
    const { reasons } = scoreWarehouseSpace(request({ maxBudgetTotal: 1000 }), c).result;
    expect(reasons).toEqual([
      'Est. 12 mi from your location (your radius: 25 mi)',
      'Free for your whole 30-day stay; available for 21 more days if you need to extend',
      'Your 40 pallets take 40% of the 100 pallet positions offered (minimum block: 20)',
      'Est. total $960: $16 per pallet per month, prorated over 30 days, plus $8 per pallet handling (in and out); within your $1,000 budget',
    ]);
  });

  it('mentions required features (self-declared), no room to extend, and going over budget', () => {
    const r = request({ needsTemperatureControl: true, needsFoodGrade: true, maxBudgetTotal: 500 });
    const c = candidate({ temperatureControlled: true, foodGrade: true, availableTo: END }, 0);
    const { reasons } = scoreWarehouseSpace(r, c).result;
    expect(reasons).toEqual([
      'At your location (est. under 1 mi away)',
      "Free for your whole 30-day stay; availability ends on your move-out day, so there's no room to extend",
      'Your 40 pallets take 40% of the 100 pallet positions offered',
      'Offers the temperature-controlled, food-grade space you need (self-declared by the operator)',
      'Est. total $600: $15 per pallet per month, prorated over 30 days; est. $100 over your $500 budget',
    ]);
  });

  it('is deterministic: the same inputs give identical results', () => {
    const candidates = [candidate({ id: 'a' }, 3), candidate({ id: 'b', pricingPeriod: 'WEEK' }, 5)];
    expect(rankWarehouseSpaces(request(), candidates)).toEqual(rankWarehouseSpaces(request(), candidates));
  });
});
