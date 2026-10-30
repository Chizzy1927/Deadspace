import type { TruckMatchMetrics } from '@deadspace/shared';
import { describe, expect, it } from 'vitest';
import { type HighlightFacts, truckHighlights } from '../../src/matching/truck-highlights.js';

const round1 = (n: number) => Math.round(n * 10) / 10;

// A neutral match: mid-range detour, price at the reference, modest capacity use, mid slack.
// None of these values triggers a highlight, so each test changes only what it exercises.
const metrics = (overrides: Partial<TruckMatchMetrics> = {}): TruckMatchMetrics => ({
  estDirectLegMiles: 270,
  estAdditionalMiles: 40,
  estLoadedMiles: 270,
  estEmptyMilesRecovered: null,
  sparePallets: 12,
  spareWeightLbs: 22_000,
  palletUtilisation: { before: 0.5, after: 0.6 },
  weightUtilisation: { before: 0.5, after: 0.6 },
  limitingCapacity: 'PALLETS',
  estPrice: 700,
  spareCapacityUsed: 0.5,
  estScheduleSlackHours: 3,
  scheduleLimitedBy: 'PICKUP_WINDOW',
  priceReference: { basis: 'MATCH_MEDIAN', amount: 700 },
  ...overrides,
});

interface FactOverrides extends Partial<TruckMatchMetrics> {
  /** Unrounded est. additional miles; the metric gets it rounded to 0.1, as the matcher does. */
  miles?: number;
  /** Unrounded est. slack hours; the metric gets it rounded to 0.1, as the matcher does. */
  slack?: number;
  feasible?: number;
}
const facts = ({ miles = 40, slack = 3, feasible = 5, ...overrides }: FactOverrides = {}): HighlightFacts => ({
  metrics: metrics({ estAdditionalMiles: round1(miles), estScheduleSlackHours: round1(slack), ...overrides }),
  estAdditionalMiles: miles,
  scheduleSlackHours: slack,
  feasibleMatches: feasible,
});
const budget = (amount: number) => ({ basis: 'BUDGET', amount }) as const;
const median = (amount: number) => ({ basis: 'MATCH_MEDIAN', amount }) as const;
const codes = (overrides: FactOverrides = {}) => truckHighlights(facts(overrides)).map((h) => h.code);

describe('truckHighlights', () => {
  it('returns nothing for an unremarkable match', () => {
    expect(truckHighlights(facts())).toEqual([]);
  });

  describe('route (unrounded est. additional miles)', () => {
    it('ON_ROUTE below 5, NEAR_ROUTE from 5', () => {
      expect(truckHighlights(facts({ miles: 4.4 }))).toEqual([
        { code: 'ON_ROUTE', tone: 'positive', text: "On the carrier's planned route" },
      ]);
      expect(codes({ miles: 4.9 })).toEqual(['ON_ROUTE']);
      expect(codes({ miles: 5.0 })).toEqual(['NEAR_ROUTE']);
    });

    it('NEAR_ROUTE up to and including 25, nothing just above', () => {
      expect(truckHighlights(facts({ miles: 24.9 }))).toEqual([
        { code: 'NEAR_ROUTE', tone: 'positive', text: 'Short detour from the planned route' },
      ]);
      expect(codes({ miles: 25.0 })).toEqual(['NEAR_ROUTE']);
      expect(codes({ miles: 25.1 })).toEqual([]);
    });

    it('no route highlight between 25 and 60', () => {
      expect(codes({ miles: 40 })).toEqual([]);
      expect(codes({ miles: 59.9 })).toEqual([]);
    });

    it('LARGE_DETOUR caution from 60', () => {
      expect(truckHighlights(facts({ miles: 60.0 }))).toEqual([
        { code: 'LARGE_DETOUR', tone: 'caution', text: 'Large detour from the planned route' },
      ]);
    });

    it('classifies on the raw value, even where display rounding would cross a boundary', () => {
      // 4.96 and 4.999 display as 5 mi (metric 5.0) but are below 5: still ON_ROUTE.
      expect(codes({ miles: 4.96 })).toEqual(['ON_ROUTE']);
      expect(codes({ miles: 4.999 })).toEqual(['ON_ROUTE']);
      // 25.04 is rounded to a 25.0 metric but is above 25: no route highlight.
      expect(codes({ miles: 25.04 })).toEqual([]);
      // 59.96 is rounded to a 60.0 metric and displays as 60 mi, but is below 60: no caution.
      expect(codes({ miles: 59.96 })).toEqual([]);
    });

    it('ignores the rounded metric entirely', () => {
      // Deliberately inconsistent inputs: only the raw value decides.
      const f = { ...facts({ miles: 4.9 }), metrics: metrics({ estAdditionalMiles: 70 }) };
      expect(truckHighlights(f).map((h) => h.code)).toEqual(['ON_ROUTE']);
    });
  });

  describe('price', () => {
    it('UNDER_BUDGET at or below 90% of the budget', () => {
      expect(truckHighlights(facts({ estPrice: 630, priceReference: budget(700) }))).toEqual([
        { code: 'UNDER_BUDGET', tone: 'positive', text: 'Est. 10% under your budget' },
      ]);
      expect(codes({ estPrice: 630.01, priceReference: budget(700) })).toEqual([]);
    });

    it('OVER_BUDGET caution above the budget, none at exactly the budget', () => {
      expect(codes({ estPrice: 700, priceReference: budget(700) })).toEqual([]);
      expect(truckHighlights(facts({ estPrice: 700.5, priceReference: budget(700) }))).toEqual([
        { code: 'OVER_BUDGET', tone: 'caution', text: 'Est. $0.50 over your budget' },
      ]);
    });

    it('with a budget, never adds a median comparison', () => {
      // Far below the budget, but it's the budget that's compared, so only UNDER_BUDGET.
      expect(codes({ estPrice: 300, priceReference: budget(700) })).toEqual(['UNDER_BUDGET']);
    });

    it('BELOW_TYPICAL_PRICE at or below 90% of the median, with short chip text', () => {
      expect(truckHighlights(facts({ estPrice: 630, priceReference: median(700), feasible: 3 }))).toEqual([
        { code: 'BELOW_TYPICAL_PRICE', tone: 'positive', text: 'Below typical match price' },
      ]);
      expect(codes({ estPrice: 630.01, priceReference: median(700), feasible: 3 })).toEqual([]);
    });

    it('BELOW_TYPICAL_PRICE needs at least 3 feasible matches', () => {
      expect(codes({ estPrice: 300, priceReference: median(700), feasible: 2 })).toEqual([]);
      expect(codes({ estPrice: 300, priceReference: median(700), feasible: 3 })).toEqual(['BELOW_TYPICAL_PRICE']);
    });

    it('never flags a price above the median', () => {
      expect(codes({ estPrice: 1_150, priceReference: median(670) })).toEqual([]);
    });
  });

  describe('capacity (share of spare room, not trailer fill)', () => {
    it('USES_MOST_SPARE_CAPACITY at 75% of spare room or more', () => {
      expect(codes({ spareCapacityUsed: 0.749 })).toEqual([]);
      expect(truckHighlights(facts({ spareCapacityUsed: 0.75 }))).toEqual([
        { code: 'USES_MOST_SPARE_CAPACITY', tone: 'positive', text: "Uses most of this truck's available capacity" },
      ]);
    });

    it('ignores how full the trailer ends up', () => {
      const nearlyFull = { before: 0.9, after: 0.99 };
      expect(codes({ spareCapacityUsed: 0.5, palletUtilisation: nearlyFull })).toEqual([]);
    });
  });

  describe('timing (unrounded est. slack hours)', () => {
    it('TIGHT_SCHEDULE caution below 2 h', () => {
      expect(truckHighlights(facts({ slack: 1.9, scheduleLimitedBy: 'DELIVER_BY' }))).toEqual([
        { code: 'TIGHT_SCHEDULE', tone: 'caution', text: 'Tight estimated schedule' },
      ]);
      expect(codes({ slack: 2 })).toEqual([]);
    });

    it('COMFORTABLE_SCHEDULE from 4 h', () => {
      expect(codes({ slack: 3.9 })).toEqual([]);
      expect(truckHighlights(facts({ slack: 4 }))).toEqual([
        { code: 'COMFORTABLE_SCHEDULE', tone: 'positive', text: 'Comfortable estimated schedule' },
      ]);
    });

    it('classifies on the raw value, even where display rounding would cross a boundary', () => {
      // 1.96 h displays as 2.0 h but is below 2: still tight.
      expect(codes({ slack: 1.96 })).toEqual(['TIGHT_SCHEDULE']);
      // 3.96 h displays as 4.0 h but is below 4: not yet comfortable.
      expect(codes({ slack: 3.96 })).toEqual([]);
    });
  });

  describe('selection', () => {
    it('keeps at most two, in route → price → capacity → timing order', () => {
      const allPositive = { miles: 0, estPrice: 300, spareCapacityUsed: 1, slack: 8 };
      expect(codes(allPositive)).toEqual(['ON_ROUTE', 'BELOW_TYPICAL_PRICE']);
      expect(codes({ ...allPositive, estPrice: 700 })).toEqual(['ON_ROUTE', 'USES_MOST_SPARE_CAPACITY']);
    });

    it('puts cautions before positives so they are never crowded out', () => {
      const m = { miles: 0, spareCapacityUsed: 1, slack: 0.5 };
      expect(codes(m)).toEqual(['TIGHT_SCHEDULE', 'ON_ROUTE']);
      expect(codes({ ...m, estPrice: 800, priceReference: budget(700) })).toEqual(['OVER_BUDGET', 'TIGHT_SCHEDULE']);
    });

    it('is deterministic', () => {
      const f = facts({ miles: 0, slack: 8 });
      expect(truckHighlights(f)).toEqual(truckHighlights(f));
    });
  });
});
