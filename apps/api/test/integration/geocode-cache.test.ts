import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { CachedGeocoder } from '../../src/geocoding/cached.js';
import type { Geocoder, Place } from '../../src/geocoding/geocoder.js';
import { MockGeocoder } from '../../src/geocoding/mock.js';
import { createPrismaGeocodeCacheStore } from '../../src/repositories/geocode-cache.repository.js';
import { createTestPrisma } from './helpers.js';

const prisma = createTestPrisma();
const store = createPrismaGeocodeCacheStore(prisma);

/** Wraps a geocoder to count upstream calls and impersonate a provider name. */
function spy(inner: Geocoder, provider = inner.provider): Geocoder & { calls: number } {
  return {
    provider,
    calls: 0,
    async search(q) {
      this.calls += 1;
      return (await inner.search(q)).map((p) => ({ ...p, provider }));
    },
  };
}

beforeEach(async () => {
  await prisma.geocodeCache.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('CachedGeocoder + GeocodeCache table (real PostGIS)', () => {
  it('stores one row per result in rank order, then serves hits without calling upstream', async () => {
    const upstream = spy(new MockGeocoder(), 'acme');
    const geocoder = new CachedGeocoder(upstream, store);

    const first = await geocoder.search('TX');
    const rows = await prisma.geocodeCache.findMany({ orderBy: { rank: 'asc' } });
    expect(rows.map((r) => [r.provider, r.normalizedQuery, r.rank, r.label, r.lat, r.lng])).toEqual(
      first.map((p, i) => ['acme', 'tx', i, p.label, p.lat, p.lng]),
    );
    expect(first.length).toBe(5);

    const second = await geocoder.search('  tx ');
    expect(upstream.calls).toBe(1);
    expect(second).toEqual(first);
  });

  it('never persists provider place ids', async () => {
    await new CachedGeocoder(spy(new MockGeocoder()), store).search('Dallas');
    const columns = Object.keys(await prisma.geocodeCache.findFirstOrThrow());
    expect(columns.sort()).toEqual(['createdAt', 'id', 'label', 'lat', 'lng', 'normalizedQuery', 'provider', 'rank']);
  });

  it('isolates cache entries by provider', async () => {
    const mock = spy(new MockGeocoder(), 'mock');
    const other = spy(new MockGeocoder(), 'other');
    await new CachedGeocoder(mock, store).search('Dallas');
    await new CachedGeocoder(other, store).search('Dallas');
    expect(other.calls).toBe(1);
    expect(await prisma.geocodeCache.count()).toBe(2);
  });

  it('does not cache empty results', async () => {
    await new CachedGeocoder(spy(new MockGeocoder()), store).search('Atlantis');
    expect(await prisma.geocodeCache.count()).toBe(0);
  });

  it('replaces an entry atomically on put', async () => {
    const place = (label: string): Pick<Place, 'label' | 'lat' | 'lng'> => ({ label, lat: 1, lng: 2 });
    await store.put('acme', 'q', [place('a'), place('b'), place('c')]);
    await store.put('acme', 'q', [place('z')]);
    expect(await store.get('acme', 'q')).toEqual([place('z')]);
    expect(await store.get('acme', 'missing')).toBeNull();
  });

  it('tolerates concurrent misses for the same query', async () => {
    const geocoder = new CachedGeocoder(spy(new MockGeocoder()), store);
    const results = await Promise.all([geocoder.search('Houston'), geocoder.search('houston')]);
    expect(results[0]).toEqual(results[1]);
    expect(await prisma.geocodeCache.count({ where: { normalizedQuery: 'houston' } })).toBe(1);
  });
});
