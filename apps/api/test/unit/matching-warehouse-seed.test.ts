// The seeded warehouse set against the reference Dallas request it was shaped for (see
// prisma/seed-data/warehouse-spaces.ts). Haversine distances stand in for PostGIS here (within
// ~0.5%); no seeded site is close enough to the 25 mi radius for that to matter. The same scenario
// runs through real PostGIS in test/integration/warehouse-candidates.test.ts.
import { addDays, straightLineMiles } from '@deadspace/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildSeedWarehouseSpaces, type SeedWarehouseSpace } from '../../prisma/seed-data/warehouse-spaces.js';
import { MockGeocoder } from '../../src/geocoding/mock.js';
import {
  checkWarehouseFeasibility,
  rankWarehouseSpaces,
  type StorageMatchRequest,
  type WarehouseCandidate,
} from '../../src/matching/warehouse.js';

const ANCHOR = new Date('2026-06-02T00:00:00Z');
const DALLAS = { lat: 32.7767, lng: -96.797 };

// 40 pallets, move in on day 7 and out on day 37, 25 est. mi radius.
const reference = (overrides: Partial<StorageMatchRequest> = {}): StorageMatchRequest => ({
  maxDistanceMiles: 25,
  pallets: 40,
  startDate: addDays(ANCHOR, 7),
  endDate: addDays(ANCHOR, 37),
  needsTemperatureControl: false,
  needsFoodGrade: false,
  maxBudgetTotal: null,
  ...overrides,
});

const toCandidate = ({ id, input }: SeedWarehouseSpace): WarehouseCandidate => ({
  space: {
    id,
    status: 'ACTIVE',
    quantityAvailable: input.quantityAvailable,
    minPallets: input.minPallets ?? null,
    availableFrom: input.availableFrom,
    availableTo: input.availableTo,
    minStorageDays: input.minStorageDays,
    temperatureControlled: input.temperatureControlled,
    foodGrade: input.foodGrade,
    pricingPeriod: input.pricingPeriod,
    pricePerPalletPerPeriod: input.pricePerPalletPerPeriod,
    handlingFeePerPallet: input.handlingFeePerPallet ?? null,
  },
  straightLineMiles: straightLineMiles(DALLAS, input.location),
});

let candidates: WarehouseCandidate[];
beforeAll(async () => {
  candidates = (await buildSeedWarehouseSpaces(ANCHOR, new MockGeocoder())).map(toCandidate);
});

const id = (key: string) => `seed-warehouse-space-${key}`;

describe('seeded warehouses vs. the reference Dallas request', () => {
  it('excludes each seeded edge case for the intended reason', () => {
    const rejections = Object.fromEntries(
      candidates.map((c) => [c.space.id, checkWarehouseFeasibility(reference(), c)]),
    );
    expect(rejections).toEqual({
      [id('01')]: [],
      [id('02')]: [],
      [id('03')]: [],
      [id('04')]: [],
      [id('05')]: ['BELOW_MIN_PALLETS'],
      [id('06')]: ['INSUFFICIENT_PALLETS'],
      [id('07')]: ['BELOW_MIN_DURATION'],
      [id('08')]: ['WINDOW_NOT_COVERED'],
      [id('09')]: ['WINDOW_NOT_COVERED'],
      [id('10')]: ['TOO_FAR'],
      [id('11')]: ['TOO_FAR'],
      [id('12')]: ['TOO_FAR'],
      [id('13')]: ['TOO_FAR'],
      // Regional sites; some also fail a second rule (every violation is reported).
      [id('14')]: ['TOO_FAR', 'WINDOW_NOT_COVERED'],
      [id('15')]: ['TOO_FAR'],
      [id('16')]: ['TOO_FAR', 'WINDOW_NOT_COVERED'],
      [id('17')]: ['TOO_FAR', 'BELOW_MIN_PALLETS'],
    });
  });

  it('ranks the feasible sites with explainable metrics', () => {
    const matches = rankWarehouseSpaces(reference(), candidates);
    expect(matches.map((m) => [m.spaceId, m.score])).toEqual([
      [id('01'), 72],
      [id('04'), 65],
      [id('02'), 59],
      [id('03'), 49],
    ]);
    const byId = Object.fromEntries(matches.map((m) => [m.spaceId, m]));
    // Median of the est. totals 900, 960, 1020, 1760.
    for (const m of matches) expect(m.metrics.priceReference).toEqual({ basis: 'MATCH_MEDIAN', amount: 990 });
    expect(byId[id('01')]!.metrics).toMatchObject({ estStorageCost: 640, estHandlingCost: 320, estTotalCost: 960 });
    expect(byId[id('02')]!.metrics).toMatchObject({ estTotalCost: 900, daysAfterEnd: 3, pricingPeriodDays: 7 });
    expect(byId[id('03')]!.metrics).toMatchObject({ estTotalCost: 1760, estHandlingCost: 480 });
    expect(byId[id('04')]!.metrics).toMatchObject({ estTotalCost: 1020, pricingPeriodDays: 1 });
    // The cold store's premium price earns no price credit, but it stays feasible.
    expect(byId[id('03')]!.breakdown.price).toBe(0);
  });

  it('keeps only compatible space when features are required', () => {
    const cold = rankWarehouseSpaces(reference({ needsTemperatureControl: true }), candidates);
    expect(cold.map((m) => m.spaceId)).toEqual([id('03')]);
    const food = rankWarehouseSpaces(reference({ needsFoodGrade: true, maxDistanceMiles: 50 }), candidates);
    expect(food.map((m) => m.spaceId).sort()).toEqual([id('03'), id('11')]);
  });

  it('adds Fort Worth and Denton with a 50 mi radius without changing the nearby scores', () => {
    const narrow = rankWarehouseSpaces(reference(), candidates);
    const wide = rankWarehouseSpaces(reference({ maxDistanceMiles: 50 }), candidates);
    expect(wide.map((m) => m.spaceId)).toEqual(expect.arrayContaining([id('10'), id('11')]));
    for (const m of narrow) {
      const same = wide.find((w) => w.spaceId === m.spaceId)!;
      expect(same.breakdown.location).toBe(m.breakdown.location);
      expect(same.breakdown.capacityFit).toBe(m.breakdown.capacityFit);
      expect(same.breakdown.roomToExtend).toBe(m.breakdown.roomToExtend);
    }
  });
});
