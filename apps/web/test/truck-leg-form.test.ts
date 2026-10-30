import { describe, expect, it } from 'vitest';
import {
  spareCapacity,
  TRUCK_LEG_FORM_DEFAULTS,
  TruckLegFormSchema,
  type TruckLegFormValues,
} from '../src/forms/truck-leg-form';

const DALLAS = { label: 'Dallas, TX, United States', lat: 32.7767, lng: -96.797 };
const HOUSTON = { label: 'Houston, TX, United States', lat: 29.7604, lng: -95.3698 };

/** `datetime-local` string `hours` from now, in the local time zone like a browser input. */
function localIn(hours: number): string {
  const d = new Date(Date.now() + hours * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The form's own defaults plus what a carrier must fill in. */
const values = (overrides: Partial<TruckLegFormValues> = {}): TruckLegFormValues => ({
  ...TRUCK_LEG_FORM_DEFAULTS,
  companyName: 'Lone Star Freight',
  contactName: 'Ana Ruiz',
  contactEmail: 'ana@lonestar.example.com',
  origin: DALLAS,
  destination: HOUSTON,
  departureEarliest: localIn(20),
  departureLatest: localIn(26),
  priceAmount: 650,
  ...overrides,
});

const issuePaths = (result: ReturnType<typeof TruckLegFormSchema.safeParse>) =>
  result.success ? [] : result.error.issues.map((i) => i.path.join('.'));

describe('TruckLegFormSchema', () => {
  it('turns the defaults plus required fields into a valid EMPTY dry-van payload', () => {
    const v = values();
    const result = TruckLegFormSchema.parse(v);

    expect(result).toMatchObject({
      loadState: 'EMPTY',
      trailerType: 'DRY_VAN',
      totalPallets: 26,
      totalWeightLbs: 45_000,
      committedPallets: 0,
      committedWeightLbs: 0,
      maxDetourMiles: 100,
      pricingBasis: 'FLAT',
      priceAmount: 650,
    });
    expect(result.departureEarliest).toEqual(new Date(v.departureEarliest));
    expect(result.departureLatest).toEqual(new Date(v.departureLatest));
    expect(result.arriveBy).toBeUndefined();
    expect(result.notes).toBeUndefined();
  });

  it('sends zero committed capacity for EMPTY even when stale PARTIAL values remain', () => {
    const result = TruckLegFormSchema.parse(
      values({ loadState: 'EMPTY', committedPallets: 10, committedWeightLbs: 15_000 }),
    );

    expect(result.committedPallets).toBe(0);
    expect(result.committedWeightLbs).toBe(0);
  });

  it('keeps committed capacity and optional fields for a PARTIAL per-mile leg', () => {
    const result = TruckLegFormSchema.parse(
      values({
        loadState: 'PARTIAL',
        committedPallets: 14,
        committedWeightLbs: 23_000,
        arriveBy: localIn(40),
        pricingBasis: 'PER_LOADED_MILE',
        priceAmount: 2.35,
        maxDetourMiles: 45,
        notes: ' Dock 4 ',
      }),
    );

    expect(result).toMatchObject({
      loadState: 'PARTIAL',
      committedPallets: 14,
      committedWeightLbs: 23_000,
      pricingBasis: 'PER_LOADED_MILE',
      priceAmount: 2.35,
      maxDetourMiles: 45,
      notes: 'Dock 4',
    });
    expect(result.arriveBy).toBeInstanceOf(Date);
  });

  it('reports a PARTIAL leg with blank committed fields using the shared rule', () => {
    const result = TruckLegFormSchema.safeParse(values({ loadState: 'PARTIAL' }));

    expect(issuePaths(result)).toEqual(['committedPallets']);
    expect(result.error?.issues[0]?.message).toBe('A PARTIAL leg must have some committed pallets or weight');
  });

  it('rejects committed capacity that fills the trailer', () => {
    const result = TruckLegFormSchema.safeParse(
      values({ loadState: 'PARTIAL', committedPallets: 26, committedWeightLbs: 45_000 }),
    );

    expect(issuePaths(result)).toEqual(['committedPallets', 'committedWeightLbs']);
    expect(result.error?.issues[0]?.message).toBe('Committed pallets must be less than total pallets');
  });

  it('requires locations picked from the suggestions', () => {
    const result = TruckLegFormSchema.safeParse(values({ destination: null }));

    expect(issuePaths(result)).toEqual(['destination']);
    expect(result.error?.issues[0]?.message).toBe('Choose a location from the suggestions');
  });

  it('reports empty required fields with readable messages', () => {
    const result = TruckLegFormSchema.safeParse(
      values({ departureLatest: '', totalPallets: Number.NaN, priceAmount: Number.NaN }),
    );

    expect(result.error?.issues.map((i) => i.message)).toEqual([
      'Latest departure is required',
      'Total pallets is required',
      'Price is required',
    ]);
  });

  it('applies the shared policy after conversion (departure window at most 72 hours)', () => {
    const result = TruckLegFormSchema.safeParse(values({ departureLatest: localIn(20 + 73) }));

    expect(issuePaths(result)).toEqual(['departureLatest']);
    expect(result.error?.issues[0]?.message).toBe('Departure window must be at most 72 hours');
  });

  it('accepts any whole-mile detour the shared rule allows, not just slider steps', () => {
    expect(TruckLegFormSchema.safeParse(values({ maxDetourMiles: 1 })).success).toBe(true);
    expect(issuePaths(TruckLegFormSchema.safeParse(values({ maxDetourMiles: 301 })))).toEqual(['maxDetourMiles']);
  });
});

describe('spareCapacity', () => {
  it('subtracts committed from total, counting blanks as zero', () => {
    expect(
      spareCapacity({ totalPallets: 26, totalWeightLbs: 45_000, committedPallets: 14, committedWeightLbs: 23_000 }),
    ).toEqual({ pallets: 12, weightLbs: 22_000 });
    expect(
      spareCapacity({
        totalPallets: 26,
        totalWeightLbs: 45_000,
        committedPallets: Number.NaN,
        committedWeightLbs: 5_000,
      }),
    ).toEqual({ pallets: 26, weightLbs: 40_000 });
  });
});
