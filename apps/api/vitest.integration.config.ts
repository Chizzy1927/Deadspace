import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { resolveTestDatabaseUrl } from './test/integration/test-database.js';
import { sharedAlias } from './vitest.config.js';

// Integration tests: run against a real PostGIS database (`docker compose up -d` locally,
// a service container in CI). Reads DATABASE_URL / TEST_DATABASE_URL from the environment or the
// repo-root .env, and always targets a separate *_test database (created + migrated by globalSetup).
const rootEnv = new URL('../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  resolve: { alias: sharedAlias },
  test: {
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
    env: { DATABASE_URL: resolveTestDatabaseUrl(process.env) },
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 120_000,
  },
});
