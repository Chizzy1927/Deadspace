import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export const sharedAlias = {
  '@deadspace/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
};

// Unit tests: fast, no database.
export default defineConfig({
  resolve: { alias: sharedAlias },
  test: {
    include: ['test/unit/**/*.test.ts'],
  },
});
