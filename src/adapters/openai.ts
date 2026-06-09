/**
 * OpenAI-compatible answerer: calls a Chat Completions endpoint directly using
 * the shared `buildPrompt`. Works with OpenAI, or any compatible API (Azure
 * OpenAI, Together, Ollama, LM Studio, OpenRouter, …) via `baseUrl`.
 *
 * SECURITY: if you run this in the browser, the API key is exposed to users.
 * For production, prefer running it server-side (or use `httpAnswerer` against
 * your own backend). It's offered here so single-user / local tools can plug in
 * an LLM with zero hosting.
 */

import { buildPrompt } from '../core/prompt';
import type { RulesAnswerer } from '../core/types';

export interface OpenAiAnswererOptions {
  apiKey: string;
  /** Defaults to "gpt-4o-mini". The domain's `ai.model` is used if set and no model is passed. */
  model?: string;
  /** Defaults to OpenAI. Point at any OpenAI-compatible API. */
  baseUrl?: string;
  temperature?: number;
  /** Override the domain's enrich step (e.g. disable network calls). */
  enrich?: (query: string) => Promise<string>;
}

export function openAiAnswerer(options: OpenAiAnswererOptions): RulesAnswerer {
  const baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');

  return async ({ query, domain, context }) => {
    let enrichment = '';
    const enrichFn = options.enrich ?? domain.ai.enrich;
    if (enrichFn) {
      try {
        enrichment = await enrichFn(query);
      } catch {
        /* enrichment is best-effort */
      }
    }

    const { system, user } = buildPrompt(domain, query, context, enrichment);

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model ?? domain.ai.model ?? 'gpt-4o-mini',
        temperature: options.temperature ?? 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!res.ok) throw new Error(`OpenAI endpoint returned ${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? '';
  };
}
