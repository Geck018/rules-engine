/**
 * Magic: The Gathering domain.
 *
 * Dataset: the official Comprehensive Rules (numbered rules + glossary), parsed
 * from magic.wizards.com/en/rules into public/data/mtg-comprehensive-rules.json.
 * Enrichment: resolves card names mentioned in the question via the Scryfall API
 * so the AI can reason about real card text (worker-side only).
 */

import type { RulesDomain, RuleDoc, NormalizedRules } from '../core/types';

interface MtgRule {
  number: string;
  section: number;
  sectionName: string;
  isHeader: boolean;
  text: string;
}
interface MtgGlossaryEntry {
  term: string;
  text: string;
}
interface MtgDataset {
  source: string;
  sourceUrl: string;
  effectiveDate: string;
  rules: MtgRule[];
  glossary: MtgGlossaryEntry[];
}

function normalize(raw: unknown): NormalizedRules {
  const ds = raw as MtgDataset;
  const docs: RuleDoc[] = [];
  for (const rule of ds.rules) {
    const title = rule.isHeader ? rule.text.replace(/\.$/, '') : rule.number;
    docs.push({
      kind: 'rule',
      number: rule.number,
      title,
      text: rule.text,
      section: rule.sectionName,
    });
  }
  for (const entry of ds.glossary) {
    docs.push({ kind: 'glossary', number: entry.term, title: entry.term, text: entry.text });
  }
  return {
    docs,
    meta: {
      source: ds.source,
      sourceUrl: ds.sourceUrl,
      versionLabel: ds.effectiveDate ? `effective ${ds.effectiveDate}` : '',
    },
  };
}

// --- Scryfall enrichment (worker-side) --------------------------------------

const SCRYFALL_BASE = 'https://api.scryfall.com';

interface ScryfallCard {
  id: string;
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  keywords?: string[];
}

function extractCardNameCandidates(query: string): string[] {
  const candidates: string[] = [];
  const patterns = [
    /attack(?:ing)?(?: with)?\s+(.+?)(?:,| and | then | but | blocked| block|$)/i,
    /blocks?(?: with)?\s+(.+?)(?:,| and | then | but |$)/i,
    /blocked(?: by)?\s+(.+?)(?:,| and | then | but |$)/i,
    /cast(?:ing)?\s+(.+?)(?:,| and | then | but |$)/i,
    /play(?:ing)?\s+(.+?)(?:,| and | then | but |$)/i,
  ];
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (!match?.[1]) continue;
    const cleaned = match[1]
      .replace(/\b(a|an|the|my|their|opponent'?s)\b/gi, ' ')
      .replace(/[.?!]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length >= 3 && cleaned.length <= 60) candidates.push(cleaned);
  }
  return [...new Set(candidates)].slice(0, 3);
}

async function fetchCardSnapshotByName(name: string): Promise<ScryfallCard | null> {
  let res = await fetch(`${SCRYFALL_BASE}/cards/named?exact=${encodeURIComponent(name)}`);
  if (!res.ok) res = await fetch(`${SCRYFALL_BASE}/cards/named?fuzzy=${encodeURIComponent(name)}`);
  if (!res.ok) return null;
  const card = (await res.json()) as ScryfallCard;
  return {
    id: card.id,
    name: card.name,
    mana_cost: card.mana_cost,
    type_line: card.type_line,
    oracle_text: card.oracle_text,
    power: card.power,
    toughness: card.toughness,
    keywords: card.keywords || [],
  };
}

async function enrich(query: string): Promise<string> {
  const candidates = extractCardNameCandidates(query);
  if (candidates.length === 0) return '';
  const snapshots = (await Promise.all(candidates.map(fetchCardSnapshotByName))).filter(
    (c): c is ScryfallCard => c !== null
  );
  if (snapshots.length === 0) return '';
  const block = snapshots
    .map(
      (card, i) =>
        `${i + 1}) ${card.name}
- Mana Cost: ${card.mana_cost || 'N/A'}
- Type: ${card.type_line || 'N/A'}
- P/T: ${card.power && card.toughness ? `${card.power}/${card.toughness}` : 'N/A'}
- Keywords: ${(card.keywords || []).join(', ') || 'None listed'}
- Oracle: ${card.oracle_text || 'N/A'}`
    )
    .join('\n');
  return `Scryfall card context:\n${block}`;
}

export const mtg: RulesDomain = {
  id: 'mtg',
  label: { short: 'MTG', full: 'Magic: The Gathering', icon: '🪄' },
  datasetUrl: '/data/mtg-comprehensive-rules.json',
  sourceUrl: 'https://magic.wizards.com/en/rules',
  normalize,
  ai: {
    systemPrompt: `You are an MTG rules assistant.
Explain what happens in plain language with correct MTG rules logic.
Ground your answer in the "Official Comprehensive Rules" excerpts provided when they are relevant, and cite the rule numbers you rely on (e.g. "see 509.1").
Prefer this response format:
1) In this situation
2) What happens
3) Why (rule interaction, citing rule numbers)
If info is missing, ask one short clarifying question.
Do not invent rules or card text you are unsure about; rely on the provided rules excerpts.`,
    rulesHeading: 'Official Comprehensive Rules (excerpts, use these to ground your answer):',
    enrich,
  },
  ui: {
    citationLabel: '📜 Official Comprehensive Rules',
    greetingNote:
      "Answers are backed by the official Comprehensive Rules and I'll cite the rule numbers I use.",
    quickQuestions: [
      { label: 'Trample', query: 'What is trample?' },
      { label: 'Stack', query: 'How does the stack work?' },
      { label: 'Summoning Sickness', query: 'What is summoning sickness?' },
      { label: 'Instants', query: 'When can I cast instants?' },
    ],
  },
};
