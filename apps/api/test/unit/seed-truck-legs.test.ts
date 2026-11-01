import { describe, expect, it } from 'vitest';
import {
  buildSeedTruckLegSchedule,
  buildSeedTruckLegsForDay,
  defaultSeedAnchor,
  SEED_FIRST_DAY_OFFSET,
  SEED_HORIZON_DAYS,
  SEED_LAST_DAY_OFFSET,
  SEED_LEG_COUNTS,
  seedDepartureDays,
} from '../../prisma/seed-data/truck-legs.js';
import type { Geocoder } from '../../src/geocoding/geocoder.js';
import { MockGeocoder } from '../../src/geocoding/mock.js';

const DAY = 24 * 3600 * 1000;
const ANCHOR = new Date('2026-06-02T00:00:00Z');
const epochDay = (d: Date) => Math.floor(d.getTime() / DAY);
// Two consecutive UTC days, one even and one odd by days since the Unix epoch.
const EVEN_DAY = epochDay(ANCHOR) % 2 === 0 ? ANCHOR : new Date(ANCHOR.getTime() + DAY);
const ODD_DAY = new Date(EVEN_DAY.getTime() + DAY);
const legKey = (id: string) => id.slice(-2);

describe('defaultSeedAnchor', () => {
  it('is the next UTC midnight', () => {
    expect(defaultSeedAnchor(new Date('2026-06-01T15:30:00Z'))).toEqual(ANCHOR);
    expect(defaultSeedAnchor(new Date('2026-06-01T00:00:00Z'))).toEqual(ANCHOR);
  });
});

describe('buildSeedTruckLegsForDay (whole layout)', () => {
  const whole = (day: Date, geocoder: Geocoder = new MockGeocoder()) =>
    buildSeedTruckLegsForDay(day, geocoder, { allLegs: true });

  it('produces about 30 valid legs with unique ids dated by departure day', async () => {
    const legs = await whole(ANCHOR);
    expect(legs).toHaveLength(SEED_LEG_COUNTS.total);
    expect(legs.length).toBeGreaterThanOrEqual(28);
    expect(legs.length).toBeLessThanOrEqual(32);
    expect(new Set(legs.map((l) => l.id)).size).toBe(legs.length);
    for (const { id } of legs) expect(id).toMatch(/^seed-truck-leg-20260602-\d{2}$/);
  });

  it('is deterministic for a given day', async () => {
    expect(await whole(ANCHOR)).toEqual(await whole(ANCHOR));
  });

  it('shifts every timestamp with the day and nothing else', async () => {
    const a = await whole(ANCHOR);
    const later = new Date(ANCHOR.getTime() + 7 * DAY);
    const b = await whole(later);
    b.forEach((leg, i) => {
      expect(leg.input.departureEarliest.getTime() - a[i]!.input.departureEarliest.getTime()).toBe(7 * DAY);
      expect({ ...leg.input, departureEarliest: 0, departureLatest: 0, arriveBy: 0 }).toEqual({
        ...a[i]!.input,
        departureEarliest: 0,
        departureLatest: 0,
        arriveBy: 0,
      });
    });
  });

  it('departs every leg on its own day, between 06:00 and 16:00 UTC', async () => {
    for (const { input } of await whole(ANCHOR)) {
      const offset = input.departureEarliest.getTime() - ANCHOR.getTime();
      expect(offset).toBeGreaterThanOrEqual(6 * 3600 * 1000);
      expect(offset).toBeLessThanOrEqual(16 * 3600 * 1000);
    }
  });

  it('covers the scenarios the matching engine needs', async () => {
    const legs = (await whole(ANCHOR)).map((l) => l.input);
    const dallasToHouston = legs.filter(
      (l) => l.origin.label.startsWith('Dallas') && l.destination.label.startsWith('Houston'),
    );

    expect(new Set(legs.map((l) => l.loadState))).toEqual(new Set(['EMPTY', 'PARTIAL']));
    expect(new Set(legs.map((l) => l.trailerType))).toEqual(new Set(['DRY_VAN', 'REEFER', 'FLATBED']));
    expect(new Set(legs.map((l) => l.pricingBasis))).toEqual(new Set(['FLAT', 'PER_LOADED_MILE']));
    expect(dallasToHouston.length).toBeGreaterThanOrEqual(3);
    expect(dallasToHouston.some((l) => l.trailerType !== 'DRY_VAN')).toBe(true);
    expect(legs.some((l) => l.arriveBy !== undefined)).toBe(true);
    expect(legs.some((l) => l.totalPallets - l.committedPallets <= 2)).toBe(true);
    for (const l of legs.filter((x) => x.loadState === 'EMPTY')) {
      expect([l.committedPallets, l.committedWeightLbs]).toEqual([0, 0]);
    }
  });

  it('resolves every location through the given geocoder with mock coordinates', async () => {
    const legs = await whole(ANCHOR);
    expect(legs[0]!.input.origin).toEqual({ label: 'Dallas, TX, United States', lat: 32.7767, lng: -96.797 });
  });

  it('fails loudly when a location cannot be resolved', async () => {
    const empty: Geocoder = { provider: 'none', search: () => Promise.resolve([]) };
    await expect(whole(ANCHOR, empty)).rejects.toThrow(/Seed location not found/);
  });
});

describe('daily schedule', () => {
  const forDay = async (day: Date) => (await buildSeedTruckLegsForDay(day, new MockGeocoder())).map((l) => l.id);

  it('runs most legs daily and alternates exactly six: three on even days, three on odd days', () => {
    expect(SEED_LEG_COUNTS).toMatchObject({ total: 30, daily: 24, evenDays: 3, oddDays: 3 });
  });

  it('schedules the same daily legs every day plus that parity’s alternating legs', async () => {
    const even = (await forDay(EVEN_DAY)).map(legKey);
    const odd = (await forDay(ODD_DAY)).map(legKey);

    expect(even).toHaveLength(27);
    expect(odd).toHaveLength(27);
    expect(even.filter((k) => !odd.includes(k)).sort()).toEqual(['01', '02', '14']);
    expect(odd.filter((k) => !even.includes(k)).sort()).toEqual(['07', '08', '13']);
  });

  it('gives every day dry-van corridor legs and daily reefer and flatbed corridor legs', async () => {
    for (const day of [EVEN_DAY, ODD_DAY]) {
      const legs = await buildSeedTruckLegsForDay(day, new MockGeocoder());
      const dallasToHouston = legs.filter(
        (l) => l.input.origin.label.startsWith('Dallas') && l.input.destination.label.startsWith('Houston'),
      );
      const trailers = (type: string) => dallasToHouston.filter((l) => l.input.trailerType === type).length;
      expect(trailers('DRY_VAN')).toBeGreaterThanOrEqual(2);
      expect(trailers('REEFER')).toBeGreaterThanOrEqual(1);
      expect(trailers('FLATBED')).toBeGreaterThanOrEqual(1);
    }
  });

  it('never repeats an alternating leg within two consecutive days (so no 32 h window can show it twice)', async () => {
    for (let i = 0; i < 6; i++) {
      const first = new Date(ANCHOR.getTime() + i * DAY);
      const keys = [...(await forDay(first)), ...(await forDay(new Date(first.getTime() + DAY)))].map(legKey);
      for (const key of ['01', '02', '14', '07', '13', '08']) expect(keys.filter((k) => k === key)).toHaveLength(1);
    }
  });
});

describe('seed departure days', () => {
  it('cover the seed day through the horizon plus the demo window’s second day', () => {
    const days = seedDepartureDays(ANCHOR);
    expect(days).toHaveLength(SEED_LAST_DAY_OFFSET - SEED_FIRST_DAY_OFFSET + 1);
    expect(days[0]!.getTime()).toBe(ANCHOR.getTime() + SEED_FIRST_DAY_OFFSET * DAY);
    expect(days.at(-1)!.getTime()).toBe(ANCHOR.getTime() + (SEED_HORIZON_DAYS + 1) * DAY);
    days.slice(1).forEach((d, i) => expect(d.getTime() - days[i]!.getTime()).toBe(DAY));
  });

  it('depend only on the anchor date, never on the time of day', () => {
    expect(seedDepartureDays(new Date('2026-06-02T17:45:00Z'))).toEqual(seedDepartureDays(ANCHOR));
  });

  it('produce a predictable number of rows: 27 per day', async () => {
    const legs = await buildSeedTruckLegSchedule(ANCHOR, new MockGeocoder());
    expect(legs).toHaveLength(seedDepartureDays(ANCHOR).length * 27);
    expect(new Set(legs.map((l) => l.id)).size).toBe(legs.length);
    for (const { id } of legs) expect(id).toMatch(/^seed-truck-leg-\d{8}-\d{2}$/);
  });

  it('give a row identical content whichever seed anchor produced it', async () => {
    const geocoder = new MockGeocoder();
    const early = await buildSeedTruckLegSchedule(ANCHOR, geocoder);
    const later = await buildSeedTruckLegSchedule(new Date(ANCHOR.getTime() + 10 * DAY), geocoder);

    const laterById = new Map(later.map((l) => [l.id, l]));
    const shared = early.filter((l) => laterById.has(l.id));
    expect(shared.length).toBeGreaterThan(0);
    expect(shared.length).toBeLessThan(early.length);
    for (const leg of shared) expect(laterById.get(leg.id)).toEqual(leg);
    expect(later.length).toBe(early.length);
  });
});
