/**
 * Browser-local RAG: hybrid TF + embedding retrieval and a small instruct model.
 *
 * Depends on the locally installed `@huggingface/transformers` (Transformers.js,
 * © Hugging Face, Apache-2.0). See THIRD_PARTY_NOTICES.md. Hosts must install
 * that package; we do not load it from a CDN.
 */

export {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_GENERATOR_MODEL,
  SPECIALIZED_EMBEDDING_MODEL,
  SPECIALIZED_GENERATOR_MODEL,
  type ModelProgress,
  type ProgressCallback,
} from './types';

export { loadTransformers, preferredDevice, makeProgressHandler } from './loader';
export { loadEmbedder, embedTexts, resetEmbedder, type EmbedderOptions } from './embedder';
export {
  buildVectorIndex,
  searchVectorIndex,
  contentHash,
  cosine,
  clearVectorMemoryCache,
  type VectorIndex,
  type BuildVectorIndexOptions,
} from './vectorIndex';
export {
  fuseRankings,
  tfSearch,
  hybridSearch,
  type HybridSearchOptions,
} from './hybridSearch';
export {
  createBrowserRetriever,
  getBrowserRetrieverForDomain,
  clearBrowserRetrieverCache,
  createRulesChatSearch,
  type BrowserRetriever,
  type CreateBrowserRetrieverOptions,
} from './retriever';
export {
  loadGenerator,
  generateAnswer,
  formatChatPrompt,
  resetGenerator,
  type GeneratorOptions,
} from './generator';
export {
  browserModelAnswerer,
  preloadBrowserModels,
  type BrowserModelAnswererOptions,
} from './answerer';
export {
  resolveModelIds,
  isModelReachable,
  rememberModelId,
  forgetModelId,
} from './modelResolve';
export {
  ensureModelsWarmed,
  lockRemoteHub,
  isRemoteHubLocked,
  areModelsWarmed,
} from './modelRuntime';
