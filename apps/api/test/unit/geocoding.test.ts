import { PlaceSchema } from '@deadspace/shared';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../src/db.js';
import { CachedGeocoder, type CachedPlace, type GeocodeCacheStore } from '../../src/geocoding/cached.js';
import { GeoapifyGeocoder } from '../../src/geocoding/geoapify.js';
import { type Geocoder, GeocoderError, normalizeQuery, type Place } from '../../src/geocoding/geocoder.js';
import { createGeocoder } from '../../src/geocoding/index.js';
import { MOCK_PLACES, MockGeocoder } from '../../src/geocoding/mock.js';

describe('normalizeQuery', () => {
  it('trims, lower-cases, and collapses whitespace', () => {
    expect(normalizeQuery('  Dallas,\t  TX \n')).toBe('dallas, tx');
  });

  it('applies Unicode NFKC normalisation', () => {
    expect(normalizeQuery('Ｄａｌｌａｓ')).toBe('dallas');
  });
});

describe('MockGeocoder', () => {
  const geocoder = new MockGeocoder();

  it('resolves fixture cities case-insensitively to fixed coordinates', async () => {
    const [dallas] = await geocoder.search('  DALLAS ');
    expect(dallas).toEqual({
      label: 'Dallas, TX, United States',
      lat: 32.7767,
      lng: -96.797,
      provider: 'mock',
      providerPlaceId: 'mock:dallas-tx',
    });
  });

  it('is deterministic and caps results at the limit', async () => {
    const first = await geocoder.search('tx');
    expect(first).toHaveLength(5);
    expect(await geocoder.search('tx')).toEqual(first);
  });

  it('returns nothing for blank or unknown queries', async () => {
    expect(await geocoder.search('   ')).toEqual([]);
    expect(await geocoder.search('Atlantis')).toEqual([]);
  });

  it('only contains valid, uniquely labelled places', () => {
    for (const place of MOCK_PLACES) expect(PlaceSchema.safeParse(place).success).toBe(true);
    expect(new Set(MOCK_PLACES.map((p) => p.label)).size).toBe(MOCK_PLACES.length);
  });

  it('returns copies so callers cannot mutate the fixtures', async () => {
    const [dallas] = await geocoder.search('dallas');
    dallas!.lat = 0;
    expect((await geocoder.search('dallas'))[0]!.lat).toBe(32.7767);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('GeoapifyGeocoder', () => {
  it('builds an autocomplete request and maps results to vendor-neutral places', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        results: [
          { formatted: 'Dallas, TX, United States of America', lat: 32.78, lon: -96.8, place_id: 'abc', rank: {} },
          { formatted: 'Dallas, GA, United States of America', lat: 33.92, lon: -84.84 },
        ],
      }),
    );
    const geocoder = new GeoapifyGeocoder({ apiKey: 'secret-key', fetch: fetchMock });

    const places = await geocoder.search(' Dallas ');

    expect(places).toEqual([
      {
        label: 'Dallas, TX, United States of America',
        lat: 32.78,
        lng: -96.8,
        provider: 'geoapify',
        providerPlaceId: 'abc',
      },
      { label: 'Dallas, GA, United States of America', lat: 33.92, lng: -84.84, provider: 'geoapify' },
    ]);
    const input = fetchMock.mock.calls[0]![0];
    expect(input).toBeInstanceOf(URL);
    const url = input as URL;
    expect(url.origin + url.pathname).toBe('https://api.geoapify.com/v1/geocode/autocomplete');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      text: 'Dallas',
      format: 'json',
      limit: '5',
      filter: 'countrycode:us',
      apiKey: 'secret-key',
    });
  });

  it('skips the network for blank queries', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    expect(await new GeoapifyGeocoder({ apiKey: 'k', fetch: fetchMock }).search('  ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('raises a GeocoderError on HTTP errors without leaking the API key', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ message: 'Invalid apiKey' }, 401));
    const error = await new GeoapifyGeocoder({ apiKey: 'secret-key', fetch: fetchMock })
      .search('Dallas')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GeocoderError);
    expect(error).toMatchObject({ provider: 'geoapify', status: 401 });
    expect((error as Error).message).not.toContain('secret-key');
  });

  it('raises a GeocoderError on network failures and malformed responses', async () => {
    const failing = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed: secret-key'));
    const failure = await new GeoapifyGeocoder({ apiKey: 'secret-key', fetch: failing })
      .search('Dallas')
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(GeocoderError);
    expect((failure as Error).message).not.toContain('secret-key');

    const malformed = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ results: [{ formatted: 'x' }] }));
    await expect(new GeoapifyGeocoder({ apiKey: 'k', fetch: malformed }).search('Dallas')).rejects.toThrow(
      /unexpected response shape/,
    );
  });
});

class MemoryStore implements GeocodeCacheStore {
  readonly rows = new Map<string, CachedPlace[]>();
  get(provider: string, q: string) {
    return Promise.resolve(this.rows.get(`${provider}|${q}`) ?? null);
  }
  put(provider: string, q: string, places: CachedPlace[]) {
    this.rows.set(`${provider}|${q}`, places);
    return Promise.resolve();
  }
}

function countingGeocoder(provider: string, results: Place[]): Geocoder & { calls: number } {
  return {
    provider,
    calls: 0,
    search() {
      this.calls += 1;
      return Promise.resolve(results.map((p) => ({ ...p })));
    },
  };
}

describe('CachedGeocoder', () => {
  const dallas: Place = { label: 'Dallas, TX', lat: 32.78, lng: -96.8, provider: 'acme', providerPlaceId: 'p1' };

  it('serves repeat (normalised) queries from the cache, with the same shape on miss and hit', async () => {
    const inner = countingGeocoder('acme', [dallas]);
    const cached = new CachedGeocoder(inner, new MemoryStore());
    const stored = [{ label: 'Dallas, TX', lat: 32.78, lng: -96.8, provider: 'acme' }];

    expect(await cached.search('Dallas')).toEqual(stored);
    expect(await cached.search('  dallas ')).toEqual(stored);
    expect(inner.calls).toBe(1);
    expect(cached.provider).toBe('acme');
  });

  it('stores only label and coordinates, keyed by provider', async () => {
    const store = new MemoryStore();
    await new CachedGeocoder(countingGeocoder('acme', [dallas]), store).search('Dallas');
    expect([...store.rows.entries()]).toEqual([['acme|dallas', [{ label: 'Dallas, TX', lat: 32.78, lng: -96.8 }]]]);
  });

  it('does not cache empty results or blank queries', async () => {
    const store = new MemoryStore();
    const inner = countingGeocoder('acme', []);
    const cached = new CachedGeocoder(inner, store);
    expect(await cached.search('nowhere')).toEqual([]);
    expect(await cached.search('nowhere')).toEqual([]);
    expect(await cached.search('   ')).toEqual([]);
    expect(inner.calls).toBe(2);
    expect(store.rows.size).toBe(0);
  });

  it('propagates upstream errors without caching', async () => {
    const store = new MemoryStore();
    const failing: Geocoder = { provider: 'acme', search: () => Promise.reject(new GeocoderError('down', 'acme')) };
    await expect(new CachedGeocoder(failing, store).search('Dallas')).rejects.toBeInstanceOf(GeocoderError);
    expect(store.rows.size).toBe(0);
  });
});

describe('createGeocoder', () => {
  const prisma = {} as PrismaClient; // never touched at construction time

  it('returns the uncached mock geocoder for GEOCODER=mock', () => {
    expect(createGeocoder({ GEOCODER: 'mock', GEOAPIFY_API_KEY: undefined }, prisma)).toBeInstanceOf(MockGeocoder);
  });

  it('wraps Geoapify in the cache for GEOCODER=geoapify', () => {
    const geocoder = createGeocoder({ GEOCODER: 'geoapify', GEOAPIFY_API_KEY: 'k' }, prisma);
    expect(geocoder).toBeInstanceOf(CachedGeocoder);
    expect(geocoder.provider).toBe('geoapify');
  });

  it('refuses Geoapify without an API key', () => {
    expect(() => createGeocoder({ GEOCODER: 'geoapify', GEOAPIFY_API_KEY: undefined }, prisma)).toThrow(
      /GEOAPIFY_API_KEY/,
    );
  });
});
