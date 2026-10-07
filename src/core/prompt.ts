/**
 * Prompt construction shared by all answerers (worker, OpenAI, browser, custom).
 * Persona comes from the domain; answer style is shared so replies stay quick
 * and citable everywhere.
 */

import { ANSWER_STYLE_INSTRUCTIONS } from './answerStyle';
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

  const user = `Rulebook: ${domain.label.full}
Question: ${query}

${domain.ai.rulesHeading}
${rulesSection}${enrichmentBlock}

Remember: short natural answer, then "Refer to: [rule ref]". Full text is shown separately.`;

  const system = `${domain.ai.systemPrompt.trim()}\n\n${ANSWER_STYLE_INSTRUCTIONS}`;

  return { system, user };
}
