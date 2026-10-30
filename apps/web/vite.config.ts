import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // VITE_* variables come from the repo-root .env shared with the API.
  envDir: '../..',
  resolve: {
    // Bundle @deadspace/shared from source, so the web app never needs a prior shared build.
    conditions: ['@deadspace/source', ...defaultClientConditions],
  },
  server: { port: 5173, strictPort: true },
});
