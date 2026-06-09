/**
 * Warhammer 40,000 domain.
 *
 * Dataset: the free Core Rules (prose entries keyed by heading), parsed from
 * warhammer-community.com into public/data/wh40k-core-rules.json. No card-style
 * enrichment — answers are grounded purely on retrieved Core Rules entries.
 */

import type { RulesDomain, RuleDoc, NormalizedRules } from '../core/types';

interface WarhammerEntry {
  title: string;
  section: string;
  text: string;
}
interface WarhammerDataset {
  source: string;
  sourceUrl: string;
  edition: string;
  entries: WarhammerEntry[];
}

function normalize(raw: unknown): NormalizedRules {
  const ds = raw as WarhammerDataset;
  const docs: RuleDoc[] = ds.entries.map((entry) => ({
    kind: 'entry',
    number: entry.title,
    title: entry.title,
    text: entry.text,
    section: entry.section,
  }));
  return {
    docs,
    meta: {
      source: ds.source,
      sourceUrl: ds.sourceUrl,
      versionLabel: ds.edition || '',
    },
  };
}

export const wh40k: RulesDomain = {
  id: 'warhammer',
  label: { short: 'Warhammer 40K', full: 'Warhammer 40,000', icon: '⚔️' },
  datasetUrl: '/data/wh40k-core-rules.json',
  sourceUrl: 'https://www.warhammer-community.com/en-gb/downloads/warhammer-40000/',
  normalize,
  ai: {
    systemPrompt: `You are a Warhammer 40,000 rules assistant.
Explain what happens in plain language with correct Warhammer 40,000 Core Rules logic.
Ground your answer in the "Official Core Rules" excerpts provided when they are relevant, and cite the rule/section names you rely on (e.g. "see Engagement Range").
Prefer this response format:
1) In this situation
2) What happens
3) Why (rule interaction, citing the relevant Core Rules sections)
If info is missing, ask one short clarifying question.
Do not invent rules or datasheet text you are unsure about; rely on the provided rules excerpts.`,
    rulesHeading: 'Official Core Rules (excerpts, use these to ground your answer):',
  },
  ui: {
    citationLabel: '📜 Official Core Rules',
    greetingNote:
      "Answers are backed by the official Warhammer 40,000 Core Rules and I'll cite the relevant sections.",
    quickQuestions: [
      { label: 'Engagement Range', query: 'What is Engagement Range?' },
      { label: 'Objective Control', query: 'How does controlling an objective marker work?' },
      { label: 'Making Attacks', query: 'How do I make attacks and resolve hits, wounds and saves?' },
      { label: 'Charging', query: 'How does the Charge phase work?' },
    ],
  },
};
