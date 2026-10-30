import type { PrismaClient } from '../db.js';
import type { CachedPlace, GeocodeCacheStore } from '../geocoding/cached.js';

/** GeocodeCache-backed store: one row per result, keyed by (provider, normalizedQuery, rank). */
export function createPrismaGeocodeCacheStore(prisma: PrismaClient): GeocodeCacheStore {
  return {
    async get(provider, normalizedQuery) {
      const rows = await prisma.geocodeCache.findMany({
        where: { provider, normalizedQuery },
        orderBy: { rank: 'asc' },
        select: { label: true, lat: true, lng: true },
      });
      return rows.length > 0 ? rows : null;
    },

    async put(provider, normalizedQuery, places: CachedPlace[]) {
      // Replace atomically; skipDuplicates makes concurrent misses for the same query harmless.
      await prisma.$transaction([
        prisma.geocodeCache.deleteMany({ where: { provider, normalizedQuery } }),
        prisma.geocodeCache.createMany({
          data: places.map((p, rank) => ({ provider, normalizedQuery, rank, label: p.label, lat: p.lat, lng: p.lng })),
          skipDuplicates: true,
        }),
      ]);
    },
  };
}
