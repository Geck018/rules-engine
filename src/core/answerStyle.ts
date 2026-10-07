/**
 * Shared answer style: quick natural language + clear rule reference.
 * Full rule text lives in citations for people who want to dig in.
 */

import type { RuleSearchResult } from './types';

/** Appended to every answerer's system prompt via {@link buildPrompt}. */
export const ANSWER_STYLE_INSTRUCTIONS = `Answer style (required):
1) Give a short, natural answer in plain language (1–3 sentences). Lead with what the rule means for the asker — not a numbered essay.
2) End with a clear reference line: "Refer to: …" using the official rule number and/or title from the excerpts (e.g. "Refer to: Rule 1.1 — Ground rules" or "Refer to: Castling").
3) Do not paste long rule quotes in the chat reply. The UI shows full source excerpts below for anyone who wants detail.
4) Use only the provided official excerpts. If they are insufficient, say so briefly and ask one clarifying question.
5) Do not invent rules.`;

/** Human-readable citation label for a search hit. */
export function citeLabel(hit: Pick<RuleSearchResult, 'kind' | 'number' | 'title' | 'section'>): string {
  if (hit.kind === 'glossary') return hit.title;
  if (hit.kind === 'rule') {
    return hit.title && hit.title !== hit.number
      ? `Rule ${hit.number} — ${hit.title}`
      : `Rule ${hit.number}`;
  }
  return hit.section ? `${hit.section} — ${hit.title}` : hit.title;
}

function firstSentence(text: string): string {
  const m = text.match(/^[^.!?]+[.!?]?/);
  return (m ? m[0] : text).trim();
}

/**
 * Offline / extractive fallback in the same voice as the model style:
 * plain summary + "Refer to: …"
 */
export function formatQuickAnswer(hits: RuleSearchResult[]): string | null {
  if (!hits.length) return null;
  const top = hits[0];
  const ref = citeLabel(top);
  const summary = firstSentence(top.text);
  const extras =
    hits.length > 1
      ? hits
          .slice(1, 3)
          .map((h) => citeLabel(h))
          .join('; ')
      : '';

  let out = `${summary}\n\nRefer to: ${ref}`;
  if (extras) out += ` (see also: ${extras})`;
  return out;
}
