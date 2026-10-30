import { describe, expect, it } from 'vitest';
import { TransportRequestFormSchema, type TransportRequestFormValues } from '../src/forms/transport-request-form';

const DALLAS = { label: 'Dallas, TX, United States', lat: 32.7767, lng: -96.797 };
const HOUSTON = { label: 'Houston, TX, United States', lat: 29.7604, lng: -95.3698 };

/** `datetime-local` string `hours` from now, in the local time zone like a browser input. */
function localIn(hours: number): string {
  const d = new Date(Date.now() + hours * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const values = (overrides: Partial<TransportRequestFormValues> = {}): TransportRequestFormValues => ({
  companyName: 'Acme Goods',
  contactName: 'Sam Lee',
  contactEmail: 'sam@acme.example.com',
  pickup: DALLAS,
  dropoff: HOUSTON,
  pickupEarliest: localIn(20),
  pickupLatest: localIn(32),
  deliverBy: '',
  trailerType: 'DRY_VAN',
  pallets: 6,
  weightLbs: 9_000,
  maxBudget: Number.NaN,
  notes: '  ',
  ...overrides,
});

const issuePaths = (result: ReturnType<typeof TransportRequestFormSchema.safeParse>) =>
  result.success ? [] : result.error.issues.map((i) => i.path.join('.'));

describe('TransportRequestFormSchema', () => {
  it('converts local date-times to instants and drops empty optional fields', () => {
    const v = values();
    const result = TransportRequestFormSchema.parse(v);

    expect(result.pickupEarliest).toEqual(new Date(v.pickupEarliest));
    expect(result.pickupLatest).toEqual(new Date(v.pickupLatest));
    expect(result.deliverBy).toBeUndefined();
    expect(result.maxBudget).toBeUndefined();
    expect(result.notes).toBeUndefined();
  });

  it('keeps optional fields that were filled in', () => {
    const result = TransportRequestFormSchema.parse(
      values({ maxBudget: 750, deliverBy: localIn(48), notes: 'Dock 4' }),
    );

    expect(result).toMatchObject({ maxBudget: 750, notes: 'Dock 4' });
    expect(result.deliverBy).toBeInstanceOf(Date);
  });

  it('requires locations picked from the suggestions', () => {
    const result = TransportRequestFormSchema.safeParse(values({ pickup: null }));

    expect(issuePaths(result)).toEqual(['pickup']);
    expect(result.error?.issues[0]?.message).toBe('Choose a location from the suggestions');
  });

  it('reports empty required fields with readable messages', () => {
    const result = TransportRequestFormSchema.safeParse(values({ pallets: Number.NaN, pickupEarliest: '' }));

    expect(result.error?.issues.map((i) => i.message)).toEqual(['Earliest pickup is required', 'Pallets is required']);
  });

  it('applies the shared API rules after conversion (e.g. minimum distance)', () => {
    const result = TransportRequestFormSchema.safeParse(values({ dropoff: { ...DALLAS, label: 'Dallas again' } }));

    expect(issuePaths(result)).toEqual(['dropoff']);
    expect(result.error?.issues[0]?.message).toBe('Dropoff must be at least 10 miles from pickup');
  });
});
