import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { labApiPlugin } from './scripts/lab-api-plugin.mjs';

// Demo / lab UI lives in examples/demo. Library entry points are built by tsup.
// /api/lab/* is handled by the Vite lab plugin; optional Workers proxy is unused
// by the default browser RAG path.
export default defineConfig({
  plugins: [react(), labApiPlugin()],
  build: {
    outDir: 'demo-dist',
  },
  server: {
    port: 5174,
  },
  // Prebundle Transformers.js from local node_modules (not a CDN).
  optimizeDeps: {
    include: ['@huggingface/transformers'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
