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
    // `prisma generate` needs no database, so a missing URL only fails commands that connect.
    url: process.env.DATABASE_URL ?? '',
  },
});
