import { describe, expect, it } from 'vitest';
import {
  buildDemoStorageRequest,
  buildDemoTransportRequest,
  createStorageRequestInputSchema,
  createTransportRequestInputSchema,
  DemoConfigSchema,
  isSampleDataId,
  nextUtcMidnight,
} from '../src/index.js';

// Just before and just after a UTC midnight, and mid-day.
const CLOCKS = ['2026-06-01T23:59:59Z', '2026-06-02T00:00:01Z', '2026-06-02T12:00:00Z'].map((s) => new Date(s));

describe('nextUtcMidnight', () => {
  it('is strictly after now, including at exactly midnight', () => {
    expect(nextUtcMidnight(new Date('2026-06-01T15:30:00Z')).toISOString()).toBe('2026-06-02T00:00:00.000Z');
    expect(nextUtcMidnight(new Date('2026-06-01T00:00:00Z')).toISOString()).toBe('2026-06-02T00:00:00.000Z');
  });
});

describe.each(CLOCKS.map((c) => [c.toISOString(), c] as const))('demo requests at %s', (_label, now) => {
  it('pass the shared request schemas', () => {
    expect(createTransportRequestInputSchema(() => now).safeParse(buildDemoTransportRequest(now)).success).toBe(true);
    expect(createStorageRequestInputSchema(() => now).safeParse(buildDemoStorageRequest(now)).success).toBe(true);
  });
});

describe('isSampleDataId', () => {
  it('is true only for seeded listing ids', () => {
    expect(isSampleDataId('seed-truck-leg-20261112-01')).toBe(true);
    expect(isSampleDataId('seed-warehouse-space-01')).toBe(true);
    expect(isSampleDataId('cmvxzp51v0000xcut41s75x9j')).toBe(false);
    expect(isSampleDataId('example-truck-leg')).toBe(false);
    expect(isSampleDataId('')).toBe(false);
  });
});

describe('DemoConfigSchema', () => {
  it('accepts the demo-config response and rejects anything else', () => {
    expect(DemoConfigSchema.parse({ listingCreationEnabled: false })).toEqual({ listingCreationEnabled: false });
    expect(DemoConfigSchema.safeParse({ listingCreationEnabled: 'no' }).success).toBe(false);
    expect(DemoConfigSchema.safeParse({}).success).toBe(false);
  });
});
