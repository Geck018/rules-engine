#!/usr/bin/env node
/**
 * Offline retrieval eval using the same TF scorer as production (no NN download).
 * Reports Recall@k against training/data/eval.jsonl relevant_ids.
 *
 * For neural Recall@k, run after models are available and point a custom script
 * at hybridSearch — this keeps CI free of multi-hundred-MB downloads.
 *
 * Usage: node training/eval_retrieval.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCorpora, loadCorporaManifest } from './lib/load_corpora.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Vitest/ts build may not exist; duplicate a tiny TF scorer for eval portability.
function tokenize(input) {
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

function tfSearch(docs, query, limit = 6) {
  const q = [...new Set(tokenize(query))];
  if (q.length === 0) return [];
  const scored = [];
  for (const doc of docs) {
    const blob = `${doc.title} ${doc.title} ${doc.text}`.toLowerCase();
    let score = 0;
    for (const t of q) {
      if (blob.includes(t)) score += 3;
    }
    if (score > 0) scored.push({ id: `${doc.kind}:${doc.number}`, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

function groundedness(answer, docs) {
  const text = (answer || '').toLowerCase();
  if (!text) return 0;
  let hits = 0;
  for (const doc of docs) {
    const snippet = doc.text.toLowerCase().slice(0, 40);
    if (snippet && text.includes(snippet.slice(0, 24))) hits += 1;
    if (text.includes(String(doc.number).toLowerCase()) || text.includes(doc.title.toLowerCase())) {
      hits += 0.5;
    }
  }
  return Math.min(1, hits / Math.max(1, docs.length));
}

const manifest = loadCorporaManifest(root);
const corpora = manifest?.domains?.length ? manifest.domains : loadCorpora(root).domains;
const docsByDomain = new Map(corpora.map((d) => [d.id, d.docs]));

const evalPath = join(__dirname, 'data/eval.jsonl');
let lines;
try {
  lines = readFileSync(evalPath, 'utf8').trim().split('\n').filter(Boolean);
} catch {
  console.error('Missing training/data/eval.jsonl — run npm run train:synth first.');
  process.exit(1);
}

const ks = [1, 3, 6];
const recalls = Object.fromEntries(ks.map((k) => [k, []]));
const groundScores = [];

for (const line of lines) {
  const row = JSON.parse(line);
  const docs = docsByDomain.get(row.domainId);
  if (!docs) continue;
  const hits = tfSearch(docs, row.question, 6).map((h) => h.id);
  for (const k of ks) {
    const top = new Set(hits.slice(0, k));
    const ok = row.relevant_ids.some((id) => top.has(id));
    recalls[k].push(ok ? 1 : 0);
  }
  const relevantDocs = docs.filter((d) =>
    row.relevant_ids.includes(`${d.kind}:${d.number}`)
  );
  groundScores.push(groundedness(row.answer, relevantDocs));
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

const metrics = {
  evalRows: recalls[1].length,
  recallAt1: avg(recalls[1]),
  recallAt3: avg(recalls[3]),
  recallAt6: avg(recalls[6]),
  groundedness: avg(groundScores),
  generatedAt: new Date().toISOString(),
};

mkdirSync(join(__dirname, 'data'), { recursive: true });
writeFileSync(join(__dirname, 'data', 'eval-metrics.json'), JSON.stringify(metrics, null, 2));

const asJson = process.argv.includes('--json');
if (asJson) {
  console.log(JSON.stringify(metrics));
} else {
  console.log(`Eval rows used: ${metrics.evalRows}`);
  for (const k of ks) {
    console.log(`Recall@${k}: ${(metrics[`recallAt${k}`] * 100).toFixed(1)}%`);
  }
  console.log(`Answer groundedness (heuristic): ${(metrics.groundedness * 100).toFixed(1)}%`);
}

// Soft gate for CI — toy + templated data should beat chance
if (metrics.recallAt3 < 0.4) {
  console.error('Recall@3 below 0.4 — check synthesizer / corpora.');
  process.exit(1);
}
