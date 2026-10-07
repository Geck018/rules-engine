/** Shared browser-model types (progress, options). */

export interface ModelProgress {
  status: 'initiate' | 'download' | 'progress' | 'done' | 'ready' | 'error';
  /** Human-readable label, e.g. "Downloading embedding model". */
  message: string;
  /** 0–1 when known. */
  progress?: number;
  file?: string;
}

export type ProgressCallback = (progress: ModelProgress) => void;

/** Public embedding model (~20–30MB). Cached in the browser after first download. */
export const DEFAULT_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

/**
 * Specialized embedding id (contrastive-tuned). Opt-in via `preferSpecialized`
 * once the HF repo is public — until then the runtime uses {@link DEFAULT_EMBEDDING_MODEL}.
 */
export const SPECIALIZED_EMBEDDING_MODEL = 'geck018/rules-embed-minilm';

/**
 * Public generative model (~0.5B instruct, q4 ≈ a few hundred MB).
 * Downloaded once, then served from browser cache — not per question.
 */
export const DEFAULT_GENERATOR_MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct';

/**
 * Specialized generator id (SFT). Opt-in via `preferSpecialized` when published.
 */
export const SPECIALIZED_GENERATOR_MODEL = 'geck018/rules-qa-instruct';
