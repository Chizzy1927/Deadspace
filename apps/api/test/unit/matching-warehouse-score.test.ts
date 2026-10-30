import { describe, expect, it } from 'vitest';
import {
  EXTENSION_FULL_CREDIT_DAYS,
  LOCATION_REFERENCE_MILES,
  PRICING_PERIOD_DAYS,
  WAREHOUSE_SCORE_WEIGHTS,
} from '../../src/matching/config.js';
import { estStayCost, type WarehouseSpaceFacts } from '../../src/matching/warehouse.js';
import {
  locationScore,
  roomToExtendScore,
  storageCapacityFit,
  weightedWarehouseScore,
} from '../../src/matching/warehouse-score.js';

const space = (overrides: Partial<WarehouseSpaceFacts> = {}): WarehouseSpaceFacts => ({
  id: 'space-a',
  status: 'ACTIVE',
  quantityAvailable: 100,
  minPallets: null,
  availableFrom: new Date('2026-11-01T00:00:00Z'),
  availableTo: new Date('2026-12-31T00:00:00Z'),
  minStorageDays: 1,
  temperatureControlled: false,
  foodGrade: false,
  pricingPeriod: 'MONTH',
  pricePerPalletPerPeriod: 15,
  handlingFeePerPallet: null,
  ...overrides,
});

describe('config', () => {
  it('uses the approved Phase 4 weights and references', () => {
    expect(WAREHOUSE_SCORE_WEIGHTS).toEqual({ location: 0.35, price: 0.35, capacityFit: 0.15, roomToExtend: 0.15 });
    expect(LOCATION_REFERENCE_MILES).toBe(50);
    expect(EXTENSION_FULL_CREDIT_DAYS).toBe(14);
    expect(PRICING_PERIOD_DAYS).toEqual({ DAY: 1, WEEK: 7, MONTH: 30 });
  });

  it('has weights that sum to 1', () => {
    const sum = Object.values(WAREHOUSE_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });
});

describe('locationScore: 1 − est. distance / 50 mi, clamped', () => {
  it.each([
    [0, 1],
    [12.5, 0.75],
    [25, 0.5],
    [50, 0],
    [50.1, 0],
    [120, 0],
  ])('%s est. mi → %s', (estMiles, expected) => {
    expect(locationScore(estMiles)).toBeCloseTo(expected, 10);
  });
});

describe('storageCapacityFit: pallets / free pallet positions', () => {
  it.each([
    [40, 100, 0.4],
    [100, 100, 1],
    [1, 10_000, 0.0001],
  ])('%s of %s → %s', (pallets, available, expected) => {
    expect(storageCapacityFit(pallets, available)).toBeCloseTo(expected, 10);
  });
});

describe('roomToExtendScore: days after move-out / 14, clamped', () => {
  it.each([
    [0, 0],
    [1, 1 / 14],
    [7, 0.5],
    [13, 13 / 14],
    [14, 1],
    [15, 1],
    [150, 1],
  ])('%s days → %s', (days, expected) => {
    expect(roomToExtendScore(days)).toBeCloseTo(expected, 10);
  });
});

describe('estStayCost: rate prorated by day, plus the combined handling fee', () => {
  it('prorates DAY, WEEK and MONTH rates over the stay', () => {
    expect(estStayCost(space({ pricingPeriod: 'DAY', pricePerPalletPerPeriod: 0.85 }), 40, 30)).toEqual({
      pricingPeriodDays: 1,
      storage: 1020,
      handling: 0,
      total: 1020,
    });
    expect(estStayCost(space({ pricingPeriod: 'WEEK', pricePerPalletPerPeriod: 5.25 }), 40, 30)).toEqual({
      pricingPeriodDays: 7,
      storage: 900,
      handling: 0,
      total: 900,
    });
    expect(estStayCost(space({ pricingPeriod: 'MONTH', pricePerPalletPerPeriod: 16 }), 40, 30)).toEqual({
      pricingPeriodDays: 30,
      storage: 640,
      handling: 0,
      total: 640,
    });
  });

  it('treats equal per-day rates the same whatever the quoted period', () => {
    const day = estStayCost(space({ pricingPeriod: 'DAY', pricePerPalletPerPeriod: 1 }), 10, 45);
    const week = estStayCost(space({ pricingPeriod: 'WEEK', pricePerPalletPerPeriod: 7 }), 10, 45);
    const month = estStayCost(space({ pricingPeriod: 'MONTH', pricePerPalletPerPeriod: 30 }), 10, 45);
    expect(day.total).toBe(450);
    expect(week.total).toBe(450);
    expect(month.total).toBe(450);
  });

  it('does not round a partial period up to a whole one', () => {
    // 45 days of a monthly rate is 1.5 months, not 2.
    expect(estStayCost(space({ pricingPeriod: 'MONTH', pricePerPalletPerPeriod: 30 }), 10, 45).storage).toBe(450);
    expect(estStayCost(space({ pricingPeriod: 'WEEK', pricePerPalletPerPeriod: 7 }), 1, 1).storage).toBe(1);
  });

  it('adds the handling fee once per pallet (in and out combined), independent of stay length', () => {
    const short = estStayCost(space({ pricePerPalletPerPeriod: 16, handlingFeePerPallet: 8 }), 40, 30);
    expect(short).toEqual({ pricingPeriodDays: 30, storage: 640, handling: 320, total: 960 });
    const long = estStayCost(space({ pricePerPalletPerPeriod: 16, handlingFeePerPallet: 8 }), 40, 60);
    expect(long.handling).toBe(320);
    expect(long.total).toBe(1280 + 320);
  });

  it('rounds each part and the total to cents', () => {
    // 5 × 3 × 10 / 7 = 21.428… → 21.43; 0.33 × 3 = 0.99 (0.9900000000000001 in floating point).
    const cost = estStayCost(
      space({ pricingPeriod: 'WEEK', pricePerPalletPerPeriod: 5, handlingFeePerPallet: 0.33 }),
      3,
      10,
    );
    expect(cost.storage).toBe(21.43);
    expect(cost.handling).toBe(0.99);
    expect(cost.total).toBe(22.42);
  });
});

describe('weightedWarehouseScore', () => {
  it('combines components with the configured weights into a rounded 0–100 score', () => {
    expect(weightedWarehouseScore({ location: 1, price: 1, capacityFit: 1, roomToExtend: 1 })).toBe(100);
    expect(weightedWarehouseScore({ location: 0, price: 0, capacityFit: 0, roomToExtend: 0 })).toBe(0);
    // 100 × (0.35 × 0.6 + 0.35 × 0.6 + 0.15 × 0.4 + 0.15 × 0.2) = 21 + 21 + 6 + 3 = 51.
    expect(weightedWarehouseScore({ location: 0.6, price: 0.6, capacityFit: 0.4, roomToExtend: 0.2 })).toBe(51);
    expect(weightedWarehouseScore({ location: 1, price: 0, capacityFit: 0, roomToExtend: 0 })).toBe(35);
    expect(weightedWarehouseScore({ location: 0, price: 1, capacityFit: 0, roomToExtend: 0 })).toBe(35);
    expect(weightedWarehouseScore({ location: 0, price: 0, capacityFit: 1, roomToExtend: 0 })).toBe(15);
    expect(weightedWarehouseScore({ location: 0, price: 0, capacityFit: 0, roomToExtend: 1 })).toBe(15);
  });

  it('uses custom weights when given', () => {
    const weights = { location: 1, price: 0, capacityFit: 0, roomToExtend: 0 };
    expect(weightedWarehouseScore({ location: 0.42, price: 1, capacityFit: 1, roomToExtend: 1 }, weights)).toBe(42);
  });
});
