// The only module that knows about Geoapify. Everything else sees the vendor-neutral Geocoder.
// Geoapify's terms permit storing/caching results but require OSM/Geoapify attribution in the UI.
import { z } from 'zod';
import { type Geocoder, GeocoderError, type Place } from './geocoder.js';

const PROVIDER = 'geoapify';
const AUTOCOMPLETE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete';

/** The subset of Geoapify's `format=json` response we read; everything else is discarded. */
const GeoapifyResponseSchema = z.object({
  results: z.array(
    z.object({
      formatted: z.string(),
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      place_id: z.string().optional(),
    }),
  ),
});

export interface GeoapifyOptions {
  apiKey: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  limit?: number;
  /** ISO 3166-1 alpha-2 country filter. V1 is US-only (miles, lbs, USD). */
  countryCode?: string;
  timeoutMs?: number;
}

export class GeoapifyGeocoder implements Geocoder {
  readonly provider = PROVIDER;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: GeoapifyOptions) {
    this.fetchFn = options.fetch ?? fetch;
  }

  async search(query: string): Promise<Place[]> {
    const text = query.trim();
    if (!text) return [];

    const url = new URL(AUTOCOMPLETE_URL);
    url.search = new URLSearchParams({
      text,
      format: 'json',
      limit: String(this.options.limit ?? 5),
      filter: `countrycode:${(this.options.countryCode ?? 'us').toLowerCase()}`,
      apiKey: this.options.apiKey,
    }).toString();

    // Error messages deliberately omit the URL: it contains the API key.
    let res: Response;
    try {
      res = await this.fetchFn(url, { signal: AbortSignal.timeout(this.options.timeoutMs ?? 5000) });
    } catch (err) {
      throw new GeocoderError(`Geocoder request failed: ${errorName(err)}`, PROVIDER);
    }
    if (!res.ok) {
      throw new GeocoderError(`Geocoder responded with HTTP ${res.status}`, PROVIDER, res.status);
    }

    const parsed = GeoapifyResponseSchema.safeParse(await res.json().catch(() => undefined));
    if (!parsed.success) {
      throw new GeocoderError('Geocoder returned an unexpected response shape', PROVIDER, res.status);
    }
    return parsed.data.results.map((r) => ({
      label: r.formatted,
      lat: r.lat,
      lng: r.lon,
      provider: PROVIDER,
      ...(r.place_id ? { providerPlaceId: r.place_id } : {}),
    }));
  }
}

function errorName(err: unknown): string {
  return err instanceof Error ? err.name : 'unknown error';
}
