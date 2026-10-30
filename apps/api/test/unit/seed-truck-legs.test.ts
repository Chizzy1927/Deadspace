import { describe, expect, it } from 'vitest';
import { buildSeedTruckLegs, defaultSeedAnchor } from '../../prisma/seed-data/truck-legs.js';
import type { Geocoder } from '../../src/geocoding/geocoder.js';
import { MockGeocoder } from '../../src/geocoding/mock.js';

const ANCHOR = new Date('2026-06-02T00:00:00Z');

describe('defaultSeedAnchor', () => {
  it('is the next UTC midnight', () => {
    expect(defaultSeedAnchor(new Date('2026-06-01T15:30:00Z'))).toEqual(ANCHOR);
    expect(defaultSeedAnchor(new Date('2026-06-01T00:00:00Z'))).toEqual(ANCHOR);
  });
});

describe('buildSeedTruckLegs', () => {
  it('produces about 30 valid legs with unique fixed ids', async () => {
    const legs = await buildSeedTruckLegs(ANCHOR, new MockGeocoder());
    expect(legs.length).toBeGreaterThanOrEqual(28);
    expect(legs.length).toBeLessThanOrEqual(32);
    expect(new Set(legs.map((l) => l.id)).size).toBe(legs.length);
    for (const { id } of legs) expect(id).toMatch(/^seed-truck-leg-\d{2}$/);
  });

  it('is deterministic for a given anchor', async () => {
    const a = await buildSeedTruckLegs(ANCHOR, new MockGeocoder());
    const b = await buildSeedTruckLegs(ANCHOR, new MockGeocoder());
    expect(b).toEqual(a);
  });

  it('shifts every timestamp with the anchor and nothing else', async () => {
    const a = await buildSeedTruckLegs(ANCHOR, new MockGeocoder());
    const later = new Date(ANCHOR.getTime() + 7 * 24 * 3600 * 1000);
    const b = await buildSeedTruckLegs(later, new MockGeocoder());
    const shift = later.getTime() - ANCHOR.getTime();
    b.forEach((leg, i) => {
      expect(leg.input.departureEarliest.getTime() - a[i]!.input.departureEarliest.getTime()).toBe(shift);
      expect({ ...leg.input, departureEarliest: 0, departureLatest: 0, arriveBy: 0 }).toEqual({
        ...a[i]!.input,
        departureEarliest: 0,
        departureLatest: 0,
        arriveBy: 0,
      });
    });
  });

  it('covers the scenarios the matching engine needs', async () => {
    const legs = (await buildSeedTruckLegs(ANCHOR, new MockGeocoder())).map((l) => l.input);
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
    const legs = await buildSeedTruckLegs(ANCHOR, new MockGeocoder());
    expect(legs[0]!.input.origin).toEqual({ label: 'Dallas, TX, United States', lat: 32.7767, lng: -96.797 });
  });

  it('fails loudly when a location cannot be resolved', async () => {
    const empty: Geocoder = { provider: 'none', search: () => Promise.resolve([]) };
    await expect(buildSeedTruckLegs(ANCHOR, empty)).rejects.toThrow(/Seed location not found/);
  });
});
