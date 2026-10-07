/**
 * Browser sentence embedder via Transformers.js.
 * Domain-agnostic: same weights for every rulebook.
 * First download ~20–30MB; then loaded from browser cache.
 */

import { loadTransformers, makeProgressHandler, preferredDevice } from './loader';
import { rememberModelId, resolveModelIds } from './modelResolve';
import { DEFAULT_EMBEDDING_MODEL, type ProgressCallback } from './types';

type FeatureExtractionPipeline = (
  texts: string | string[],
  options?: Record<string, unknown>
) => Promise<{ data: Float32Array | number[]; dims?: number[] } | Float32Array | number[][]>;

let pipeline: FeatureExtractionPipeline | null = null;
let loadedModelId: string | null = null;
let loadPromise: Promise<string> | null = null;

export interface EmbedderOptions {
  /** Explicit model id. */
  modelId?: string;
  fallbackModelId?: string;
  /** Try specialized HF repo when published (default false). */
  preferSpecialized?: boolean;
  onProgress?: ProgressCallback;
}

async function createPipeline(
  modelId: string,
  onProgress?: ProgressCallback
): Promise<FeatureExtractionPipeline> {
  const { pipeline: create } = await loadTransformers();
  const device = await preferredDevice();
  const pipe = await create('feature-extraction', modelId, {
    device,
    dtype: 'q8',
    progress_callback: makeProgressHandler('embedding model', onProgress),
  });
  return pipe as unknown as FeatureExtractionPipeline;
}

/** Load (or reuse) the embedding pipeline. Concurrent callers share one load. */
export async function loadEmbedder(options: EmbedderOptions = {}): Promise<string> {
  if (pipeline && loadedModelId) return loadedModelId;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { primary, fallback } = await resolveModelIds('embedding', {
      modelId: options.modelId,
      fallbackModelId: options.fallbackModelId ?? DEFAULT_EMBEDDING_MODEL,
      preferSpecialized: options.preferSpecialized,
    });

    try {
      pipeline = await createPipeline(primary, options.onProgress);
      loadedModelId = primary;
    } catch (err) {
      if (primary === fallback) throw err;
      options.onProgress?.({
        status: 'error',
        message: `Embedder ${primary} failed; falling back to ${fallback}`,
      });
      pipeline = await createPipeline(fallback, options.onProgress);
      loadedModelId = fallback;
    }

    rememberModelId('embedding', loadedModelId);
    options.onProgress?.({
      status: 'ready',
      message: `Embedding model ready (${loadedModelId})`,
      progress: 1,
    });
    return loadedModelId;
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

function toMatrix(output: unknown, count: number): Float32Array[] {
  if (output && typeof output === 'object' && 'data' in (output as object)) {
    const tensor = output as { data: Float32Array | number[]; dims: number[] };
    const data =
      tensor.data instanceof Float32Array ? tensor.data : Float32Array.from(tensor.data);
    const dims = tensor.dims;
    if (dims.length === 2) {
      const dim = dims[1];
      const rows: Float32Array[] = [];
      for (let i = 0; i < dims[0]; i++) {
        rows.push(data.subarray(i * dim, (i + 1) * dim));
      }
      return rows;
    }
    if (dims.length === 3) {
      const dim = dims[2];
      const rows: Float32Array[] = [];
      for (let i = 0; i < dims[0]; i++) {
        rows.push(data.subarray(i * dim, (i + 1) * dim));
      }
      return rows;
    }
    return [data];
  }

  if (Array.isArray(output)) {
    if (output.length === 0) return [];
    if (typeof output[0] === 'number') {
      return [Float32Array.from(output as number[])];
    }
    return (output as number[][]).map((row) => Float32Array.from(row));
  }

  return Array.from({ length: count }, () => new Float32Array(0));
}

/** Embed one or more texts; returns L2-normalized vectors. */
export async function embedTexts(
  texts: string[],
  options: EmbedderOptions = {}
): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  await loadEmbedder(options);
  if (!pipeline) throw new Error('Embedder failed to load');

  const raw = await pipeline(texts, { pooling: 'mean', normalize: true });
  return toMatrix(raw, texts.length);
}

/** Reset cached pipeline (tests). */
export function resetEmbedder(): void {
  pipeline = null;
  loadedModelId = null;
  loadPromise = null;
}
