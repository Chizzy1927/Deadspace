import { type Geocoder, normalizeQuery, type Place } from './geocoder.js';

/** A cached result: only label + coordinates (never vendor payloads or provider place ids). */
export type CachedPlace = Pick<Place, 'label' | 'lat' | 'lng'>;

/** Persistence port for cached results; the Prisma implementation backs it with GeocodeCache. */
export interface GeocodeCacheStore {
  /** Cached results in rank order, or null on a miss. */
  get(provider: string, normalizedQuery: string): Promise<CachedPlace[] | null>;
  put(provider: string, normalizedQuery: string, places: CachedPlace[]): Promise<void>;
}

/**
 * Decorator that serves repeat queries from the cache, protecting the upstream API quota.
 * Misses and hits return the same stored shape (no providerPlaceId), so callers can't tell them
 * apart. Empty results are not cached (a typo shouldn't be remembered); there is no expiry in V1.
 */
export class CachedGeocoder implements Geocoder {
  readonly provider: string;

  constructor(
    private readonly inner: Geocoder,
    private readonly store: GeocodeCacheStore,
  ) {
    this.provider = inner.provider;
  }

  async search(query: string): Promise<Place[]> {
    const key = normalizeQuery(query);
    if (!key) return [];

    const cached = await this.store.get(this.provider, key);
    if (cached) return this.toPlaces(cached);

    const fresh = (await this.inner.search(query)).map(({ label, lat, lng }) => ({ label, lat, lng }));
    if (fresh.length > 0) await this.store.put(this.provider, key, fresh);
    return this.toPlaces(fresh);
  }

  private toPlaces(places: CachedPlace[]): Place[] {
    return places.map(({ label, lat, lng }) => ({ label, lat, lng, provider: this.provider }));
  }
}
