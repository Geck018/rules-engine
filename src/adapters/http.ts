/**
 * HTTP answerer: posts the question + retrieved context to an endpoint you host
 * (e.g. the bundled Cloudflare Worker, or any backend that returns
 * `{ response: string }`). Use this when you DO want a server to hold an API
 * key / call an LLM. Not required — omit any answerer for offline mode.
 */

import type { RulesAnswerer } from '../core/types';

export interface HttpAnswererOptions {
  /** Endpoint that accepts { query, gameSystem, rulesContext } and returns { response }. */
  url: string;
  /** Extra headers (e.g. auth). */
  headers?: Record<string, string>;
}

export function httpAnswerer(options: HttpAnswererOptions): RulesAnswerer {
  return async ({ query, domain, context }) => {
    const res = await fetch(options.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: JSON.stringify({ query, gameSystem: domain.id, rulesContext: context }),
    });
    if (!res.ok) throw new Error(`Answerer endpoint returned ${res.status}`);
    const data = (await res.json()) as { response?: string };
    return data.response ?? '';
  };
}
