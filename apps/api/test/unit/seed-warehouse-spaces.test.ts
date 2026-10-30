import { addDays, daysBetween, straightLineMiles } from '@deadspace/shared';
import { describe, expect, it } from 'vitest';
import { buildSeedWarehouseSpaces } from '../../prisma/seed-data/warehouse-spaces.js';
import type { Geocoder } from '../../src/geocoding/geocoder.js';
import { MockGeocoder } from '../../src/geocoding/mock.js';
import { ROAD_FACTOR } from '../../src/matching/config.js';

const ANCHOR = new Date('2026-06-02T00:00:00Z');
const DALLAS = { lat: 32.7767, lng: -96.797 };

describe('buildSeedWarehouseSpaces', () => {
  it('produces about 15 valid spaces with unique fixed ids', async () => {
    const spaces = await buildSeedWarehouseSpaces(ANCHOR, new MockGeocoder());
    expect(spaces.length).toBeGreaterThanOrEqual(15);
    expect(spaces.length).toBeLessThanOrEqual(20);
    expect(new Set(spaces.map((s) => s.id)).size).toBe(spaces.length);
    for (const { id } of spaces) expect(id).toMatch(/^seed-warehouse-space-\d{2}$/);
  });

  it('is deterministic for a given anchor', async () => {
    const a = await buildSeedWarehouseSpaces(ANCHOR, new MockGeocoder());
    const b = await buildSeedWarehouseSpaces(ANCHOR, new MockGeocoder());
    expect(b).toEqual(a);
  });

  it('shifts every date by whole days with the anchor and nothing else', async () => {
    const a = await buildSeedWarehouseSpaces(ANCHOR, new MockGeocoder());
    const b = await buildSeedWarehouseSpaces(addDays(ANCHOR, 7), new MockGeocoder());
    b.forEach((space, i) => {
      expect(daysBetween(a[i]!.input.availableFrom, space.input.availableFrom)).toBe(7);
      expect(daysBetween(a[i]!.input.availableTo, space.input.availableTo)).toBe(7);
      expect({ ...space.input, availableFrom: 0, availableTo: 0 }).toEqual({
        ...a[i]!.input,
        availableFrom: 0,
        availableTo: 0,
      });
    });
  });

  it('covers the scenarios the matching engine needs', async () => {
    const spaces = (await buildSeedWarehouseSpaces(ANCHOR, new MockGeocoder())).map((s) => s.input);
    const estMilesFromDallas = (s: (typeof spaces)[number]) => straightLineMiles(DALLAS, s.location) * ROAD_FACTOR;

    expect(new Set(spaces.map((s) => s.pricingPeriod))).toEqual(new Set(['DAY', 'WEEK', 'MONTH']));
    expect(spaces.some((s) => s.temperatureControlled && s.foodGrade)).toBe(true);
    expect(spaces.some((s) => s.temperatureControlled && !s.foodGrade)).toBe(true);
    expect(spaces.some((s) => !s.temperatureControlled && s.foodGrade)).toBe(true);
    expect(spaces.some((s) => s.minPallets !== undefined)).toBe(true);
    expect(spaces.some((s) => s.minStorageDays > 1)).toBe(true);
    expect(spaces.some((s) => s.handlingFeePerPallet !== undefined)).toBe(true);
    expect(spaces.some((s) => s.handlingFeePerPallet === undefined)).toBe(true);
    expect(spaces.some((s) => s.quantityAvailable < 40)).toBe(true);
    // Several sites inside the default 25 est. mi radius around Dallas, at different distances,
    // and some just outside it.
    const nearby = spaces.filter((s) => estMilesFromDallas(s) <= 25);
    expect(nearby.length).toBeGreaterThanOrEqual(5);
    expect(new Set(nearby.map((s) => s.location.label)).size).toBeGreaterThanOrEqual(4);
    expect(spaces.some((s) => estMilesFromDallas(s) > 25 && estMilesFromDallas(s) <= 50)).toBe(true);
  });

  it('resolves every location through the given geocoder with mock coordinates', async () => {
    const spaces = await buildSeedWarehouseSpaces(ANCHOR, new MockGeocoder());
    expect(spaces[0]!.input.location).toEqual({ label: 'Dallas, TX, United States', lat: 32.7767, lng: -96.797 });
  });

  it('fails loudly when a location cannot be resolved', async () => {
    const empty: Geocoder = { provider: 'none', search: () => Promise.resolve([]) };
    await expect(buildSeedWarehouseSpaces(ANCHOR, empty)).rejects.toThrow(/Seed location not found/);
  });
});
