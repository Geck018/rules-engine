/**
 * Build a RulesDomain from a lab/training corpus payload.
 * Same shape for toys, examples, and any uploaded rulebook.
 */

import type { RulesDomain, NormalizedRules, RuleDoc } from '../../src/core/types';

const GENERIC_SYSTEM_PROMPT =
  'You are a portable rules referee for any rulebook. ' +
  'Answer only from the provided official excerpts. ' +
  'Be brief and practical for someone who needs a quick call.';

export interface CorpusDomainPayload {
  id: string;
  label: { short: string; full: string; icon: string };
  source: string;
  sourceUrl: string;
  versionLabel: string;
  docCount: number;
  origin: string;
  docs: RuleDoc[];
  quickQuestions: { label: string; query: string }[];
}

export function domainFromCorpus(corpus: CorpusDomainPayload): RulesDomain {
  const payload = {
    docs: corpus.docs,
    meta: {
      source: corpus.source,
      sourceUrl: corpus.sourceUrl || 'local://training',
      versionLabel: corpus.versionLabel,
    },
  };

  return {
    id: corpus.id,
    label: {
      short: corpus.label.short,
      full: corpus.label.full,
      icon: '',
    },
    loadRaw: async () => payload,
    sourceUrl: corpus.sourceUrl || 'local://training',
    normalize: (raw: unknown): NormalizedRules => {
      const r = raw as typeof payload;
      return { docs: r.docs, meta: r.meta };
    },
    ai: {
      systemPrompt: `${GENERIC_SYSTEM_PROMPT}\nRulebook: ${corpus.label.full}.`,
      rulesHeading: 'Official rules (excerpts, use these to ground your answer):',
    },
    ui: {
      citationLabel: 'Source rules',
      greetingNote: `${corpus.docCount} documents · ${corpus.origin} corpus`,
      quickQuestions: corpus.quickQuestions?.length
        ? corpus.quickQuestions
        : [{ label: 'Overview', query: 'What are the key rules?' }],
    },
  };
}
