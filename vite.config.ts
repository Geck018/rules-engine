import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The demo app lives in src/demo. The library entry points (core/react/worker)
// are consumed via the "exports" map in package.json by downstream apps.
export default defineConfig({
  plugins: [react()],
  // Keep the demo build separate from the library build (tsup -> dist/).
  build: {
    outDir: 'demo-dist',
  },
  server: {
    port: 5174,
    proxy: {
      // Forward API calls to a locally running worker (npm run worker:dev).
      '/api': 'http://localhost:8787',
    },
  },
});
