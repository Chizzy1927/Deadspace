// Seed entry point for `npm run db:seed`. Idempotent and explicit: it is never run at app startup.
// - Truck legs are seeded per departure day over a rolling horizon (see seed-data/truck-legs.ts).
//   Only missing rows are inserted; existing legs are never updated, moved or removed.
// - Warehouse spaces have fixed ids and are upserted, so re-running refreshes (re-dates) them.
// Neither touches user-created rows. Always uses MockGeocoder, so seeding never calls a real geocoding API.
import { loadEnv } from '../src/config/env.js';
import { createPrismaClient } from '../src/db.js';
import { MockGeocoder } from '../src/geocoding/mock.js';
import { toWarehouseSpaceCreateData } from '../src/repositories/warehouse-space.repository.js';
import { insertMissingTruckLegs } from './seed-data/truck-leg-writer.js';
import { buildSeedTruckLegSchedule, defaultSeedAnchor, seedDepartureDays } from './seed-data/truck-legs.js';
import { buildSeedWarehouseSpaces } from './seed-data/warehouse-spaces.js';

// Optional SEED_ANCHOR (ISO timestamp) reproduces an exact earlier seed.
const anchor = process.env.SEED_ANCHOR ? new Date(process.env.SEED_ANCHOR) : defaultSeedAnchor(new Date());
if (Number.isNaN(anchor.getTime())) throw new Error('SEED_ANCHOR must be an ISO 8601 timestamp');

const env = loadEnv();
const prisma = createPrismaClient(env.DATABASE_URL);

try {
  const geocoder = new MockGeocoder();
  const legs = await buildSeedTruckLegSchedule(anchor, geocoder);
  const spaces = await buildSeedWarehouseSpaces(anchor, geocoder);
  const [inserted] = await prisma.$transaction([
    insertMissingTruckLegs(prisma, legs),
    ...spaces.map(({ id, input }) => {
      const data = toWarehouseSpaceCreateData(input);
      return prisma.warehouseSpace.upsert({
        where: { id },
        create: { id, ...data },
        update: { ...data, status: 'ACTIVE' },
      });
    }),
  ]);
  console.log(
    `Truck legs: ${legs.length} over ${seedDepartureDays(anchor).length} departure days, ${inserted.count} newly inserted, ${legs.length - inserted.count} already present. ` +
      `Warehouse spaces: ${spaces.length} upserted. (anchor ${anchor.toISOString()})`,
  );
} finally {
  await prisma.$disconnect();
}
