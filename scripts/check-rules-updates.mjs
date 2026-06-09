/**
 * Weekly rules freshness check.
 *
 * Probes each configured publisher source for a newer rules document than what
 * is baked into public/data, then updates public/data/rules-manifest.json. The
 * UI reads that manifest to show an "update available" banner.
 *
 * Adding a domain to the check = add an entry to SOURCES below.
 *
 * Usage:
 *   node scripts/check-rules-updates.mjs          # probe + update manifest
 *   node scripts/check-rules-updates.mjs --apply  # also download + rebuild (needs pdftotext)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MANIFEST_PATH = resolve(ROOT, 'public', 'data', 'rules-manifest.json');
const APPLY = process.argv.includes('--apply');

const UA = 'RulesEngine-FreshnessBot/1.0 (rules freshness check)';

async function fetchText(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/pdf,*/*', ...opts.headers },
    redirect: 'follow',
    ...opts,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// --- Per-domain probes -------------------------------------------------------
// Each probe returns { remoteVersion, remotePdfUrl } (best-effort; throw on fail).

async function probeMtg(sourceUrl) {
  const html = await fetchText(sourceUrl);
  let remotePdfUrl = null;
  const pdfMatches = [
    ...html.matchAll(/https?:\/\/media\.wizards\.com\/[^"'\s>]+\.pdf/gi),
    ...html.matchAll(/\/downloads\/[^"'\s>]+\.pdf/gi),
  ];
  for (const m of pdfMatches) {
    let url = m[0];
    if (url.startsWith('/')) url = `https://media.wizards.com${url}`;
    if (/comp|rules/i.test(url)) {
      remotePdfUrl = url.replace(/ /g, '%20');
      break;
    }
  }
  let remoteVersion = null;
  if (remotePdfUrl) {
    const fileDate = remotePdfUrl.match(/(\d{8})/);
    if (fileDate) {
      const d = fileDate[1];
      remoteVersion = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    }
  }
  return { remoteVersion, remotePdfUrl };
}

async function probeWarhammer(sourceUrl) {
  const html = await fetchText(sourceUrl, {
    headers: { Referer: 'https://www.warhammer-community.com/' },
  });
  let remotePdfUrl = null;
  for (const m of html.matchAll(
    /https?:\/\/assets\.warhammer-community\.com\/[^"'\s>]+\.pdf/gi
  )) {
    if (/core|warhammer40|40k|new40k/i.test(m[0])) {
      remotePdfUrl = m[0];
      break;
    }
  }
  let remoteVersion = null;
  if (remotePdfUrl) {
    if (/new40k|11|2026/i.test(remotePdfUrl)) remoteVersion = '11th Edition';
    else if (/24\.09|2024/i.test(remotePdfUrl)) remoteVersion = '10th Edition (24.09)';
    else remoteVersion = remotePdfUrl.split('/').pop()?.replace(/\.pdf$/i, '') || 'unknown';
  }
  return { remoteVersion, remotePdfUrl };
}

// Declare the sources to probe. Add a new game/sport here.
const SOURCES = [
  {
    id: 'mtg',
    sourceUrl: 'https://magic.wizards.com/en/rules',
    probe: probeMtg,
    isNewer: (remote, local) => remote && remote !== local,
  },
  {
    id: 'warhammer',
    sourceUrl: 'https://www.warhammer-community.com/en-gb/downloads/warhammer-40000/',
    probe: probeWarhammer,
    // Treat any non-10th edition as newer.
    isNewer: (remote, local) => remote && remote !== local && !/10th/i.test(remote),
  },
];

async function main() {
  const manifest = existsSync(MANIFEST_PATH) ? readJson(MANIFEST_PATH) : { domains: {} };
  if (!manifest.domains) manifest.domains = {};
  const now = new Date().toISOString();

  for (const source of SOURCES) {
    const entry = manifest.domains[source.id] || {};
    entry.sourceUrl = source.sourceUrl;
    entry.lastCheckedAt = now;
    try {
      const { remoteVersion, remotePdfUrl } = await source.probe(source.sourceUrl);
      const urlChanged = remotePdfUrl && remotePdfUrl !== entry.remotePdfUrl;
      const versionChanged = source.isNewer(remoteVersion, entry.localVersion ?? null);
      entry.remoteVersion = remoteVersion;
      entry.remotePdfUrl = remotePdfUrl;
      entry.updateAvailable = Boolean(versionChanged || urlChanged);
      delete entry.probeError;
      console.log(
        `[${source.id}] local=${entry.localVersion ?? '?'} remote=${remoteVersion ?? '?'} update=${entry.updateAvailable}`
      );
      if (APPLY && entry.updateAvailable) {
        entry.note =
          'A newer rules document was detected. Download it and re-run the ingestion + parser for this domain (see README), then commit the dataset.';
      }
    } catch (e) {
      entry.probeError = String(e);
      console.warn(`[${source.id}] probe failed: ${e}`);
    }
    manifest.domains[source.id] = entry;
  }

  manifest.lastCheckedAt = now;
  writeJson(MANIFEST_PATH, manifest);
  console.log(`\nManifest written to ${MANIFEST_PATH}`);

  const anyUpdate = Object.values(manifest.domains).some((d) => d.updateAvailable);
  if (anyUpdate) {
    console.log('⚠️  Rule updates are available. Refresh the affected dataset(s).');
    process.exitCode = 2;
  } else {
    console.log('✅ Rules are up to date (or remote check inconclusive).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
