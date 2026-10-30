import { describe, expect, it } from 'vitest';
import {
  addDays,
  type CreateStorageRequestPayload,
  type CreateWarehouseSpacePayload,
  createStorageRequestInputSchema,
  createWarehouseSpaceInputSchema,
  daysBetween,
  STORAGE_POLICY,
  StorageRequestSchema,
  toCalendarDate,
  utcStartOfDay,
  WarehouseSpaceSchema,
} from '../src/index.js';

// Mid-afternoon UTC on 2026-06-01: "today" is 2026-06-01, and 2026-05-31 is still accepted
// (STORAGE_POLICY.todayToleranceDays) for users west of UTC.
const NOW = new Date('2026-06-01T15:00:00Z');
const spaceSchema = createWarehouseSpaceInputSchema(() => NOW);
const requestSchema = createStorageRequestInputSchema(() => NOW);

const dallas = { label: 'Dallas, TX, United States', lat: 32.7767, lng: -96.797 };

/** `YYYY-MM-DD`, `days` after 2026-06-01. */
const day = (days: number) => toCalendarDate(addDays(new Date('2026-06-01T00:00:00Z'), days));

const validSpace: CreateWarehouseSpacePayload = {
  companyName: 'Trinity Storage',
  contactName: 'Ana Ruiz',
  contactEmail: 'ana@example.com',
  location: dallas,
  quantityAvailable: 120,
  availableFrom: day(2),
  availableTo: day(62),
  pricingPeriod: 'MONTH',
  pricePerPalletPerPeriod: 18.5,
};

const validRequest: CreateStorageRequestPayload = {
  companyName: 'Acme Goods',
  contactName: 'Sam Lee',
  contactEmail: 'sam@example.com',
  location: dallas,
  pallets: 40,
  startDate: day(5),
  endDate: day(35),
};

function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }): string[] {
  return (result.error?.issues ?? []).map((i) => i.path.join('.'));
}

describe('calendar-day helpers', () => {
  it('counts whole days between UTC midnights, independent of DST and month length', () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    expect(daysBetween(d('2026-06-01'), d('2026-06-02'))).toBe(1);
    expect(daysBetween(d('2026-06-01'), d('2026-06-01'))).toBe(0);
    expect(daysBetween(d('2026-06-02'), d('2026-06-01'))).toBe(-1);
    expect(daysBetween(d('2026-02-01'), d('2026-03-01'))).toBe(28);
    // Spans the US DST change (2026-11-01); UTC has no DST, so still exact.
    expect(daysBetween(d('2026-10-30'), d('2026-11-30'))).toBe(31);
  });

  it('round-trips dates and finds the UTC day start', () => {
    expect(toCalendarDate(addDays(new Date('2026-12-31T00:00:00Z'), 1))).toBe('2027-01-01');
    expect(utcStartOfDay(new Date('2026-06-01T23:59:59.999Z'))).toEqual(new Date('2026-06-01T00:00:00Z'));
  });
});

describe('STORAGE_POLICY', () => {
  it('documents the V1 policy values the schemas enforce', () => {
    expect(STORAGE_POLICY).toEqual({
      maxAvailabilityDays: 180,
      maxDaysAhead: 90,
      maxStorageDays: 180,
      defaultMinStorageDays: 1,
      defaultMaxDistanceMiles: 25,
      maxDistanceMiles: 250,
      todayToleranceDays: 1,
    });
  });
});

describe('createWarehouseSpaceInputSchema', () => {
  it('parses calendar dates to UTC midnights and applies defaults', () => {
    const space = spaceSchema.parse(validSpace);
    expect(space.availableFrom).toEqual(new Date('2026-06-03T00:00:00Z'));
    expect(space.availableTo).toEqual(new Date('2026-08-02T00:00:00Z'));
    expect(space.minStorageDays).toBe(1);
    expect(space.temperatureControlled).toBe(false);
    expect(space.foodGrade).toBe(false);
    expect(space.minPallets).toBeUndefined();
    expect(space.handlingFeePerPallet).toBeUndefined();
  });

  it('accepts every optional field', () => {
    const space = spaceSchema.parse({
      ...validSpace,
      minPallets: 10,
      minStorageDays: 14,
      temperatureControlled: true,
      foodGrade: true,
      pricingPeriod: 'WEEK',
      handlingFeePerPallet: 9.75,
      notes: 'Dock 3',
    });
    expect(space).toMatchObject({ minPallets: 10, minStorageDays: 14, temperatureControlled: true, foodGrade: true });
  });

  it('rejects date-times and malformed dates (calendar dates only)', () => {
    expect(issuePaths(spaceSchema.safeParse({ ...validSpace, availableFrom: '2026-06-03T00:00:00Z' }))).toEqual([
      'availableFrom',
    ]);
    expect(issuePaths(spaceSchema.safeParse({ ...validSpace, availableTo: '2026-02-30' }))).toEqual(['availableTo']);
  });

  describe('availability start', () => {
    it('accepts today and yesterday (UTC tolerance) but not two days ago', () => {
      expect(spaceSchema.safeParse({ ...validSpace, availableFrom: day(0) }).success).toBe(true);
      expect(spaceSchema.safeParse({ ...validSpace, availableFrom: day(-1) }).success).toBe(true);
      expect(issuePaths(spaceSchema.safeParse({ ...validSpace, availableFrom: day(-2) }))).toEqual(['availableFrom']);
    });

    it('must begin within 90 days: day 90 is allowed, day 91 is not', () => {
      expect(spaceSchema.safeParse({ ...validSpace, availableFrom: day(90), availableTo: day(120) }).success).toBe(
        true,
      );
      expect(
        issuePaths(spaceSchema.safeParse({ ...validSpace, availableFrom: day(91), availableTo: day(120) })),
      ).toEqual(['availableFrom']);
    });
  });

  describe('availability window (availableTo − availableFrom days)', () => {
    it('must be at least 1 day: same-day from/to is rejected', () => {
      expect(issuePaths(spaceSchema.safeParse({ ...validSpace, availableTo: validSpace.availableFrom }))).toEqual([
        'availableTo',
      ]);
      expect(spaceSchema.safeParse({ ...validSpace, availableTo: day(3) }).success).toBe(true);
    });

    it('rejects availableTo before availableFrom', () => {
      expect(issuePaths(spaceSchema.safeParse({ ...validSpace, availableTo: day(1) }))).toEqual(['availableTo']);
    });

    it('allows exactly 180 days and rejects 181', () => {
      expect(spaceSchema.safeParse({ ...validSpace, availableTo: day(2 + 180) }).success).toBe(true);
      expect(issuePaths(spaceSchema.safeParse({ ...validSpace, availableTo: day(2 + 181) }))).toEqual(['availableTo']);
    });

    it('allows a minimum stay equal to the window but not one day longer', () => {
      // Window day(2) → day(32) = 30 days, so a 30-day stay fits exactly.
      const thirty = { ...validSpace, availableTo: day(32) };
      expect(spaceSchema.safeParse({ ...thirty, minStorageDays: 30 }).success).toBe(true);
      expect(issuePaths(spaceSchema.safeParse({ ...thirty, minStorageDays: 31 }))).toEqual(['minStorageDays']);
    });
  });

  it('rejects a minimum block larger than the space available, but allows equal', () => {
    expect(spaceSchema.safeParse({ ...validSpace, minPallets: 120 }).success).toBe(true);
    expect(issuePaths(spaceSchema.safeParse({ ...validSpace, minPallets: 121 }))).toEqual(['minPallets']);
  });

  it('bounds pallet counts and prices', () => {
    expect(issuePaths(spaceSchema.safeParse({ ...validSpace, quantityAvailable: 0 }))).toEqual(['quantityAvailable']);
    expect(issuePaths(spaceSchema.safeParse({ ...validSpace, quantityAvailable: 10_001 }))).toEqual([
      'quantityAvailable',
    ]);
    expect(issuePaths(spaceSchema.safeParse({ ...validSpace, quantityAvailable: 1.5 }))).toEqual(['quantityAvailable']);
    expect(issuePaths(spaceSchema.safeParse({ ...validSpace, pricePerPalletPerPeriod: 0 }))).toEqual([
      'pricePerPalletPerPeriod',
    ]);
    expect(issuePaths(spaceSchema.safeParse({ ...validSpace, handlingFeePerPallet: 1.234 }))).toEqual([
      'handlingFeePerPallet',
    ]);
  });

  it('drops hazmat and unit fields, which V1 does not model (unknown keys are stripped)', () => {
    const parsed = spaceSchema.parse({ ...validSpace, hazmatCertified: true, unit: 'FLOOR_SQFT' });
    expect(parsed).not.toHaveProperty('hazmatCertified');
    expect(parsed).not.toHaveProperty('unit');
  });
});

describe('createStorageRequestInputSchema', () => {
  it('parses dates and applies defaults (25 mi radius, no special requirements)', () => {
    const req = requestSchema.parse(validRequest);
    expect(req.startDate).toEqual(new Date('2026-06-06T00:00:00Z'));
    expect(req.endDate).toEqual(new Date('2026-07-06T00:00:00Z'));
    expect(req.maxDistanceMiles).toBe(25);
    expect(req.needsTemperatureControl).toBe(false);
    expect(req.needsFoodGrade).toBe(false);
    expect(req.maxBudgetTotal).toBeUndefined();
  });

  describe('stay length (endDate − startDate days; endDate is the move-out day)', () => {
    it('allows a 1-day stay and rejects moving out on the move-in day', () => {
      expect(requestSchema.safeParse({ ...validRequest, endDate: day(6) }).success).toBe(true);
      expect(issuePaths(requestSchema.safeParse({ ...validRequest, endDate: day(5) }))).toEqual(['endDate']);
      expect(issuePaths(requestSchema.safeParse({ ...validRequest, endDate: day(4) }))).toEqual(['endDate']);
    });

    it('allows exactly 180 days and rejects 181', () => {
      expect(requestSchema.safeParse({ ...validRequest, endDate: day(5 + 180) }).success).toBe(true);
      expect(issuePaths(requestSchema.safeParse({ ...validRequest, endDate: day(5 + 181) }))).toEqual(['endDate']);
    });
  });

  describe('start date', () => {
    it('accepts today and yesterday (UTC tolerance) but not two days ago', () => {
      expect(requestSchema.safeParse({ ...validRequest, startDate: day(0) }).success).toBe(true);
      expect(requestSchema.safeParse({ ...validRequest, startDate: day(-1) }).success).toBe(true);
      expect(issuePaths(requestSchema.safeParse({ ...validRequest, startDate: day(-2) }))).toEqual(['startDate']);
    });

    it('must be within 90 days: day 90 is allowed, day 91 is not', () => {
      expect(requestSchema.safeParse({ ...validRequest, startDate: day(90), endDate: day(100) }).success).toBe(true);
      expect(issuePaths(requestSchema.safeParse({ ...validRequest, startDate: day(91), endDate: day(100) }))).toEqual([
        'startDate',
      ]);
    });

    it('treats "today" as the UTC day of the clock, not a 24-hour offset', () => {
      // Just after UTC midnight on 2026-06-02: 2026-06-01 is now "yesterday" (still tolerated),
      // 2026-05-31 is two days back.
      const early = createStorageRequestInputSchema(() => new Date('2026-06-02T00:05:00Z'));
      expect(early.safeParse({ ...validRequest, startDate: day(0) }).success).toBe(true);
      expect(issuePaths(early.safeParse({ ...validRequest, startDate: day(-1) }))).toEqual(['startDate']);
    });
  });

  it('bounds the search radius to 1–250 est. miles', () => {
    expect(requestSchema.safeParse({ ...validRequest, maxDistanceMiles: 250 }).success).toBe(true);
    expect(requestSchema.safeParse({ ...validRequest, maxDistanceMiles: 1 }).success).toBe(true);
    expect(issuePaths(requestSchema.safeParse({ ...validRequest, maxDistanceMiles: 251 }))).toEqual([
      'maxDistanceMiles',
    ]);
    expect(issuePaths(requestSchema.safeParse({ ...validRequest, maxDistanceMiles: 0 }))).toEqual(['maxDistanceMiles']);
  });

  it('accepts requirements and an exact budget', () => {
    const req = requestSchema.parse({
      ...validRequest,
      needsTemperatureControl: true,
      needsFoodGrade: true,
      maxBudgetTotal: 1234.56,
    });
    expect(req).toMatchObject({ needsTemperatureControl: true, needsFoodGrade: true, maxBudgetTotal: 1234.56 });
  });

  it('reports field errors without running date rules on unparsed values', () => {
    expect(issuePaths(requestSchema.safeParse({ ...validRequest, startDate: 'soon', pallets: 0 })).sort()).toEqual([
      'pallets',
      'startDate',
    ]);
  });
});

describe('response schemas', () => {
  const meta = {
    id: 'cabc123',
    status: 'ACTIVE',
    createdAt: '2026-06-01T15:00:00.000Z',
    updatedAt: '2026-06-01T15:00:00.000Z',
    companyName: 'X',
    contactName: 'Y',
    contactEmail: 'y@example.com',
    location: dallas,
  } as const;

  it('describe warehouse spaces and storage requests with calendar-date strings', () => {
    expect(
      WarehouseSpaceSchema.safeParse({
        ...meta,
        quantityAvailable: 120,
        minPallets: null,
        availableFrom: '2026-06-03',
        availableTo: '2026-08-02',
        minStorageDays: 1,
        temperatureControlled: false,
        foodGrade: false,
        pricingPeriod: 'MONTH',
        pricePerPalletPerPeriod: 18.5,
        handlingFeePerPallet: null,
        notes: null,
      }).success,
    ).toBe(true);
    expect(
      StorageRequestSchema.safeParse({
        ...meta,
        maxDistanceMiles: 25,
        pallets: 40,
        startDate: '2026-06-06',
        endDate: '2026-07-06T00:00:00Z',
        needsTemperatureControl: false,
        needsFoodGrade: false,
        maxBudgetTotal: null,
        notes: null,
      }).success,
    ).toBe(false);
  });
});
