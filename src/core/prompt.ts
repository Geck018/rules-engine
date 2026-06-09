/**
 * Prompt construction shared by all answerers (worker, OpenAI, custom). Keeps
 * the grounding format identical no matter which LLM a host app plugs in.
 */

import type { RulesDomain } from './types';

export interface PromptParts {
  system: string;
  user: string;
}

/**
 * Build the system + user messages for a grounded rules answer.
 * `context` is the retrieved official-rules excerpts; `enrichment` is optional
 * extra context (e.g. card data) produced by `domain.ai.enrich`.
 */
export function buildPrompt(
  domain: RulesDomain,
  query: string,
  context: string,
  enrichment = ''
): PromptParts {
  const rulesSection = context.trim()
    ? context.trim()
    : 'No official rules excerpts were provided for this question.';

  const enrichmentBlock = enrichment.trim() ? `\n\n${enrichment.trim()}` : '';

  const user = `Game: ${domain.label.full}
Question: ${query}

${domain.ai.rulesHeading}
${rulesSection}${enrichmentBlock}`;

  return { system: domain.ai.systemPrompt, user };
}
