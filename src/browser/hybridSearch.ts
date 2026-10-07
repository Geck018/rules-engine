/**
 * Hybrid TF + embedding retrieval via reciprocal rank fusion (RRF).
 * Domain-agnostic: operates on RuleDoc[] / RuleSearchResult[] only.
 */

import { buildIndex, searchIndex } from '../core/engine';
import type { RuleDoc, RuleSearchResult } from '../core/types';
import { searchVectorIndex, type VectorIndex } from './vectorIndex';
import type { EmbedderOptions } from './embedder';

const NUMERIC_RULE_PATTERN = /\b\d{3}(?:\.\d+[a-z]?)?\b/;

export interface HybridSearchOptions {
  /** RRF constant (default 60). */
  rrfK?: number;
  /** Weight for TF list in fusion (default 1). */
  tfWeight?: number;
  /** Weight for vector list in fusion (default 1). */
  vectorWeight?: number;
  /** How many candidates to pull from each retriever before fusion. */
  candidateLimit?: number;
  embedOptions?: EmbedderOptions;
}

function resultKey(r: RuleSearchResult): string {
  return `${r.kind}:${r.number}`;
}

/**
 * Reciprocal rank fusion of two ranked lists into a single RuleSearchResult[].
 * Pure function — easy to unit test without models.
 */
export function fuseRankings(
  tfResults: RuleSearchResult[],
  vectorResults: RuleSearchResult[],
  limit = 6,
  options: Pick<HybridSearchOptions, 'rrfK' | 'tfWeight' | 'vectorWeight'> = {}
): RuleSearchResult[] {
  const k = options.rrfK ?? 60;
  const tfW = options.tfWeight ?? 1;
  const vecW = options.vectorWeight ?? 1;

  const scores = new Map<string, number>();
  const byKey = new Map<string, RuleSearchResult>();

  tfResults.forEach((r, rank) => {
    const key = resultKey(r);
    byKey.set(key, r);
    scores.set(key, (scores.get(key) ?? 0) + tfW / (k + rank + 1));
  });

  vectorResults.forEach((r, rank) => {
    const key = resultKey(r);
    if (!byKey.has(key)) byKey.set(key, r);
    scores.set(key, (scores.get(key) ?? 0) + vecW / (k + rank + 1));
  });

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, score]) => {
      const base = byKey.get(key)!;
      return { ...base, score };
    });
}

/** TF-only search over docs (same scorer as the core engine). */
export function tfSearch(docs: RuleDoc[], query: string, limit = 6): RuleSearchResult[] {
  const index = buildIndex(docs);
  const usesNumbers = docs.some((d) => d.kind === 'rule');
  return searchIndex(index, query, limit, usesNumbers ? NUMERIC_RULE_PATTERN : undefined);
}

/**
 * Hybrid search: TF + vector cosine, fused with RRF.
 * If the vector index is missing/fails, returns TF-only results.
 */
export async function hybridSearch(
  docs: RuleDoc[],
  query: string,
  vectorIndex: VectorIndex | null,
  limit = 6,
  options: HybridSearchOptions = {}
): Promise<RuleSearchResult[]> {
  const candidateLimit = options.candidateLimit ?? Math.max(limit * 4, 16);
  const tfResults = tfSearch(docs, query, candidateLimit);

  if (!vectorIndex) return tfResults.slice(0, limit);

  let vectorResults: RuleSearchResult[] = [];
  try {
    vectorResults = await searchVectorIndex(
      vectorIndex,
      query,
      candidateLimit,
      options.embedOptions
    );
  } catch {
    return tfResults.slice(0, limit);
  }

  return fuseRankings(tfResults, vectorResults, limit, options);
}
