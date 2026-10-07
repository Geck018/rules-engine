import { describe, expect, it } from 'vitest';
import { fuseRankings, tfSearch } from '../hybridSearch';
import type { RuleDoc, RuleSearchResult } from '../../core/types';

const DOCS: RuleDoc[] = [
  {
    kind: 'rule',
    number: '509.1',
    title: '509.1',
    text: 'The defending player chooses which creatures will block and how.',
    section: 'Combat',
  },
  {
    kind: 'glossary',
    number: 'Trample',
    title: 'Trample',
    text: 'A keyword ability that lets a creature deal excess combat damage to the player or planeswalker it is attacking.',
  },
  {
    kind: 'entry',
    number: 'Castling',
    title: 'Castling',
    text: 'A special king-and-rook move when neither piece has moved and the king is not in check.',
    section: 'Special Moves',
  },
  {
    kind: 'entry',
    number: 'Checkmate',
    title: 'Checkmate',
    text: 'The game ends when the king is checkmated.',
    section: 'End of Game',
  },
];

function hit(
  partial: Pick<RuleSearchResult, 'number' | 'title' | 'kind'> & { score: number }
): RuleSearchResult {
  const doc = DOCS.find((d) => d.number === partial.number)!;
  return {
    number: partial.number,
    title: partial.title,
    kind: partial.kind,
    text: doc.text,
    section: doc.section,
    score: partial.score,
  };
}

describe('fuseRankings', () => {
  it('prefers items ranked highly in both lists', () => {
    const tf: RuleSearchResult[] = [
      hit({ number: 'Trample', title: 'Trample', kind: 'glossary', score: 10 }),
      hit({ number: '509.1', title: '509.1', kind: 'rule', score: 8 }),
      hit({ number: 'Castling', title: 'Castling', kind: 'entry', score: 2 }),
    ];
    const vec: RuleSearchResult[] = [
      hit({ number: '509.1', title: '509.1', kind: 'rule', score: 0.9 }),
      hit({ number: 'Trample', title: 'Trample', kind: 'glossary', score: 0.8 }),
      hit({ number: 'Checkmate', title: 'Checkmate', kind: 'entry', score: 0.1 }),
    ];

    const fused = fuseRankings(tf, vec, 3);
    expect(fused.map((r) => r.number)).toContain('509.1');
    expect(fused.map((r) => r.number)).toContain('Trample');
    // Both top-2 in each list should outrank Castling / Checkmate
    expect(fused[0].number === '509.1' || fused[0].number === 'Trample').toBe(true);
  });

  it('includes unique vector-only hits', () => {
    const tf: RuleSearchResult[] = [
      hit({ number: 'Castling', title: 'Castling', kind: 'entry', score: 5 }),
    ];
    const vec: RuleSearchResult[] = [
      hit({ number: 'Checkmate', title: 'Checkmate', kind: 'entry', score: 0.9 }),
    ];
    const fused = fuseRankings(tf, vec, 5);
    expect(fused.map((r) => r.number).sort()).toEqual(['Castling', 'Checkmate']);
  });
});

describe('tfSearch', () => {
  it('finds glossary terms without a vector index', () => {
    const results = tfSearch(DOCS, 'What is trample?');
    expect(results[0]?.title).toBe('Trample');
  });
});
