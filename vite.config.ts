import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Demo app lives in examples/demo. Library entry points are built by tsup.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'demo-dist',
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
