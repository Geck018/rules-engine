/**
 * Domain-agnostic search engine. Operates purely on `RuleDoc[]` — it has zero
 * knowledge of any specific game. A lightweight TF-style scorer ranks rule
 * documents against a free-text query, with small boosts for exact matches,
 * concise glossary definitions, and direct rule-number lookups.
 */

import type { RuleDoc, RuleSearchResult } from './types';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have',
  'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
  'might', 'must', 'can', 'what', 'when', 'where', 'which', 'who', 'whom',
  'whose', 'why', 'how', 'if', 'then', 'else', 'so', 'than', 'too', 'very',
  'just', 'only', 'and', 'but', 'or', 'nor', 'not', 'no', 'yes', 'it', 'its',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'me',
  'my', 'your', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'about', 'into', 'as', 'work', 'works', 'mean', 'means', 'explain', 'tell',
  'help', 'rule', 'rules',
]);

export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9+/.-]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.+/-]+|[.+/-]+$/g, ''))
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

/** A document plus its precomputed term frequencies, ready to search. */
export interface IndexedDoc extends RuleDoc {
  termFreq: Map<string, number>;
}

/** Precompute the term-frequency index for a set of docs. */
export function buildIndex(docs: RuleDoc[]): IndexedDoc[] {
  return docs.map((doc) => {
    const termFreq = new Map<string, number>();
    // Index the title (weighted by repetition) together with the body so a
    // query that names a rule/term scores it highly.
    const indexText = `${doc.title} ${doc.title} ${doc.text}`;
    for (const token of tokenize(indexText)) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }
    return { ...doc, termFreq };
  });
}

/**
 * Search an index for the entries most relevant to a free-text query.
 * `numberPattern` (optional) enables direct rule-number lookups for domains
 * that use a numeric scheme (e.g. MTG "509.1").
 */
export function searchIndex(
  index: IndexedDoc[],
  query: string,
  limit = 6,
  numberPattern?: RegExp
): RuleSearchResult[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];
  const uniqueTokens = [...new Set(queryTokens)];

  const numberMatch = numberPattern ? query.match(numberPattern) : null;

  const results: RuleSearchResult[] = [];

  for (const doc of index) {
    let score = 0;
    for (const token of uniqueTokens) {
      const tf = doc.termFreq.get(token);
      if (tf) score += 3 + Math.min(tf, 4);
    }
    if (score === 0) continue;

    const matched = uniqueTokens.filter((t) => doc.termFreq.has(t)).length;
    score += matched * 2;
    if (matched === uniqueTokens.length && uniqueTokens.length > 1) score += 6;

    // Concise definitions are great for "what is X" questions.
    if (doc.kind === 'glossary') score += 2;

    if (numberMatch && doc.number.toLowerCase() === numberMatch[0].toLowerCase()) {
      score += 100;
    }

    results.push({
      number: doc.number,
      title: doc.title,
      text: doc.text,
      kind: doc.kind,
      section: doc.section,
      score,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Build a compact, citation-friendly context block from search results,
 * suitable for grounding an LLM prompt. Capped to `charBudget`.
 */
export function buildContext(matches: RuleSearchResult[], charBudget = 2600): string {
  if (matches.length === 0) return '';
  const lines: string[] = [];
  let used = 0;
  for (const match of matches) {
    let label: string;
    if (match.kind === 'glossary') label = `Glossary — ${match.title}`;
    else if (match.kind === 'rule') label = `Rule ${match.number}`;
    else label = match.section ? `${match.section} — ${match.title}` : match.title;

    const entry = `${label}: ${match.text}`;
    if (used + entry.length > charBudget && lines.length > 0) break;
    lines.push(entry);
    used += entry.length;
  }
  return lines.join('\n');
}
