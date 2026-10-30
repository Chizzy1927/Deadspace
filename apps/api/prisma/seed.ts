// Seed entry point for `npm run db:seed`. Idempotent: seed rows have fixed ids and are upserted,
// so re-running refreshes them (with dates re-anchored) and never touches user-created rows.
// Always uses MockGeocoder, so seeding never calls (or spends quota on) a real geocoding API.
import { loadEnv } from '../src/config/env.js';
import { createPrismaClient } from '../src/db.js';
import { MockGeocoder } from '../src/geocoding/mock.js';
import { toTruckLegCreateData } from '../src/repositories/truck-leg.repository.js';
import { buildSeedTruckLegs, defaultSeedAnchor } from './seed-data/truck-legs.js';

// Optional SEED_ANCHOR (ISO timestamp) reproduces an exact earlier seed.
const anchor = process.env.SEED_ANCHOR ? new Date(process.env.SEED_ANCHOR) : defaultSeedAnchor(new Date());
if (Number.isNaN(anchor.getTime())) throw new Error('SEED_ANCHOR must be an ISO 8601 timestamp');

const env = loadEnv();
const prisma = createPrismaClient(env.DATABASE_URL);

try {
  const legs = await buildSeedTruckLegs(anchor, new MockGeocoder());
  await prisma.$transaction(
    legs.map(({ id, input }) => {
      const data = toTruckLegCreateData(input);
      return prisma.truckLeg.upsert({ where: { id }, create: { id, ...data }, update: { ...data, status: 'ACTIVE' } });
    }),
  );
  console.log(`Seeded ${legs.length} truck legs (anchor ${anchor.toISOString()}).`);
} finally {
  await prisma.$disconnect();
}
