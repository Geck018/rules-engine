/**
 * Load every rulebook corpus used for training / lab testing.
 * Domain-agnostic: toys + shipped examples + anything in training/data/rulebooks/.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function slug(id) {
  return String(id)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

function normalizeEntries(raw) {
  const entries = raw.entries ?? [];
  return entries.map((e) => ({
    kind: e.kind === 'rule' || e.kind === 'glossary' ? e.kind : 'entry',
    number: e.number ?? e.title,
    title: e.title ?? e.number ?? e.term ?? 'Untitled',
    text: e.text ?? '',
    section: e.section,
  }));
}

function normalizeMtg(raw, limit = 80) {
  const rules = (raw.rules ?? [])
    .filter((r) => !r.isHeader && r.text)
    .slice(0, limit)
    .map((r) => ({
      kind: 'rule',
      number: r.number,
      title: r.number,
      text: r.text,
      section: r.sectionName || r.section,
    }));
  const glossary = (raw.glossary ?? []).slice(0, 40).map((g) => ({
    kind: 'glossary',
    number: g.term,
    title: g.term,
    text: g.text,
  }));
  return [...rules, ...glossary];
}

function normalizeDocs(raw) {
  if (Array.isArray(raw.docs) && raw.docs.length) {
    return raw.docs.map((d) => ({
      kind: d.kind === 'rule' || d.kind === 'glossary' ? d.kind : 'entry',
      number: String(d.number ?? d.title),
      title: String(d.title ?? d.number),
      text: String(d.text ?? ''),
      section: d.section,
    }));
  }
  if (Array.isArray(raw.rules) || Array.isArray(raw.glossary)) {
    return normalizeMtg(raw);
  }
  return normalizeEntries(raw);
}

function quickQuestionsFromDocs(docs) {
  return docs.slice(0, 4).map((d) => ({
    label: String(d.title).slice(0, 28),
    query:
      d.kind === 'glossary'
        ? `What is ${d.title}?`
        : d.kind === 'rule'
          ? `Explain rule ${d.number}`
          : `What does ${d.title} say?`,
  }));
}

function packDomain({
  id,
  label,
  docs,
  source = 'Training corpus',
  sourceUrl = '',
  versionLabel = 'local',
  icon = '📖',
  origin = 'builtin',
}) {
  const cleanDocs = (docs ?? []).filter((d) => d.text && String(d.text).trim());
  if (!cleanDocs.length) return null;
  return {
    id: slug(id),
    label: {
      short: label || id,
      full: label || id,
      icon,
    },
    source,
    sourceUrl,
    versionLabel,
    docCount: cleanDocs.length,
    origin,
    docs: cleanDocs,
    quickQuestions: quickQuestionsFromDocs(cleanDocs),
  };
}

/** Load custom uploads from training/data/rulebooks/*.json */
export function loadCustomRulebooks(dataDir) {
  const dir = join(dataDir, 'rulebooks');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = loadJson(join(dir, name));
      const id = raw.id || basename(name, '.json');
      const domain = packDomain({
        id,
        label: raw.label || raw.source || id,
        docs: normalizeDocs(raw),
        source: raw.source || `Custom: ${name}`,
        sourceUrl: raw.sourceUrl || raw.url || '',
        versionLabel: raw.versionLabel || raw.version || 'custom',
        icon: raw.icon || '📘',
        origin: 'custom',
      });
      if (domain) out.push(domain);
    } catch {
      /* skip bad files */
    }
  }
  return out;
}

/**
 * @param {string} root repo root
 * @returns {{ domains: object[], dataDir: string }}
 */
export function loadCorpora(root) {
  const dataDir = join(root, 'training', 'data');
  const domains = [];
  const seen = new Set();

  const push = (domain) => {
    if (!domain || seen.has(domain.id)) return;
    seen.add(domain.id);
    domains.push(domain);
  };

  // 1) Custom uploads first (user's rulebooks for "anything")
  for (const d of loadCustomRulebooks(dataDir)) push(d);

  // 2) Toy synthetic books
  try {
    const toys = loadJson(join(dataDir, 'toy_rulebooks.json'));
    for (const book of toys.books ?? []) {
      push(
        packDomain({
          id: book.id,
          label: book.label || book.id,
          docs: book.docs,
          source: 'Synthetic toy rulebook',
          icon: '🧪',
          origin: 'toy',
        })
      );
    }
  } catch {
    /* optional */
  }

  // 3) Shipped example datasets (same slices used in synth)
  const shipped = [
    {
      id: 'chess',
      label: 'Chess (FIDE Laws excerpt)',
      path: join(root, 'public/data/chess-laws.json'),
      icon: '♟️',
      normalize: normalizeDocs,
    },
    {
      id: 'warhammer',
      label: 'Warhammer 40K Core Rules',
      path: join(root, 'public/data/wh40k-core-rules.json'),
      icon: '⚔️',
      normalize: normalizeDocs,
    },
    {
      id: 'mtg',
      label: 'Magic: The Gathering',
      path: join(root, 'public/data/mtg-comprehensive-rules.json'),
      icon: '🪄',
      normalize: (raw) => normalizeMtg(raw),
    },
  ];

  for (const item of shipped) {
    try {
      if (!existsSync(item.path)) continue;
      const raw = loadJson(item.path);
      push(
        packDomain({
          id: item.id,
          label: item.label,
          docs: item.normalize(raw),
          source: raw.source || item.label,
          sourceUrl: raw.sourceUrl || '',
          versionLabel: raw.version || raw.edition || raw.effectiveDate || 'bundled',
          icon: item.icon,
          origin: 'example',
        })
      );
    } catch {
      /* optional */
    }
  }

  return { domains, dataDir };
}

/** Read last synth snapshot if present. */
export function loadCorporaManifest(root) {
  const path = join(root, 'training', 'data', 'corpora-manifest.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}
