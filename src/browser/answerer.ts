/**
 * Browser-local RulesAnswerer: hybrid retrieval grounding + small instruct model.
 * No Cloudflare / network LLM required after models are cached in the browser.
 */

import { buildContext } from '../core/engine';
import { buildPrompt } from '../core/prompt';
import type { RulesAnswerer, RuleSearchResult } from '../core/types';
import { generateAnswer, type GeneratorOptions } from './generator';
import { ensureModelsWarmed } from './modelRuntime';
import {
  clearBrowserRetrieverCache,
  getBrowserRetrieverForDomain,
  type CreateBrowserRetrieverOptions,
} from './retriever';
import type { ProgressCallback } from './types';

export interface BrowserModelAnswererOptions {
  /** Embedding model override (default: public MiniLM, browser-cached after first load). */
  embeddingModelId?: string;
  embeddingFallbackModelId?: string;
  /** Generator model override (default: public Qwen 0.5B instruct ONNX). */
  generatorModelId?: string;
  generatorFallbackModelId?: string;
  /**
   * Try unpublished/specialized HF repos first. Default false — avoids 401s until
   * those weights are public. Models still cache in the browser after first download.
   */
  preferSpecialized?: boolean;
  onProgress?: ProgressCallback;
  maxNewTokens?: number;
  temperature?: number;
  /** Skip neural retrieval (TF + generator only). */
  tfOnly?: boolean;
  /** Override domain enrich (e.g. disable network). */
  enrich?: (query: string) => Promise<string>;
  /**
   * If true, re-run hybrid search inside the answerer and prefer those citations'
   * context over the context passed by RulesChat (useful when chat still uses TF).
   */
  reRetrieve?: boolean;
}

/**
 * Create a pluggable answerer that runs entirely in the browser via Transformers.js.
 */
export function browserModelAnswerer(options: BrowserModelAnswererOptions = {}): RulesAnswerer {
  const retrieverOpts: Omit<CreateBrowserRetrieverOptions, 'domainId' | 'docs'> = {
    modelId: options.embeddingModelId,
    fallbackModelId: options.embeddingFallbackModelId,
    preferSpecialized: options.preferSpecialized,
    onProgress: options.onProgress,
    tfOnly: options.tfOnly,
  };

  const genOpts: GeneratorOptions = {
    modelId: options.generatorModelId,
    fallbackModelId: options.generatorFallbackModelId,
    preferSpecialized: options.preferSpecialized,
    onProgress: options.onProgress,
    maxNewTokens: options.maxNewTokens,
    temperature: options.temperature,
  };

  return async ({ query, domain, context, citations }) => {
    // Wait for (or finish) the one-time warm load — never start a second Hub trip on prompt.
    await ensureModelsWarmed({
      embeddingModelId: options.embeddingModelId,
      embeddingFallbackModelId: options.embeddingFallbackModelId,
      generatorModelId: options.generatorModelId,
      generatorFallbackModelId: options.generatorFallbackModelId,
      preferSpecialized: options.preferSpecialized,
      onProgress: options.onProgress,
      tfOnly: options.tfOnly,
    });

    let grounding = context;
    let hits: RuleSearchResult[] = citations;

    const shouldReRetrieve = options.reRetrieve !== false;
    if (shouldReRetrieve) {
      try {
        const retriever = await getBrowserRetrieverForDomain(domain, retrieverOpts);
        hits = await retriever.search(query, 6);
        grounding = buildContext(hits, 2600);
      } catch {
        /* keep chat-provided context */
      }
    }

    let enrichment = '';
    const enrichFn = options.enrich ?? domain.ai.enrich;
    if (enrichFn) {
      try {
        enrichment = await enrichFn(query);
      } catch {
        /* enrichment is best-effort */
      }
    }

    const { system, user } = buildPrompt(domain, query, grounding, enrichment);
    return generateAnswer(system, user, genOpts);
  };
}

/** Warm embedding + generator once (UX preload). Same promise as first answer. */
export async function preloadBrowserModels(
  options: BrowserModelAnswererOptions = {}
): Promise<void> {
  await ensureModelsWarmed({
    embeddingModelId: options.embeddingModelId,
    embeddingFallbackModelId: options.embeddingFallbackModelId,
    generatorModelId: options.generatorModelId,
    generatorFallbackModelId: options.generatorFallbackModelId,
    preferSpecialized: options.preferSpecialized,
    onProgress: options.onProgress,
    tfOnly: options.tfOnly,
  });
}

export { clearBrowserRetrieverCache };
