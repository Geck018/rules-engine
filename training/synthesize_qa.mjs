#!/usr/bin/env node
/**
 * Build synthetic multi-domain Q&A + contrastive pairs from every loaded corpus
 * (custom rulebooks + toys + shipped examples). Writes corpora-manifest.json so
 * the lab Test tab can chat against exactly what was trained.
 *
 * Eval is held out by rulebook (domain id), not by shuffled row — so train never
 * sees those books. Override with EVAL_DOMAIN_IDS=id1,id2.
 *
 * Optional: --paraphrase (or PARAPHRASE=1) rewrites questions via an OpenAI-
 * compatible API when OPENAI_API_KEY / RULES_PARAPHRASE_API_KEY is set.
 *
 * Usage: node training/synthesize_qa.mjs [--paraphrase]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  examplesFromDoc,
  pairsFromDocs,
  formatSftRow,
  enrichExample,
  GENERIC_SYSTEM_PROMPT,
  ABSTAIN_RATE,
} from './lib/qa_templates.mjs';
import { paraphraseQuestions, wantsParaphrase } from './lib/paraphrase.mjs';
import { loadCorpora } from './lib/load_corpora.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const { domains, dataDir } = loadCorpora(root);
mkdirSync(dataDir, { recursive: true });

if (!domains.length) {
  console.error('No corpora found. Add JSON under training/data/rulebooks/ or keep example datasets.');
  process.exit(1);
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

/** Prefer one real book + one toy; keep at least one domain for training. */
function resolveEvalDomainIds(allDomains) {
  const available = new Set(allDomains.map((d) => d.id));
  const fromEnv = (process.env.EVAL_DOMAIN_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((id) => id && available.has(id));

  let chosen = fromEnv;
  if (!chosen.length) {
    const toys = allDomains.filter((d) => d.origin === 'toy');
    const real = allDomains.filter((d) => d.origin === 'example' || d.origin === 'custom');
    const preferredReal =
      real.find((d) => d.id === 'chess') || real.find((d) => d.id === 'nbha') || real[0];
    const preferredToy = toys.find((d) => d.id === 'lanterns') || toys[0];
    chosen = [];
    if (preferredReal) chosen.push(preferredReal.id);
    if (preferredToy) chosen.push(preferredToy.id);
  }

  // Never hold out every domain — leave at least one for train.
  if (chosen.length >= allDomains.length) {
    chosen = chosen.slice(0, Math.max(1, allDomains.length - 1));
  }
  return chosen;
}

const evalDomainIds = resolveEvalDomainIds(domains);
const evalDomainSet = new Set(evalDomainIds);
const trainDomains = domains.filter((d) => !evalDomainSet.has(d.id));
const evalDomains = domains.filter((d) => evalDomainSet.has(d.id));

const docsByDomain = new Map(domains.map((d) => [d.id, d.docs]));

function docsMapFor(domainId) {
  const docs = docsByDomain.get(domainId) ?? [];
  return new Map(docs.map((d) => [`${d.kind}:${d.number}`, d]));
}

function goldTextFor(domainId, id) {
  return docsMapFor(domainId).get(id)?.text ?? '';
}

const trainExamples = [];
const evalExamples = [];
const allPairs = [];

for (const domain of trainDomains) {
  for (const doc of domain.docs) {
    trainExamples.push(...examplesFromDoc(doc, domain.id));
  }
  allPairs.push(...pairsFromDocs(domain.docs, domain.id, 3, rand));
}

for (const domain of evalDomains) {
  for (const doc of domain.docs) {
    evalExamples.push(...examplesFromDoc(doc, domain.id));
  }
}

if (wantsParaphrase()) {
  const allForPara = [...trainExamples, ...evalExamples, ...allPairs];
  const stats = await paraphraseQuestions(allForPara, (row) => {
    const id = row.relevant_ids?.[0] ?? row.positive?.id;
    return id ? goldTextFor(row.domainId, id) : '';
  });
  if (stats.enabled) {
    console.log(`Paraphrased ${stats.paraphrased} questions (${stats.skipped} skipped).`);
  }
}

const trainSet = trainExamples.map((ex) => {
  const docs = docsByDomain.get(ex.domainId) ?? [];
  const abstain = rand() < ABSTAIN_RATE;
  return enrichExample(ex, docs, rand, { abstain });
});

const evalSet = evalExamples.map((ex) => {
  const docs = docsByDomain.get(ex.domainId) ?? [];
  // Eval keeps real answers for retrieval metrics; still add distractors in SFT context.
  return enrichExample(ex, docs, rand, { abstain: false });
});

const abstainCount = trainSet.filter((ex) => ex.abstain).length;

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
  evalDomainIds,
  trainDomainIds: trainDomains.map((d) => d.id),
  sftRows: trainSet.length,
  abstainRows: abstainCount,
  abstainRate: ABSTAIN_RATE,
  pairRows: allPairs.length,
  evalRows: evalSet.length,
  paraphrased: wantsParaphrase(),
  domains: domains.map((d) => ({
    id: d.id,
    label: d.label,
    source: d.source,
    sourceUrl: d.sourceUrl,
    versionLabel: d.versionLabel,
    docCount: d.docCount,
    origin: d.origin,
    heldOut: evalDomainSet.has(d.id),
    docs: d.docs,
    quickQuestions: d.quickQuestions,
  })),
};

writeFileSync(join(dataDir, 'corpora-manifest.json'), JSON.stringify(manifest, null, 2));

console.log(
  `Synthesized ${trainSet.length} SFT rows (${abstainCount} abstain), ${allPairs.length} pairs, ` +
    `${evalSet.length} eval rows | train=[${trainDomains.map((d) => d.id).join(', ')}] ` +
    `eval-held-out=[${evalDomainIds.join(', ')}] → ${dataDir}`
);
