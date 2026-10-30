import { describe, expect, it } from 'vitest';
import {
  ROUTE_EFFICIENCY_REFERENCE_MILES,
  TIMING_FULL_SLACK_HOURS,
  TRUCK_SCORE_WEIGHTS,
} from '../../src/matching/config.js';
import {
  capacityFit,
  medianPrice,
  priceReference,
  priceScore,
  routeEfficiency,
  timingScore,
  weightedScore,
} from '../../src/matching/truck-score.js';

describe('config', () => {
  it('uses the approved Phase 3 reference values', () => {
    expect(ROUTE_EFFICIENCY_REFERENCE_MILES).toBe(100);
    expect(TIMING_FULL_SLACK_HOURS).toBe(4);
  });

  it('has weights that sum to 1, with route efficiency dominant', () => {
    const { routeEfficiency: route, capacityFit: capacity, price, timing } = TRUCK_SCORE_WEIGHTS;
    expect(route + capacity + price + timing).toBeCloseTo(1, 10);
    expect(route).toBeGreaterThan(capacity + price + timing);
  });
});

describe('routeEfficiency: 1 − est. additional miles / reference, clamped', () => {
  it.each([
    [0, 1],
    [25, 0.75],
    [100, 0],
    [150, 0],
  ])('%s est. additional miles → %s', (miles, expected) => {
    expect(routeEfficiency(miles)).toBeCloseTo(expected, 10);
  });
});

describe('capacityFit: share of the spare room the request takes, limiting dimension', () => {
  it.each([
    // [case, requested, spare, expected]
    [
      'EMPTY 26-pallet truck, 6-pallet request',
      { pallets: 6, weightLbs: 9_000 },
      { pallets: 26, weightLbs: 44_000 },
      6 / 26,
    ],
    ['PARTIAL truck with 8 spare pallets', { pallets: 6, weightLbs: 9_000 }, { pallets: 8, weightLbs: 14_000 }, 0.75],
    ['EMPTY truck nearly filled', { pallets: 24, weightLbs: 9_000 }, { pallets: 26, weightLbs: 44_000 }, 24 / 26],
    [
      'PARTIAL truck with substantial spare room',
      { pallets: 6, weightLbs: 9_000 },
      { pallets: 12, weightLbs: 22_000 },
      0.5,
    ],
    [
      'weight-limited (heavy, few pallets)',
      { pallets: 4, weightLbs: 30_000 },
      { pallets: 16, weightLbs: 36_000 },
      30 / 36,
    ],
  ] as const)('%s', (_case, requested, spare, expected) => {
    expect(capacityFit(requested, spare)).toBeCloseTo(expected, 10);
  });

  it('is pallet-limited when pallets are the scarcer spare dimension', () => {
    expect(capacityFit({ pallets: 6, weightLbs: 2_000 }, { pallets: 8, weightLbs: 40_000 })).toBe(0.75);
  });

  it('is 1 when the request takes all the spare room in either dimension', () => {
    expect(capacityFit({ pallets: 6, weightLbs: 9_000 }, { pallets: 6, weightLbs: 30_000 })).toBe(1);
    expect(capacityFit({ pallets: 2, weightLbs: 9_000 }, { pallets: 20, weightLbs: 9_000 })).toBe(1);
  });
});

describe('price', () => {
  const SEED_PRICES = [567, 647, 650, 690, 700, 1_150];
  const scores = (prices: number[], reference: number) => prices.map((p) => priceScore(p, reference));
  /** "Barely moves": an outlier shifts every other leg's final score by under half a point. */
  const expectNegligibleShift = (after: number[], before: number[]) =>
    after.forEach((score, i) =>
      expect(100 * TRUCK_SCORE_WEIGHTS.price * Math.abs(score - (before[i] ?? 0))).toBeLessThan(0.5),
    );

  it('scores 1 at half the reference or less, 0.5 at the reference, 0 at 1.5× or more', () => {
    expect(priceScore(300, 700)).toBe(1);
    expect(priceScore(350, 700)).toBe(1);
    expect(priceScore(700, 700)).toBe(0.5);
    expect(priceScore(1_050, 700)).toBeCloseTo(0, 10);
    expect(priceScore(2_000, 700)).toBe(0);
  });

  it('takes the median of an odd or even number of prices, regardless of order', () => {
    expect(medianPrice([700, 500, 600])).toBe(600);
    expect(medianPrice([700, 500, 600, 900])).toBe(650);
    expect(() => medianPrice([])).toThrow();
  });

  it('uses the budget as the reference when given, otherwise the median of feasible prices', () => {
    expect(priceReference(500, SEED_PRICES)).toBe(500);
    expect(priceReference(null, SEED_PRICES)).toBe(670);
  });

  it('is neutral (0.5) for a single match with no budget', () => {
    expect(priceScore(650, priceReference(null, [650]))).toBe(0.5);
  });

  it('spreads two very different prices across the full range', () => {
    expect(scores([500, 1_500], priceReference(null, [500, 1_500]))).toEqual([1, 0]);
  });

  it('separates two close prices only slightly', () => {
    const [cheaper = 0, dearer = 0] = scores([600, 700], priceReference(null, [600, 700]));
    expect(cheaper).toBeCloseTo(1.5 - 600 / 650, 10);
    expect(dearer).toBeCloseTo(1.5 - 700 / 650, 10);
    expect(cheaper - dearer).toBeLessThan(0.16);
  });

  it('caps an extreme low outlier at 1 and barely moves everyone else', () => {
    const baseline = scores(SEED_PRICES, priceReference(null, SEED_PRICES));
    const withOutlier = [50, ...SEED_PRICES];
    expect(priceReference(null, withOutlier)).toBe(650);
    const [outlier, ...rest] = scores(withOutlier, priceReference(null, withOutlier));
    expect(outlier).toBe(1);
    expectNegligibleShift(rest, baseline);
  });

  it('floors an extreme high outlier at 0 and barely moves everyone else', () => {
    const baseline = scores(SEED_PRICES, priceReference(null, SEED_PRICES));
    const withOutlier = [...SEED_PRICES, 5_000];
    expect(priceReference(null, withOutlier)).toBe(690);
    const result = scores(withOutlier, priceReference(null, withOutlier));
    expect(result.at(-1)).toBe(0);
    expectNegligibleShift(result.slice(0, -1), baseline);
  });

  it('keeps cheaper-is-better ordering when most matches exceed the budget', () => {
    const result = scores(SEED_PRICES, priceReference(500, SEED_PRICES));
    expect(result[0]).toBeCloseTo(1.5 - 567 / 500, 10);
    expect(result.every((score) => score < 0.5)).toBe(true);
    for (let i = 1; i < result.length; i++) expect(result[i]).toBeLessThanOrEqual(result[i - 1] ?? 0);
    expect(result.at(-1)).toBe(0);
  });

  it('stops separating matches when all are at least 1.5× the budget (known, accepted)', () => {
    expect(scores(SEED_PRICES, priceReference(300, SEED_PRICES))).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('timingScore: tightest est. schedule slack / full-credit hours, clamped', () => {
  it.each([
    [0, 0],
    [1, 0.25],
    [2, 0.5],
    [4, 1],
    [9.4, 1],
    [-0.5, 0],
  ])('%s h of slack → %s', (hours, expected) => {
    expect(timingScore(hours)).toBe(expected);
  });
});

describe('weightedScore', () => {
  it('combines components with the configured weights into a rounded 0–100 score', () => {
    // 100 × (0.55 × 0.775 + 0.15 × 0.25 + 0.15 × 0.5 + 0.15 × 1) = 68.875
    expect(weightedScore({ routeEfficiency: 0.775, capacityFit: 0.25, price: 0.5, timing: 1 })).toBe(69);
    expect(weightedScore({ routeEfficiency: 1, capacityFit: 1, price: 1, timing: 1 })).toBe(100);
    expect(weightedScore({ routeEfficiency: 0, capacityFit: 0, price: 0, timing: 0 })).toBe(0);
  });

  it('uses custom weights when given', () => {
    const components = { routeEfficiency: 0.775, capacityFit: 0.25, price: 0.5, timing: 1 };
    expect(weightedScore(components, { routeEfficiency: 1, capacityFit: 0, price: 0, timing: 0 })).toBe(78);
    expect(weightedScore(components, { routeEfficiency: 0, capacityFit: 0, price: 1, timing: 0 })).toBe(50);
  });
});
