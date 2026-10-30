import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createPrismaClient } from './db.js';
import { getPostgisVersion } from './repositories/geo.repository.js';
import { createDatabaseHealthCheck } from './services/health.service.js';

const env = loadEnv();
const prisma = createPrismaClient(env.DATABASE_URL);

const app = createApp({
  webOrigin: env.WEB_ORIGIN,
  checkDatabase: createDatabaseHealthCheck(() => getPostgisVersion(prisma)),
});

const server = app.listen(env.PORT, () => {
  console.log(`DeadSpace API listening on http://localhost:${env.PORT}`);
});

function shutdown() {
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
