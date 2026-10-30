import { addDays, STORAGE_POLICY, toCalendarDate, utcStartOfDay } from '@deadspace/shared';
import { describe, expect, it } from 'vitest';
import { STORAGE_REQUEST_FORM_DEFAULTS, StorageRequestFormSchema } from '../src/forms/storage-request-form';
import { WAREHOUSE_FORM_DEFAULTS, WarehouseSpaceFormSchema } from '../src/forms/warehouse-space-form';

const DALLAS = { label: 'Dallas, TX, United States', lat: 32.7767, lng: -96.797 };

/** `YYYY-MM-DD` `days` from today (UTC), like a date input. */
const day = (days: number) => toCalendarDate(addDays(utcStartOfDay(new Date()), days));

const contact = { companyName: 'Acme Storage', contactName: 'Ana Ruiz', contactEmail: 'ana@acme.example.com' };

const space = (overrides: Record<string, unknown> = {}) => ({
  ...WAREHOUSE_FORM_DEFAULTS,
  ...contact,
  location: DALLAS,
  quantityAvailable: 100,
  availableFrom: day(3),
  availableTo: day(33),
  pricePerPalletPerPeriod: 12.5,
  ...overrides,
});

const request = (overrides: Record<string, unknown> = {}) => ({
  ...STORAGE_REQUEST_FORM_DEFAULTS,
  ...contact,
  location: DALLAS,
  pallets: 20,
  startDate: day(5),
  endDate: day(20),
  ...overrides,
});

const paths = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.success ? [] : (result.error?.issues.map((i) => i.path.join('.')) ?? []);

describe('WarehouseSpaceFormSchema', () => {
  it('turns defaults plus required fields into a valid payload', () => {
    const out = WarehouseSpaceFormSchema.parse(space());
    expect(out).toMatchObject({
      quantityAvailable: 100,
      minStorageDays: STORAGE_POLICY.defaultMinStorageDays,
      temperatureControlled: false,
      foodGrade: false,
      pricingPeriod: 'MONTH',
      pricePerPalletPerPeriod: 12.5,
    });
    expect(toCalendarDate(out.availableFrom)).toBe(day(3));
  });

  it('treats blank optionals as absent', () => {
    const out = WarehouseSpaceFormSchema.parse(space({ notes: '   ' }));
    expect(out.minPallets).toBeUndefined();
    expect(out.handlingFeePerPallet).toBeUndefined();
    expect(out.notes).toBeUndefined();
  });

  it('keeps optional minimum block and handling fee when given', () => {
    const out = WarehouseSpaceFormSchema.parse(space({ minPallets: 10, handlingFeePerPallet: 3.5, foodGrade: true }));
    expect(out).toMatchObject({ minPallets: 10, handlingFeePerPallet: 3.5, foodGrade: true });
  });

  it('requires a chosen location, dates, quantity and price', () => {
    const result = WarehouseSpaceFormSchema.safeParse(
      space({
        location: null,
        quantityAvailable: Number.NaN,
        availableFrom: '',
        availableTo: '',
        pricePerPalletPerPeriod: Number.NaN,
      }),
    );
    expect(paths(result).sort()).toEqual(
      ['availableFrom', 'availableTo', 'location', 'pricePerPalletPerPeriod', 'quantityAvailable'].sort(),
    );
  });

  it.each([
    ['availableFrom in the past', { availableFrom: day(-10), availableTo: day(10) }, 'availableFrom'],
    ['window longer than the policy', { availableTo: day(3 + STORAGE_POLICY.maxAvailabilityDays + 1) }, 'availableTo'],
    ['availableTo not after availableFrom', { availableTo: day(3) }, 'availableTo'],
    ['minimum stay longer than the window', { minStorageDays: 60 }, 'minStorageDays'],
    ['minimum block above quantity', { minPallets: 101 }, 'minPallets'],
  ])('reports the shared rule on the right field: %s', (_name, overrides, field) => {
    expect(paths(WarehouseSpaceFormSchema.safeParse(space(overrides)))).toEqual([field]);
  });
});

describe('StorageRequestFormSchema', () => {
  it('turns defaults plus required fields into a valid payload', () => {
    const out = StorageRequestFormSchema.parse(request());
    expect(out).toMatchObject({
      pallets: 20,
      maxDistanceMiles: STORAGE_POLICY.defaultMaxDistanceMiles,
      needsTemperatureControl: false,
      needsFoodGrade: false,
    });
    expect(out.maxBudgetTotal).toBeUndefined();
    expect(toCalendarDate(out.endDate)).toBe(day(20));
  });

  it('keeps requirements and budget when given', () => {
    const out = StorageRequestFormSchema.parse(
      request({ needsFoodGrade: true, needsTemperatureControl: true, maxBudgetTotal: 900 }),
    );
    expect(out).toMatchObject({ needsFoodGrade: true, needsTemperatureControl: true, maxBudgetTotal: 900 });
  });

  it('requires a chosen location, pallets and dates', () => {
    const result = StorageRequestFormSchema.safeParse(
      request({ location: null, pallets: Number.NaN, startDate: '', endDate: '' }),
    );
    expect(paths(result).sort()).toEqual(['endDate', 'location', 'pallets', 'startDate']);
  });

  it.each([
    ['start in the past', { startDate: day(-10), endDate: day(2) }, 'startDate'],
    ['end not after start', { endDate: day(5) }, 'endDate'],
    ['stay longer than the policy', { endDate: day(5 + STORAGE_POLICY.maxStorageDays + 1) }, 'endDate'],
    ['radius above the maximum', { maxDistanceMiles: STORAGE_POLICY.maxDistanceMiles + 1 }, 'maxDistanceMiles'],
    ['radius below 1', { maxDistanceMiles: 0 }, 'maxDistanceMiles'],
  ])('reports the shared rule on the right field: %s', (_name, overrides, field) => {
    expect(paths(StorageRequestFormSchema.safeParse(request(overrides)))).toEqual([field]);
  });
});
