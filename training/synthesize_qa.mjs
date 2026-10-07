#!/usr/bin/env node
/**
 * Build synthetic multi-domain Q&A + contrastive pairs from every loaded corpus
 * (custom rulebooks + toys + shipped examples). Writes corpora-manifest.json so
 * the lab Test tab can chat against exactly what was trained.
 *
 * Usage: node training/synthesize_qa.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  examplesFromDoc,
  pairsFromDocs,
  formatSftRow,
  GENERIC_SYSTEM_PROMPT,
} from './lib/qa_templates.mjs';
import { loadCorpora } from './lib/load_corpora.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const { domains, dataDir } = loadCorpora(root);
mkdirSync(dataDir, { recursive: true });

if (!domains.length) {
  console.error('No corpora found. Add JSON under training/data/rulebooks/ or keep example datasets.');
  process.exit(1);
}

const allExamples = [];
const allPairs = [];
const docsByDomain = new Map();

for (const domain of domains) {
  docsByDomain.set(domain.id, domain.docs);
  for (const doc of domain.docs) {
    allExamples.push(...examplesFromDoc(doc, domain.id));
  }
  allPairs.push(...pairsFromDocs(domain.docs, domain.id));
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const shuffled = [...allExamples].sort(() => rand() - 0.5);

const evalCount = Math.min(64, Math.floor(shuffled.length * 0.12));
const evalSet = shuffled.slice(0, evalCount);
const trainSet = shuffled.slice(evalCount);

function docsMapFor(domainId) {
  const docs = docsByDomain.get(domainId) ?? [];
  return new Map(docs.map((d) => [`${d.kind}:${d.number}`, d]));
}

writeFileSync(
  join(dataDir, 'qa.jsonl'),
  trainSet
    .map((ex) => JSON.stringify(formatSftRow(ex, docsMapFor(ex.domainId), GENERIC_SYSTEM_PROMPT)))
    .join('\n') + '\n'
);

writeFileSync(join(dataDir, 'pairs.jsonl'), allPairs.map((p) => JSON.stringify(p)).join('\n') + '\n');

writeFileSync(
  join(dataDir, 'eval.jsonl'),
  evalSet
    .map((ex) =>
      JSON.stringify({
        ...ex,
        sft: formatSftRow(ex, docsMapFor(ex.domainId), GENERIC_SYSTEM_PROMPT),
      })
    )
    .join('\n') + '\n'
);

const manifest = {
  generatedAt: new Date().toISOString(),
  domainCount: domains.length,
  sftRows: trainSet.length,
  pairRows: allPairs.length,
  evalRows: evalSet.length,
  domains: domains.map((d) => ({
    id: d.id,
    label: d.label,
    source: d.source,
    sourceUrl: d.sourceUrl,
    versionLabel: d.versionLabel,
    docCount: d.docCount,
    origin: d.origin,
    docs: d.docs,
    quickQuestions: d.quickQuestions,
  })),
};

writeFileSync(join(dataDir, 'corpora-manifest.json'), JSON.stringify(manifest, null, 2));

console.log(
  `Synthesized ${trainSet.length} SFT rows, ${allPairs.length} pairs, ${evalSet.length} eval rows ` +
    `across ${domains.length} domains (${domains.map((d) => d.id).join(', ')}) → ${dataDir}`
);
