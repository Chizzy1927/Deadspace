import { describe, expect, it } from 'vitest';
import {
  buildDemoStorageRequest,
  buildDemoTransportRequest,
  createStorageRequestInputSchema,
  createTransportRequestInputSchema,
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
