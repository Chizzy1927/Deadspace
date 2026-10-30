import type { StorageMatchMetrics } from '@deadspace/shared';
import { describe, expect, it } from 'vitest';
import { STORAGE_HIGHLIGHT_THRESHOLDS } from '../../src/matching/config.js';
import { type StorageHighlightFacts, storageHighlights } from '../../src/matching/warehouse-highlights.js';

const metrics = (overrides: Partial<StorageMatchMetrics> = {}): StorageMatchMetrics => ({
  estDistanceMiles: 15,
  stayDays: 30,
  daysAfterEnd: 5,
  availableSpaceUsed: 0.4,
  pricingPeriodDays: 30,
  estStorageCost: 600,
  estHandlingCost: 0,
  estTotalCost: 600,
  priceReference: { basis: 'MATCH_MEDIAN', amount: 600 },
  ...overrides,
});

// Defaults trigger nothing: 15 est. mi in a 25 mi radius, at the median, 5 days to extend.
const facts = (
  m: Partial<StorageMatchMetrics> = {},
  f: Partial<StorageHighlightFacts> = {},
): StorageHighlightFacts => ({
  metrics: metrics(m),
  estDistanceMiles: 15,
  maxDistanceMiles: 25,
  feasibleMatches: 5,
  ...f,
});

const codes = (f: StorageHighlightFacts) => storageHighlights(f).map((h) => h.code);

describe('storageHighlights', () => {
  it('uses the configured thresholds', () => {
    expect(STORAGE_HIGHLIGHT_THRESHOLDS).toEqual({
      nearbyMaxMiles: 10,
      nearEdgeOfRadiusShare: 0.9,
      belowReferenceRatio: 0.9,
      minMatchesForMedian: 3,
      roomToExtendMinDays: 14,
    });
  });

  it('returns nothing when nothing stands out', () => {
    expect(codes(facts())).toEqual([]);
  });

  describe('location', () => {
    it('is NEARBY up to and including 10 est. mi', () => {
      expect(codes(facts({}, { estDistanceMiles: 10 }))).toEqual(['NEARBY']);
      expect(codes(facts({}, { estDistanceMiles: 10.01 }))).toEqual([]);
    });

    it('cautions NEAR_EDGE_OF_RADIUS from 90% of the radius', () => {
      expect(codes(facts({}, { estDistanceMiles: 22.5 }))).toEqual(['NEAR_EDGE_OF_RADIUS']);
      expect(codes(facts({}, { estDistanceMiles: 22.49 }))).toEqual([]);
    });

    it('prefers NEARBY over the edge caution for a small radius', () => {
      expect(codes(facts({}, { estDistanceMiles: 7.5, maxDistanceMiles: 8 }))).toEqual(['NEARBY']);
    });
  });

  describe('price', () => {
    const budget = (estTotalCost: number) => facts({ estTotalCost, priceReference: { basis: 'BUDGET', amount: 1000 } });

    it('cautions OVER_BUDGET with the est. overage', () => {
      expect(storageHighlights(budget(1100.5))).toEqual([
        { code: 'OVER_BUDGET', tone: 'caution', text: 'Est. $100.50 over your budget' },
      ]);
    });

    it('is UNDER_BUDGET at or below 90% of the budget, and silent between', () => {
      expect(storageHighlights(budget(900))).toEqual([
        { code: 'UNDER_BUDGET', tone: 'positive', text: 'Est. 10% under your budget' },
      ]);
      expect(codes(budget(950))).toEqual([]);
      expect(codes(budget(1000))).toEqual([]);
    });

    it('is BELOW_TYPICAL_PRICE without a budget only with at least 3 feasible matches', () => {
      expect(codes(facts({ estTotalCost: 540 }))).toEqual(['BELOW_TYPICAL_PRICE']);
      expect(codes(facts({ estTotalCost: 540 }, { feasibleMatches: 2 }))).toEqual([]);
      expect(codes(facts({ estTotalCost: 541 }))).toEqual([]);
    });
  });

  describe('room to extend', () => {
    it('cautions NO_ROOM_TO_EXTEND when availability ends on the move-out day', () => {
      expect(codes(facts({ daysAfterEnd: 0 }))).toEqual(['NO_ROOM_TO_EXTEND']);
      expect(codes(facts({ daysAfterEnd: 1 }))).toEqual([]);
    });

    it('is ROOM_TO_EXTEND from the 14 full-credit days', () => {
      expect(codes(facts({ daysAfterEnd: 13 }))).toEqual([]);
      expect(codes(facts({ daysAfterEnd: 14 }))).toEqual(['ROOM_TO_EXTEND']);
    });
  });

  it('puts cautions first and caps at two', () => {
    const f = facts(
      { daysAfterEnd: 0, estTotalCost: 1200, priceReference: { basis: 'BUDGET', amount: 1000 } },
      { estDistanceMiles: 3 },
    );
    expect(codes(f)).toEqual(['OVER_BUDGET', 'NO_ROOM_TO_EXTEND']);
    expect(codes(facts({ daysAfterEnd: 30, estTotalCost: 100 }, { estDistanceMiles: 3 }))).toEqual([
      'NEARBY',
      'BELOW_TYPICAL_PRICE',
    ]);
    expect(codes(facts({ daysAfterEnd: 0 }, { estDistanceMiles: 3 }))).toEqual(['NO_ROOM_TO_EXTEND', 'NEARBY']);
  });
});
