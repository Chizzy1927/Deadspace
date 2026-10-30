import type { Place } from '@deadspace/shared';

export type { Place };

/** Vendor-neutral geocoding port. Implementations: GeoapifyGeocoder, MockGeocoder, CachedGeocoder. */
export interface Geocoder {
  /** Stable provider name stored alongside cached results (e.g. "geoapify", "mock"). */
  readonly provider: string;
  /** Returns candidate places for a free-text query, best match first. */
  search(query: string): Promise<Place[]>;
}

/** Raised when the upstream geocoder fails; the message never contains credentials. */
export class GeocoderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GeocoderError';
  }
}

/** Cache key form of a query: Unicode-normalised, trimmed, lower-cased, single-spaced. */
export function normalizeQuery(query: string): string {
  return query.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}
