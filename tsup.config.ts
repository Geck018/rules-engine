import { defineConfig } from 'tsup';

// Builds the distributable library. Each subpath export is its own entry; React
// is external (a peer dependency). The demo app (src/demo) and the deployable
// worker (worker/) are NOT part of the published library.
export default defineConfig({
  entry: {
    'core/index': 'src/core/index.ts',
    'react/index': 'src/react/index.ts',
    'adapters/index': 'src/adapters/index.ts',
    'worker/index': 'src/worker/handler.ts',
    'domains/index': 'src/domains/index.ts',
  },
  format: ['esm'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  target: 'es2021',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
});
