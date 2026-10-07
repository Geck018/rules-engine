/**
 * Shared retrieval scoring for TF baseline vs hybrid (TF + embeddings + RRF).
 */

export function tokenize(input) {
  const STOP = new Set([
    'a', 'an', 'the', 'is', 'are', 'what', 'when', 'how', 'does', 'do', 'rule',
    'rules', 'about', 'and', 'for', 'with', 'from', 'under', 'into',
  ]);
  return input
    .toLowerCase()
    .replace(/[^a-z0-9+/.-]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.+/-]+|[.+/-]+$/g, ''))
    .filter((t) => t.length > 2 && !STOP.has(t));
}

export function docId(doc) {
  return `${doc.kind}:${doc.number}`;
}

/** TF search → [{ id, score, doc }] */
export function tfSearch(docs, query, limit = 6) {
  const q = [...new Set(tokenize(query))];
  if (q.length === 0) return [];
  const scored = [];
  for (const doc of docs) {
    const blob = `${doc.title} ${doc.title} ${doc.text}`.toLowerCase();
    let score = 0;
    for (const t of q) {
      if (blob.includes(t)) score += 3;
    }
    if (score > 0) scored.push({ id: docId(doc), score, doc });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/** Reciprocal rank fusion of two id-ranked lists. */
export function fuseRankings(tfHits, vecHits, limit = 6, rrfK = 60) {
  const scores = new Map();
  const byId = new Map();
  tfHits.forEach((h, rank) => {
    byId.set(h.id, h);
    scores.set(h.id, (scores.get(h.id) ?? 0) + 1 / (rrfK + rank + 1));
  });
  vecHits.forEach((h, rank) => {
    if (!byId.has(h.id)) byId.set(h.id, h);
    scores.set(h.id, (scores.get(h.id) ?? 0) + 1 / (rrfK + rank + 1));
  });
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, score]) => ({ ...byId.get(id), score }));
}

export function meanPoolNormalize(tensor) {
  // transformers.js: { data, dims } with dims [1, seq, hidden] or [seq, hidden]
  const data = tensor.data ?? tensor;
  const dims = tensor.dims;
  let rows;
  let dim;
  if (dims && dims.length === 3) {
    const [, seq, hidden] = dims;
    dim = hidden;
    rows = seq;
  } else if (dims && dims.length === 2) {
    rows = dims[0];
    dim = dims[1];
  } else {
    return Float32Array.from(data);
  }
  const out = new Float32Array(dim);
  const arr = data instanceof Float32Array ? data : Float32Array.from(data);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < dim; j++) out[j] += arr[i * dim + j];
  }
  for (let j = 0; j < dim; j++) out[j] /= rows;
  let norm = 0;
  for (let j = 0; j < dim; j++) norm += out[j] * out[j];
  norm = Math.sqrt(norm) || 1;
  for (let j = 0; j < dim; j++) out[j] /= norm;
  return out;
}

export function cosine(a, b) {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function recallAtK(hitIds, relevantIds, k) {
  const top = new Set(hitIds.slice(0, k));
  return relevantIds.some((id) => top.has(id)) ? 1 : 0;
}

export function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** Citation / excerpt overlap groundedness on an answer string. */
export function groundedness(answer, docs) {
  const text = (answer || '').toLowerCase();
  if (!text || !docs.length) return 0;
  let hits = 0;
  for (const doc of docs) {
    const snippet = doc.text.toLowerCase().slice(0, 40);
    if (snippet && text.includes(snippet.slice(0, 24))) hits += 1;
    else if (
      text.includes(String(doc.number).toLowerCase()) ||
      text.includes(String(doc.title).toLowerCase())
    ) {
      hits += 0.5;
    }
  }
  return Math.min(1, hits / docs.length);
}

/** Extractive answer — same voice as production fallback (summary + Refer to). */
export function extractiveAnswer(hits) {
  if (!hits.length) return '';
  const doc = hits[0].doc;
  const label =
    doc.kind === 'glossary'
      ? doc.title
      : doc.kind === 'rule'
        ? doc.title && doc.title !== doc.number
          ? `Rule ${doc.number} — ${doc.title}`
          : `Rule ${doc.number}`
        : doc.section
          ? `${doc.section} — ${doc.title}`
          : doc.title;
  const m = doc.text.match(/^[^.!?]+[.!?]?/);
  const summary = (m ? m[0] : doc.text).trim();
  return `${summary}\n\nRefer to: ${label}`;
}

export function summarizeRecalls(flagsByK) {
  const out = {};
  for (const [k, flags] of Object.entries(flagsByK)) {
    out[`recallAt${k}`] = avg(flags);
  }
  return out;
}
