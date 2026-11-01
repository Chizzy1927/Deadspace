import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer loads .env itself; reuse the repo-root .env when present (CI sets env vars directly).
const rootEnv = new URL('../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --conditions=@deadspace/source prisma/seed.ts',
  },
  datasource: {
    // Prisma CLI (migrate deploy, db:drift) prefers DIRECT_DATABASE_URL: a managed host's pooled
    // URL (e.g. Neon's pgbouncer endpoint) is unsuitable for migrations. The app itself never reads
    // it; runtime always uses DATABASE_URL. Blank counts as unset. `prisma generate` needs no
    // database, so a missing URL only fails commands that connect.
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '',
  },
});
