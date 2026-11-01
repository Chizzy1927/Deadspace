import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createPrismaClient } from './db.js';
import { createGeocoder } from './geocoding/index.js';
import { getPostgisVersion } from './repositories/geo.repository.js';
import { createDatabaseHealthCheck } from './services/health.service.js';

const env = loadEnv();
const prisma = createPrismaClient(env.DATABASE_URL);

const app = createApp({
  webOrigin: env.WEB_ORIGIN,
  checkDatabase: createDatabaseHealthCheck(() => getPostgisVersion(prisma)),
  prisma,
  geocoder: createGeocoder(env, prisma),
  trustProxy: env.TRUST_PROXY,
  demoPolicy: {
    listingCreationEnabled: env.DEMO_LISTING_CREATION,
    writeRateLimit: { limit: env.WRITE_RATE_LIMIT_PER_HOUR, windowMs: 60 * 60_000 },
    maxRowsPerTable: env.MAX_ROWS_PER_TABLE,
  },
});

const server = app.listen(env.PORT, () => {
  console.log(`DeadSpace API listening on port ${env.PORT}`);
});

function shutdown() {
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
