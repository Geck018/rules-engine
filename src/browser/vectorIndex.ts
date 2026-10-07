/**
 * Cosine vector index over RuleDoc[], with IndexedDB persistence keyed by
 * domain id + content hash. Falls back to in-memory when IndexedDB is absent.
 */

import type { RuleDoc, RuleSearchResult } from '../core/types';
import { embedTexts, type EmbedderOptions } from './embedder';

const DB_NAME = 'rules-engine-vectors';
const STORE = 'indexes';
const DB_VERSION = 1;

export interface VectorIndex {
  domainId: string;
  contentHash: string;
  modelId: string;
  dim: number;
  /** Parallel to docs: doc key = `${kind}:${number}` */
  keys: string[];
  vectors: Float32Array[];
  docs: RuleDoc[];
}

function docKey(doc: RuleDoc): string {
  return `${doc.kind}:${doc.number}`;
}

function docEmbedText(doc: RuleDoc): string {
  return `${doc.title}\n${doc.text}`;
}

/** Stable hash of doc identities + lengths (enough to invalidate on dataset change). */
export function contentHash(docs: RuleDoc[]): string {
  let h = docs.length * 2654435761;
  for (const doc of docs) {
    const s = `${doc.kind}|${doc.number}|${doc.text.length}|${doc.title.length}`;
    for (let i = 0; i < s.length; i++) {
      h = (Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0);
    }
  }
  return h.toString(16);
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => resolve(null);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'cacheKey' });
        }
      };
      req.onsuccess = () => resolve(req.result);
    } catch {
      resolve(null);
    }
  });
}

interface StoredIndex {
  cacheKey: string;
  domainId: string;
  contentHash: string;
  modelId: string;
  dim: number;
  keys: string[];
  /** Serialized Float32 arrays */
  vectors: number[][];
  docs: RuleDoc[];
}

async function idbGet(cacheKey: string): Promise<StoredIndex | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(cacheKey);
    req.onsuccess = () => resolve((req.result as StoredIndex) ?? null);
    req.onerror = () => resolve(null);
  });
}

async function idbPut(stored: StoredIndex): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(stored);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

const memoryCache = new Map<string, VectorIndex>();

function cacheKey(domainId: string, hash: string, modelId: string): string {
  return `${domainId}::${hash}::${modelId}`;
}

function fromStored(stored: StoredIndex): VectorIndex {
  return {
    domainId: stored.domainId,
    contentHash: stored.contentHash,
    modelId: stored.modelId,
    dim: stored.dim,
    keys: stored.keys,
    vectors: stored.vectors.map((v) => Float32Array.from(v)),
    docs: stored.docs,
  };
}

/** Cosine similarity for L2-normalized vectors. */
export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

export interface BuildVectorIndexOptions extends EmbedderOptions {
  domainId: string;
  docs: RuleDoc[];
  /** Batch size for embedding. */
  batchSize?: number;
}

/** Build or restore a vector index for a rulebook. */
export async function buildVectorIndex(options: BuildVectorIndexOptions): Promise<VectorIndex> {
  const { domainId, docs } = options;
  const hash = contentHash(docs);
  const modelHint = options.modelId ?? 'pending';
  const memKeyGuess = cacheKey(domainId, hash, modelHint);

  const memHit = memoryCache.get(memKeyGuess);
  if (memHit) return memHit;

  // Try any cached entry for this domain+hash (model id may resolve after load).
  for (const [k, v] of memoryCache) {
    if (k.startsWith(`${domainId}::${hash}::`)) return v;
  }

  const storedGuess = await idbGet(memKeyGuess);
  if (storedGuess) {
    const idx = fromStored(storedGuess);
    memoryCache.set(cacheKey(domainId, hash, idx.modelId), idx);
    return idx;
  }

  // Probe IndexedDB for domain+hash with unknown model suffix via embedding load first.
  const { loadEmbedder } = await import('./embedder');
  const modelId = await loadEmbedder(options);
  const key = cacheKey(domainId, hash, modelId);

  const mem = memoryCache.get(key);
  if (mem) return mem;

  const stored = await idbGet(key);
  if (stored) {
    const idx = fromStored(stored);
    memoryCache.set(key, idx);
    return idx;
  }

  const batchSize = options.batchSize ?? 32;
  const vectors: Float32Array[] = [];
  const keys = docs.map(docKey);

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize).map(docEmbedText);
    const embedded = await embedTexts(batch, { ...options, modelId });
    vectors.push(...embedded);
  }

  const dim = vectors[0]?.length ?? 0;
  const index: VectorIndex = {
    domainId,
    contentHash: hash,
    modelId,
    dim,
    keys,
    vectors,
    docs,
  };

  memoryCache.set(key, index);
  await idbPut({
    cacheKey: key,
    domainId,
    contentHash: hash,
    modelId,
    dim,
    keys,
    vectors: vectors.map((v) => Array.from(v)),
    docs,
  });

  return index;
}

/** Search a vector index; returns RuleSearchResult[] scored by cosine similarity. */
export async function searchVectorIndex(
  index: VectorIndex,
  query: string,
  limit = 6,
  embedOptions?: EmbedderOptions
): Promise<RuleSearchResult[]> {
  const [qVec] = await embedTexts([query], {
    ...embedOptions,
    modelId: embedOptions?.modelId ?? index.modelId,
  });
  if (!qVec || qVec.length === 0) return [];

  const scored: RuleSearchResult[] = [];
  for (let i = 0; i < index.docs.length; i++) {
    const doc = index.docs[i];
    const score = cosine(qVec, index.vectors[i]);
    if (score <= 0) continue;
    scored.push({
      number: doc.number,
      title: doc.title,
      text: doc.text,
      kind: doc.kind,
      section: doc.section,
      score,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/** Clear in-memory vector cache (tests). */
export function clearVectorMemoryCache(): void {
  memoryCache.clear();
}
