/**
 * Reusable Cloudflare Workers AI handler factory for the rules assistant.
 *
 * Pass the domains your worker should support; this returns a handler for
 * POST /api/rules/chat that:
 *   1. resolves the domain by `gameSystem` id,
 *   2. runs the domain's optional `enrich()` step (e.g. MTG Scryfall lookup),
 *   3. builds a grounded prompt from the client-supplied rules excerpts, and
 *   4. calls Workers AI.
 *
 * Framework-agnostic: no React/DOM imports. Drop into any Worker router.
 */

import type { RulesDomain } from '../core/types';
import { buildPrompt } from '../core/prompt';

export interface RulesAiEnv {
  AI?: {
    run: (model: string, input: Record<string, unknown>) => Promise<{ response?: string }>;
  };
}

interface ChatRequestBody {
  query?: string;
  gameSystem?: string;
  rulesContext?: string;
}

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const MAX_CONTEXT_CHARS = 6000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function getAiResponse(
  env: RulesAiEnv,
  domain: RulesDomain,
  query: string,
  rulesContext: string
): Promise<string> {
  if (!env.AI) throw new Error('Workers AI binding is not configured');

  let enrichment = '';
  if (domain.ai.enrich) {
    try {
      enrichment = await domain.ai.enrich(query);
    } catch {
      /* enrichment is best-effort */
    }
  }

  const { system, user } = buildPrompt(domain, query, rulesContext, enrichment);

  const result = await env.AI.run(domain.ai.model || DEFAULT_MODEL, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
  });

  return (result.response || '').trim();
}

/**
 * Build a `POST /api/rules/chat` handler over the supplied domains.
 * Returns `(request, env) => Promise<Response>`.
 */
export function createRulesHandler(domains: RulesDomain[]) {
  const byId = new Map(domains.map((d) => [d.id, d]));

  return async function handleRulesChat(request: Request, env: RulesAiEnv): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    let body: ChatRequestBody;
    try {
      body = (await request.json()) as ChatRequestBody;
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const query = (body.query || '').trim();
    const gameSystem = (body.gameSystem || domains[0]?.id || '').toLowerCase();
    const rulesContext = (body.rulesContext || '').slice(0, MAX_CONTEXT_CHARS);

    if (!query) return json({ error: 'query is required' }, 400);

    const domain = byId.get(gameSystem);
    if (!domain) {
      const supported = domains.map((d) => d.label.full).join(', ');
      return json({
        response: `I currently support: ${supported}. Please ask about one of those.`,
        used_ai: false,
        fallback: true,
      });
    }

    try {
      const response = await getAiResponse(env, domain, query, rulesContext);
      return json({ response, used_ai: true, fallback: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown AI error';
      return json({
        response: 'I had trouble generating an AI ruling right now. Falling back to local rules logic.',
        used_ai: false,
        fallback: true,
        error: message,
      });
    }
  };
}
