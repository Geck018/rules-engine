/**
 * Generic rules ingestion: turn a plain-text rulebook into a structured JSON
 * dataset of heading-keyed prose entries. Works for any reasonably structured
 * document whose sections are introduced by short ALL-CAPS / Title-Case headings
 * (most sports and tabletop rulebooks).
 *
 * This is the DEFAULT parser. Sources with an unusual structure (e.g. MTG's
 * strict numeric scheme) ship their own parser instead.
 *
 * Usage:
 *   node scripts/ingest-generic.mjs \
 *     --in scripts/data/<source>.txt \
 *     --out public/data/<domain>-rules.json \
 *     --source "Official Rules Name" \
 *     --url "https://publisher/rules" \
 *     --version "2026 edition"
 *
 * To get the input text from a PDF:  pdftotext -layout rules.pdf out.txt
 *
 * Output shape (read by a wh40k-style domain.normalize):
 *   { source, sourceUrl, version, generatedAt, entryCount, entries: [{title, section, text}] }
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const IN = arg('in');
const OUT = arg('out');
const SOURCE = arg('source', 'Official Rules');
const URL = arg('url', '');
const VERSION = arg('version', '');
const MIN_BODY = Number(arg('minBody', '80'));

if (!IN || !OUT) {
  console.error('Required: --in <text file> --out <json file>');
  process.exit(1);
}

const raw = readFileSync(resolve(IN), 'utf8');
const lines = raw.split(/\r?\n/);

function isFooterNoise(line) {
  const t = line.trim();
  if (!t) return true;
  if (/^[0-9]{1,4}$/.test(t)) return true; // bare page numbers
  if (/^["“”'’.,\-–—:;]+$/.test(t)) return true; // lone punctuation
  return false;
}

// A heading: short, uppercase-dominant line with no lowercase letters.
function isHeading(line) {
  const t = line.trim();
  if (t.length < 3 || t.length > 56) return false;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length < 2) return false;
  if (/[a-z]/.test(t)) return false;
  if (!/^[A-Z0-9 &'’()/.\-]+$/.test(t)) return false;
  if (t.startsWith('■')) return false;
  return true;
}

function toTitleCase(s) {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/\b(Of|The|And|To|A|An|In|On|Or|For|With)\b/g, (m) => m.toLowerCase())
    .replace(/^([a-z])/, (_, c) => c.toUpperCase());
}

const blocks = [];
let current = null;

function flush() {
  if (!current) return;
  current.text = current.bodyLines
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/■\s*/g, '\n• ')
    .trim();
  blocks.push(current);
  current = null;
}

for (const line of lines) {
  if (isFooterNoise(line)) continue;
  if (isHeading(line)) {
    const heading = line.trim().replace(/\s+/g, ' ');
    flush();
    current = { title: toTitleCase(heading), section: toTitleCase(heading), bodyLines: [] };
  } else if (current) {
    current.bodyLines.push(line.trim());
  }
}
flush();

// Drop tiny/empty bodies; keep the richest body per heading.
const byTitle = new Map();
for (const block of blocks) {
  if (!block.text || block.text.length < MIN_BODY) continue;
  const existing = byTitle.get(block.title);
  if (!existing || block.text.length > existing.text.length) byTitle.set(block.title, block);
}

const entries = [...byTitle.values()].map((b) => ({
  title: b.title,
  section: b.section,
  text: b.text,
}));

const dataset = {
  source: SOURCE,
  sourceUrl: URL,
  version: VERSION,
  generatedAt: new Date().toISOString(),
  entryCount: entries.length,
  entries,
};

mkdirSync(dirname(resolve(OUT)), { recursive: true });
writeFileSync(resolve(OUT), JSON.stringify(dataset), 'utf8');

console.log(`Ingested "${SOURCE}" → ${OUT}`);
console.log(`  Entries: ${entries.length}`);
console.log(`  Size:    ${(JSON.stringify(dataset).length / 1024).toFixed(1)} KB`);
for (const e of entries.slice(0, 10)) console.log(`    - ${e.title}`);
