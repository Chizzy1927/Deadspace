import type { PrismaClient } from '../../src/db.js';
import { toTruckLegCreateData } from '../../src/repositories/truck-leg.repository.js';
import type { SeedTruckLeg } from './truck-legs.js';

/**
 * Inserts the seed legs that are not already in the database and leaves every existing row exactly
 * as it is (no update, no status reset). Seeded rows are therefore immutable once written, which keeps
 * the matches of historical requests stable. Returns a lazy Prisma promise, so it can run inside a
 * `$transaction([...])`; `count` is the number of legs actually inserted.
 */
export function insertMissingTruckLegs(prisma: PrismaClient, legs: readonly SeedTruckLeg[]) {
  return prisma.truckLeg.createMany({
    data: legs.map(({ id, input }) => ({ id, ...toTruckLegCreateData(input) })),
    skipDuplicates: true,
  });
}
