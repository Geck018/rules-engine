/**
 * Lazy dataset loading + per-domain caching, plus the client-facing search and
 * context helpers. Datasets are fetched once and indexed on first use so they
 * never bloat the initial bundle.
 */

import { buildIndex, searchIndex, buildContext, type IndexedDoc } from './engine';
import type { RulesDomain, RulesMeta, RuleSearchResult } from './types';

interface DomainCache {
  promise: Promise<boolean> | null;
  index: IndexedDoc[] | null;
  meta: RulesMeta | null;
}

const caches = new Map<string, DomainCache>();

function cacheFor(id: string): DomainCache {
  let c = caches.get(id);
  if (!c) {
    c = { promise: null, index: null, meta: null };
    caches.set(id, c);
  }
  return c;
}

/** MTG-style numeric rule references like "509.1" or "702.19c". */
const NUMERIC_RULE_PATTERN = /\b\d{3}(?:\.\d+[a-z]?)?\b/;

/** Resolve a domain's raw dataset JSON via `loadRaw` (preferred) or `datasetUrl`. */
async function fetchRaw(domain: RulesDomain): Promise<unknown> {
  if (domain.loadRaw) return domain.loadRaw();
  if (domain.datasetUrl) {
    const res = await fetch(domain.datasetUrl);
    return res.ok ? res.json() : null;
  }
  throw new Error(`Domain "${domain.id}" has neither loadRaw nor datasetUrl.`);
}

/** Lazily load, normalize and index a domain's dataset. Resolves to success. */
export async function loadDomain(domain: RulesDomain): Promise<boolean> {
  const cache = cacheFor(domain.id);
  if (cache.index) return true;
  if (!cache.promise) {
    cache.promise = Promise.resolve()
      .then(() => fetchRaw(domain))
      .then((raw: unknown) => {
        if (!raw) return false;
        const { docs, meta } = domain.normalize(raw);
        cache.index = buildIndex(docs);
        cache.meta = meta;
        return true;
      })
      .catch(() => false);
  }
  return cache.promise;
}

/** Metadata about a loaded domain (source, version), if available. */
export function getDomainMeta(domain: RulesDomain): RulesMeta | null {
  return cacheFor(domain.id).meta;
}

/** Search a loaded domain. Returns [] if the dataset hasn't loaded yet. */
export function searchDomain(domain: RulesDomain, query: string, limit = 6): RuleSearchResult[] {
  const index = cacheFor(domain.id).index;
  if (!index) return [];
  // Only enable numeric lookup for domains whose ids/data use numbered rules.
  const usesNumbers = index.some((d) => d.kind === 'rule');
  return searchIndex(index, query, limit, usesNumbers ? NUMERIC_RULE_PATTERN : undefined);
}

/** Build a grounding context block for a domain + query. */
export function buildDomainContext(
  domain: RulesDomain,
  query: string,
  charBudget = 2600,
  limit = 6
): string {
  return buildContext(searchDomain(domain, query, limit), charBudget);
}
