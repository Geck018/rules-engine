/**
 * Shared bootstrap helpers for Transformers.js pipelines.
 *
 * Attribution: uses Hugging Face Transformers.js (`@huggingface/transformers`),
 * Apache-2.0 — see THIRD_PARTY_NOTICES.md. The package is a local npm dependency
 * (bundled from node_modules); it is not loaded from a CDN.
 *
 * Model *weights* may still be fetched once from a model host, then cached in
 * the browser (Cache API / IndexedDB). After warm-up, remote Hub access is locked.
 */

import type { ProgressCallback } from './types';

let transformersPromise: Promise<typeof import('@huggingface/transformers')> | null = null;
let envConfigured = false;

/**
 * Lazily import the locally installed `@huggingface/transformers` package
 * (Transformers.js © Hugging Face, Apache-2.0).
 */
export function loadTransformers(): Promise<typeof import('@huggingface/transformers')> {
  if (!transformersPromise) {
    // Resolves from node_modules / the host bundler — not a remote script tag.
    transformersPromise = import('@huggingface/transformers').then((mod) => {
      if (!envConfigured && mod.env) {
        mod.env.useBrowserCache = true;
        mod.env.useWasmCache = true;
        mod.env.allowLocalModels = true;
        mod.env.allowRemoteModels = true;
        envConfigured = true;
      }
      return mod;
    });
  }
  return transformersPromise;
}

/** Map Transformers.js progress events into our ProgressCallback shape. */
export function makeProgressHandler(
  label: string,
  onProgress?: ProgressCallback
): ((event: Record<string, unknown>) => void) | undefined {
  if (!onProgress) return undefined;
  return (event) => {
    const status = String(event.status ?? 'progress');
    const file = typeof event.file === 'string' ? event.file : undefined;
    let progress: number | undefined;
    if (typeof event.progress === 'number') progress = event.progress / 100;
    else if (typeof event.loaded === 'number' && typeof event.total === 'number' && event.total > 0) {
      progress = event.loaded / event.total;
    }

    // Transformers reports "download/progress" for cache hits too; keep copy honest.
    const fromCache =
      status === 'done' ||
      (typeof event.cached !== 'undefined' && Boolean(event.cached)) ||
      String(event.name ?? '').includes('cache');

    if (status === 'initiate') {
      onProgress({
        status: 'initiate',
        message: `Loading ${label} (cached after first download)`,
        file,
        progress: 0,
      });
    } else if (status === 'download' || status === 'progress') {
      onProgress({
        status: status === 'download' ? 'download' : 'progress',
        message: fromCache
          ? `Loading cached ${label}${file ? `: ${file}` : ''}`
          : `Downloading ${label}${file ? `: ${file}` : ''} (one-time; kept in browser cache)`,
        file,
        progress,
      });
    } else if (status === 'done') {
      onProgress({
        status: 'done',
        message: `${label} file ready${file ? `: ${file}` : ''}`,
        file,
        progress: 1,
      });
    } else if (status === 'ready') {
      onProgress({ status: 'ready', message: `${label} ready`, progress: 1 });
    }
  };
}

/** Prefer WebGPU when available; fall back to WASM. */
export async function preferredDevice(): Promise<'webgpu' | 'wasm'> {
  try {
    const nav = globalThis.navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<unknown> };
    };
    if (nav?.gpu) {
      const adapter = await nav.gpu.requestAdapter();
      if (adapter) return 'webgpu';
    }
  } catch {
    /* fall through */
  }
  return 'wasm';
}
