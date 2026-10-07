/**
 * Browser retriever: builds a per-domain vector index and exposes hybrid search
 * compatible with RulesChat's optional `search` override.
 */

import { buildContext } from '../core/engine';
import type { RuleDoc, RuleSearchResult, RulesDomain } from '../core/types';
import { getDomainDocs, loadDomain } from '../core/loader';
import type { EmbedderOptions } from './embedder';
import { hybridSearch, type HybridSearchOptions } from './hybridSearch';
import { buildVectorIndex, type VectorIndex } from './vectorIndex';
import type { ProgressCallback } from './types';

export interface BrowserRetriever {
  /** Hybrid search over the indexed rulebook. */
  search: (query: string, limit?: number) => Promise<RuleSearchResult[]>;
  /** Grounding context string from hybrid hits. */
  buildContext: (query: string, charBudget?: number, limit?: number) => Promise<string>;
  /** Underlying vector index (null if embedding failed and TF-only mode). */
  getVectorIndex: () => VectorIndex | null;
  /** Domain id this retriever was built for. */
  domainId: string;
}

export interface CreateBrowserRetrieverOptions extends EmbedderOptions, HybridSearchOptions {
  domainId: string;
  docs: RuleDoc[];
  onProgress?: ProgressCallback;
  /** If true, skip embeddings and use TF only (tests / tiny devices). */
  tfOnly?: boolean;
  /** Embedding batch size when building the vector index. */
  batchSize?: number;
}

/** Create a hybrid retriever for an already-normalized rulebook. */
export async function createBrowserRetriever(
  options: CreateBrowserRetrieverOptions
): Promise<BrowserRetriever> {
  let vectorIndex: VectorIndex | null = null;

  if (!options.tfOnly) {
    try {
      vectorIndex = await buildVectorIndex({
        domainId: options.domainId,
        docs: options.docs,
        modelId: options.modelId,
        fallbackModelId: options.fallbackModelId,
        onProgress: options.onProgress,
        batchSize: options.batchSize,
      });
    } catch {
      options.onProgress?.({
        status: 'error',
        message: 'Embedding index unavailable; using TF-only retrieval',
      });
      vectorIndex = null;
    }
  }

  const hybridOpts: HybridSearchOptions = {
    rrfK: options.rrfK,
    tfWeight: options.tfWeight,
    vectorWeight: options.vectorWeight,
    candidateLimit: options.candidateLimit,
    embedOptions: {
      modelId: options.modelId,
      fallbackModelId: options.fallbackModelId,
      onProgress: options.onProgress,
    },
  };

  return {
    domainId: options.domainId,
    getVectorIndex: () => vectorIndex,
    search: (query, limit = 6) =>
      hybridSearch(options.docs, query, vectorIndex, limit, hybridOpts),
    buildContext: async (query, charBudget = 2600, limit = 6) => {
      const hits = await hybridSearch(options.docs, query, vectorIndex, limit, hybridOpts);
      return buildContext(hits, charBudget);
    },
  };
}

const retrieverCache = new Map<string, Promise<BrowserRetriever>>();

/**
 * Ensure a browser retriever exists for a loaded domain (caches by domain id).
 * Loads the domain dataset if needed.
 */
export async function getBrowserRetrieverForDomain(
  domain: RulesDomain,
  options: Omit<CreateBrowserRetrieverOptions, 'domainId' | 'docs'> = {}
): Promise<BrowserRetriever> {
  const existing = retrieverCache.get(domain.id);
  if (existing) return existing;

  const promise = (async () => {
    await loadDomain(domain);
    const docs = getDomainDocs(domain);
    if (!docs || docs.length === 0) {
      throw new Error(`Domain "${domain.id}" has no documents loaded`);
    }
    return createBrowserRetriever({
      ...options,
      domainId: domain.id,
      docs,
    });
  })();

  retrieverCache.set(domain.id, promise);
  try {
    return await promise;
  } catch (err) {
    retrieverCache.delete(domain.id);
    throw err;
  }
}

/** Drop cached retrievers (tests / domain reload). */
export function clearBrowserRetrieverCache(): void {
  retrieverCache.clear();
}

/**
 * RulesChat-compatible search override: hybrid when the retriever is ready,
 * otherwise falls back to core TF search via a sync empty result (chat awaits).
 */
export function createRulesChatSearch(
  getRetriever: (domain: RulesDomain) => Promise<BrowserRetriever>
): (domain: RulesDomain, query: string, limit: number) => Promise<RuleSearchResult[]> {
  return async (domain, query, limit) => {
    const retriever = await getRetriever(domain);
    return retriever.search(query, limit);
  };
}
