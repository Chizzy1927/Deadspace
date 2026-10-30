import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { sharedAlias } from './vitest.config.js';

// Integration tests: run against a real PostGIS database (`docker compose up -d` locally,
// a service container in CI). Reads DATABASE_URL from the environment or the repo-root .env.
const rootEnv = new URL('../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  resolve: { alias: sharedAlias },
  test: {
    include: ['test/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
