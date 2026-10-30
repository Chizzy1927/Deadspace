import type { Env } from '../config/env.js';
import type { PrismaClient } from '../db.js';
import { createPrismaGeocodeCacheStore } from '../repositories/geocode-cache.repository.js';
import { CachedGeocoder } from './cached.js';
import { GeoapifyGeocoder } from './geoapify.js';
import type { Geocoder } from './geocoder.js';
import { MockGeocoder } from './mock.js';

export type { Geocoder, Place } from './geocoder.js';
export { GeocoderError, normalizeQuery } from './geocoder.js';

/** Chooses the geocoder from env GEOCODER. Real providers are cached; the offline mock is not. */
export function createGeocoder(env: Pick<Env, 'GEOCODER' | 'GEOAPIFY_API_KEY'>, prisma: PrismaClient): Geocoder {
  switch (env.GEOCODER) {
    case 'mock':
      return new MockGeocoder();
    case 'geoapify':
      if (!env.GEOAPIFY_API_KEY) throw new Error('GEOAPIFY_API_KEY is required when GEOCODER=geoapify');
      return new CachedGeocoder(
        new GeoapifyGeocoder({ apiKey: env.GEOAPIFY_API_KEY }),
        createPrismaGeocodeCacheStore(prisma),
      );
  }
}
