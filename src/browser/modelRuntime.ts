/**
 * Session-level model readiness. After a successful warm load we disable remote
 * Hub fetches so prompts never re-ping huggingface.co — weights come from the
 * in-memory pipelines + browser Cache API only.
 */

import { loadTransformers } from './loader';
import type { ProgressCallback } from './types';

let warmPromise: Promise<void> | null = null;
let remoteLocked = false;

export function areModelsWarmed(): boolean {
  return warmPromise !== null;
}

/** After first successful download/cache load, stop all Hub network access. */
export async function lockRemoteHub(): Promise<void> {
  if (remoteLocked) return;
  const { env } = await loadTransformers();
  env.allowRemoteModels = false;
  remoteLocked = true;
}

export function isRemoteHubLocked(): boolean {
  return remoteLocked;
}

/**
 * Ensure embedder + generator are loaded once for the page session.
 * Concurrent callers (preload + first question) share the same promise.
 */
export function ensureModelsWarmed(options: {
  embeddingModelId?: string;
  embeddingFallbackModelId?: string;
  generatorModelId?: string;
  generatorFallbackModelId?: string;
  preferSpecialized?: boolean;
  onProgress?: ProgressCallback;
  tfOnly?: boolean;
} = {}): Promise<void> {
  if (!warmPromise) {
    warmPromise = (async () => {
      const { loadEmbedder } = await import('./embedder');
      if (!options.tfOnly) {
        await loadEmbedder({
          modelId: options.embeddingModelId,
          fallbackModelId: options.embeddingFallbackModelId,
          preferSpecialized: options.preferSpecialized,
          onProgress: options.onProgress,
        });
      }
      const { loadGenerator } = await import('./generator');
      await loadGenerator({
        modelId: options.generatorModelId,
        fallbackModelId: options.generatorFallbackModelId,
        preferSpecialized: options.preferSpecialized,
        onProgress: options.onProgress,
      });
      await lockRemoteHub();
      options.onProgress?.({
        status: 'ready',
        message: 'Models ready (browser cache; Hub locked for this session)',
        progress: 1,
      });
    })().catch((err) => {
      warmPromise = null;
      throw err;
    });
  }
  return warmPromise;
}
