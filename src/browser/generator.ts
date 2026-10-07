/**
 * Browser generative model for grounded rules answers (Transformers.js).
 * First download is large (~300MB+ q4 for 0.5B); then browser-cached.
 * In-memory pipeline is reused for the whole session — not re-downloaded per question.
 */

import { loadTransformers, makeProgressHandler, preferredDevice } from './loader';
import { rememberModelId, resolveModelIds } from './modelResolve';
import { DEFAULT_GENERATOR_MODEL, type ProgressCallback } from './types';

export interface GeneratorOptions {
  modelId?: string;
  fallbackModelId?: string;
  /** Try specialized HF repo when published (default false). */
  preferSpecialized?: boolean;
  onProgress?: ProgressCallback;
  maxNewTokens?: number;
  temperature?: number;
}

type TextGenerationPipeline = (
  prompt: string,
  options?: Record<string, unknown>
) => Promise<Array<{ generated_text: string }>>;

let pipeline: TextGenerationPipeline | null = null;
let loadedModelId: string | null = null;
let loadPromise: Promise<string> | null = null;

async function createPipeline(
  modelId: string,
  onProgress?: ProgressCallback
): Promise<TextGenerationPipeline> {
  const { pipeline: create } = await loadTransformers();
  const device = await preferredDevice();
  const pipe = await create('text-generation', modelId, {
    device,
    dtype: 'q4',
    progress_callback: makeProgressHandler('generator model', onProgress),
  });
  return pipe as unknown as TextGenerationPipeline;
}

/** Load (or reuse) the text-generation pipeline. Concurrent callers share one load. */
export async function loadGenerator(options: GeneratorOptions = {}): Promise<string> {
  if (pipeline && loadedModelId) return loadedModelId;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { primary, fallback } = await resolveModelIds('generator', {
      modelId: options.modelId,
      fallbackModelId: options.fallbackModelId ?? DEFAULT_GENERATOR_MODEL,
      preferSpecialized: options.preferSpecialized,
    });

    try {
      pipeline = await createPipeline(primary, options.onProgress);
      loadedModelId = primary;
    } catch (err) {
      if (primary === fallback) throw err;
      options.onProgress?.({
        status: 'error',
        message: `Generator ${primary} failed; falling back to ${fallback}`,
      });
      pipeline = await createPipeline(fallback, options.onProgress);
      loadedModelId = fallback;
    }

    rememberModelId('generator', loadedModelId);
    options.onProgress?.({
      status: 'ready',
      message: `Generator ready (${loadedModelId}) — cached for this browser`,
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

/**
 * Format chat-style system/user into a single prompt suitable for small instruct models.
 * Qwen-style ChatML is widely supported by ONNX instruct exports.
 */
export function formatChatPrompt(system: string, user: string): string {
  return (
    `<|im_start|>system\n${system}<|im_end|>\n` +
    `<|im_start|>user\n${user}<|im_end|>\n` +
    `<|im_start|>assistant\n`
  );
}

function extractAssistant(generated: string, prompt: string): string {
  if (generated.startsWith(prompt)) {
    return generated.slice(prompt.length).trim();
  }
  const marker = '<|im_start|>assistant\n';
  const idx = generated.lastIndexOf(marker);
  if (idx >= 0) {
    return generated
      .slice(idx + marker.length)
      .replace(/<\|im_end\|>[\s\S]*$/, '')
      .trim();
  }
  return generated.trim();
}

/** Generate an answer from system + user prompts. */
export async function generateAnswer(
  system: string,
  user: string,
  options: GeneratorOptions = {}
): Promise<string> {
  await loadGenerator(options);
  if (!pipeline) throw new Error('Generator failed to load');

  const prompt = formatChatPrompt(system, user);
  const maxNewTokens = options.maxNewTokens ?? 256;
  const temperature = options.temperature ?? 0.2;

  const outputs = await pipeline(prompt, {
    max_new_tokens: maxNewTokens,
    temperature,
    do_sample: temperature > 0,
    return_full_text: true,
  });

  const text = outputs?.[0]?.generated_text ?? '';
  return extractAssistant(text, prompt);
}

/** Reset cached pipeline (tests). */
export function resetGenerator(): void {
  pipeline = null;
  loadedModelId = null;
  loadPromise = null;
}
