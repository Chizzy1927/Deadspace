import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // VITE_* variables come from the repo-root .env shared with the API.
  envDir: '../..',
  resolve: {
    // Bundle @deadspace/shared from source, so the web app never needs a prior shared build.
    conditions: ['@deadspace/source', ...defaultClientConditions],
  },
  // Vitest runs tests in the ssr environment and sets its conditions to server defaults, so the
  // client conditions above don't reach tests. Without this, tests silently fall back to the shared
  // package's dist/ build (absent on a clean checkout). Merged with Vitest's own defaults.
  ssr: { resolve: { conditions: ['@deadspace/source'] } },
  server: { port: 5173, strictPort: true },
});
