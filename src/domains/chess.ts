/**
 * Chess domain — third example proving "one config object + one dataset".
 *
 * Uses `loadRaw` with a bundled JSON import so consumers need no static hosting
 * for this domain. (MTG/WH40K keep `datasetUrl` for the larger datasets.)
 */

import type { RulesDomain, NormalizedRules } from '../core/types';
import chessData from './data/chess-laws.json';

interface ChessEntry {
  title: string;
  section: string;
  text: string;
}
interface ChessDataset {
  source: string;
  sourceUrl: string;
  version: string;
  entries: ChessEntry[];
}

function normalize(raw: unknown): NormalizedRules {
  const ds = raw as ChessDataset;
  return {
    docs: ds.entries.map((e) => ({
      kind: 'entry' as const,
      number: e.title,
      title: e.title,
      text: e.text,
      section: e.section,
    })),
    meta: {
      source: ds.source,
      sourceUrl: ds.sourceUrl,
      versionLabel: ds.version,
    },
  };
}

export const chess: RulesDomain = {
  id: 'chess',
  label: { short: 'Chess', full: 'Chess (FIDE Laws excerpt)', icon: '♟️' },
  // Bundled load — no /data fetch required for this domain.
  loadRaw: async () => chessData,
  // Kept as a fallback for apps that prefer static assets.
  datasetUrl: '/data/chess-laws.json',
  sourceUrl: 'https://www.fide.com/FIDE/handbook/LawsOfChess.pdf',
  normalize,
  ai: {
    systemPrompt: `You are a chess rules assistant based on the FIDE Laws of Chess.
Explain outcomes in plain language. Cite Laws sections in a "Refer to:" line (e.g. Castling).
Do not invent tournament regulations beyond the provided excerpts.`,
    rulesHeading: 'FIDE Laws of Chess (excerpts, use these to ground your answer):',
  },
  ui: {
    citationLabel: '📜 FIDE Laws of Chess',
    greetingNote:
      "Answers are backed by an illustrative FIDE Laws excerpt and I'll cite the sections I use.",
    quickQuestions: [
      { label: 'Castling', query: 'How does castling work?' },
      { label: 'Checkmate', query: 'What is checkmate?' },
      { label: 'Knight', query: 'How does the knight move?' },
      { label: 'Board setup', query: 'How should the chessboard be placed?' },
    ],
  },
};
