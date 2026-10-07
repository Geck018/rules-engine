#!/usr/bin/env node
/**
 * Automated before/after retrieval efficacy on a frozen eval.jsonl:
 *   before = TF-only (pre-morning stack)
 *   after  = hybrid TF + MiniLM embeddings + RRF
 *
 * Also scores extractive-answer groundedness (top hit as answer) for both.
 *
 * Usage:
 *   npm run train:compare
 *   node training/eval_compare.mjs --json
 *   SKIP_EMBED=1 node training/eval_compare.mjs   # TF-only if no model download
 *
 * Writes training/data/compare-metrics.json
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCorpora, loadCorporaManifest } from './lib/load_corpora.mjs';
import {
  avg,
  cosine,
  docId,
  extractiveAnswer,
  fuseRankings,
  groundedness,
  meanPoolNormalize,
  recallAtK,
  tfSearch,
} from './lib/retrieval_scorer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dataDir = join(__dirname, 'data');
const asJson = process.argv.includes('--json');
const skipEmbed = process.env.SKIP_EMBED === '1' || process.argv.includes('--tf-only');

const manifest = loadCorporaManifest(root);
const corpora = manifest?.domains?.length ? manifest.domains : loadCorpora(root).domains;
const docsByDomain = new Map(corpora.map((d) => [d.id, d.docs]));

const evalPath = join(dataDir, 'eval.jsonl');
let lines;
try {
  lines = readFileSync(evalPath, 'utf8').trim().split('\n').filter(Boolean);
} catch {
  console.error('Missing training/data/eval.jsonl — run npm run train:synth first.');
  process.exit(1);
}

const rows = [];
for (const line of lines) {
  const row = JSON.parse(line);
  if (!docsByDomain.has(row.domainId)) continue;
  rows.push(row);
}

if (!rows.length) {
  console.error('No eval rows matched loaded corpora.');
  process.exit(1);
}

const ks = [1, 3, 6];
const beforeRecall = Object.fromEntries(ks.map((k) => [k, []]));
const afterRecall = Object.fromEntries(ks.map((k) => [k, []]));
const beforeGround = [];
const afterGround = [];

/** @type {Map<string, Float32Array[]>} */
const vectorsByDomain = new Map();
let embedModel = null;
let hybridEnabled = false;
let embedError = null;

async function loadEmbedder() {
  if (skipEmbed) {
    embedError = 'SKIP_EMBED / --tf-only';
    return;
  }
  try {
    const { pipeline } = await import('@huggingface/transformers');
    embedModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      dtype: 'q8',
    });
    hybridEnabled = true;
  } catch (err) {
    embedError = String(err?.message || err);
    hybridEnabled = false;
  }
}

async function embedTexts(texts) {
  const out = [];
  for (const text of texts) {
    const raw = await embedModel(text, { pooling: 'mean', normalize: true });
    // pooling may already be applied; handle both
    if (raw?.dims?.length === 2 && raw.dims[0] === 1) {
      const data = raw.data instanceof Float32Array ? raw.data : Float32Array.from(raw.data);
      out.push(data);
    } else if (raw?.dims?.length === 3) {
      out.push(meanPoolNormalize(raw));
    } else if (Array.isArray(raw)) {
      out.push(Float32Array.from(raw[0] ?? raw));
    } else {
      out.push(meanPoolNormalize(raw));
    }
  }
  return out;
}

async function ensureDomainVectors(domainId, docs) {
  if (vectorsByDomain.has(domainId)) return vectorsByDomain.get(domainId);
  const texts = docs.map((d) => `${d.title}\n${d.text}`);
  const batchSize = 32;
  const vectors = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    // embed one-by-one for stable API shape across transformers versions
    for (const t of batch) {
      const [v] = await embedTexts([t]);
      vectors.push(v);
    }
    if (!asJson) {
      process.stdout.write(
        `\rEmbedding ${domainId}: ${Math.min(i + batchSize, texts.length)}/${texts.length}`
      );
    }
  }
  if (!asJson) process.stdout.write('\n');
  vectorsByDomain.set(domainId, vectors);
  return vectors;
}

function vectorSearch(docs, vectors, queryVec, limit) {
  const scored = [];
  for (let i = 0; i < docs.length; i++) {
    const score = cosine(queryVec, vectors[i]);
    if (score > 0) scored.push({ id: docId(docs[i]), score, doc: docs[i] });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

await loadEmbedder();

if (!asJson) {
  console.log(
    hybridEnabled
      ? 'Comparing TF (before) vs hybrid TF+MiniLM (after)…'
      : `Hybrid unavailable (${embedError}). Reporting TF baseline only.`
  );
}

for (const row of rows) {
  const docs = docsByDomain.get(row.domainId);
  const relevant = row.relevant_ids;
  const relevantDocs = docs.filter((d) => relevant.includes(docId(d)));

  const tfHits = tfSearch(docs, row.question, 16);
  for (const k of ks) {
    beforeRecall[k].push(recallAtK(tfHits.map((h) => h.id), relevant, k));
  }
  beforeGround.push(groundedness(extractiveAnswer(tfHits), relevantDocs));

  let afterHits = tfHits;
  if (hybridEnabled) {
    const vectors = await ensureDomainVectors(row.domainId, docs);
    const [qVec] = await embedTexts([row.question]);
    const vecHits = vectorSearch(docs, vectors, qVec, 16);
    afterHits = fuseRankings(tfHits, vecHits, 6);
  }
  for (const k of ks) {
    afterRecall[k].push(recallAtK(afterHits.map((h) => h.id), relevant, k));
  }
  afterGround.push(groundedness(extractiveAnswer(afterHits), relevantDocs));
}

function packSide(recallMap, groundArr) {
  return {
    recallAt1: avg(recallMap[1]),
    recallAt3: avg(recallMap[3]),
    recallAt6: avg(recallMap[6]),
    extractiveGroundedness: avg(groundArr),
  };
}

const before = packSide(beforeRecall, beforeGround);
const after = packSide(afterRecall, afterGround);

const delta = {
  recallAt1: after.recallAt1 - before.recallAt1,
  recallAt3: after.recallAt3 - before.recallAt3,
  recallAt6: after.recallAt6 - before.recallAt6,
  extractiveGroundedness: after.extractiveGroundedness - before.extractiveGroundedness,
};

const report = {
  generatedAt: new Date().toISOString(),
  evalRows: rows.length,
  evalPath: 'training/data/eval.jsonl',
  hybridEnabled,
  embedError,
  embeddingModel: hybridEnabled ? 'Xenova/all-MiniLM-L6-v2' : null,
  before: {
    label: 'TF-only (pre-change baseline)',
    ...before,
  },
  after: {
    label: hybridEnabled
      ? 'Hybrid TF + MiniLM + RRF (post-change)'
      : 'TF-only (hybrid skipped)',
    ...after,
  },
  delta,
};

mkdirSync(dataDir, { recursive: true });
const outPath = join(dataDir, 'compare-metrics.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));

if (asJson) {
  console.log(JSON.stringify(report));
} else {
  const pct = (n) => `${(n * 100).toFixed(1)}%`;
  const signed = (n) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}pp`;
  console.log(`\nEval rows: ${report.evalRows}`);
  console.log('\nBefore (TF)                  After (hybrid)              Δ');
  console.log(
    `Recall@1  ${pct(before.recallAt1).padStart(7)}                 ${pct(after.recallAt1).padStart(7)}              ${signed(delta.recallAt1)}`
  );
  console.log(
    `Recall@3  ${pct(before.recallAt3).padStart(7)}                 ${pct(after.recallAt3).padStart(7)}              ${signed(delta.recallAt3)}`
  );
  console.log(
    `Recall@6  ${pct(before.recallAt6).padStart(7)}                 ${pct(after.recallAt6).padStart(7)}              ${signed(delta.recallAt6)}`
  );
  console.log(
    `Extractive groundedness ${pct(before.extractiveGroundedness)} → ${pct(after.extractiveGroundedness)} (${signed(delta.extractiveGroundedness)})`
  );
  console.log(`\nWrote ${outPath}`);
}

// Non-zero exit if hybrid ran and Recall@3 got worse by >5pp (regression guard)
if (hybridEnabled && delta.recallAt3 < -0.05) {
  console.error('Hybrid Recall@3 regressed by more than 5pp vs TF.');
  process.exit(1);
}
