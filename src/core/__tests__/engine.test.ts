import { describe, expect, it } from 'vitest';
import { buildIndex, searchIndex, buildContext, tokenize } from '../engine';
import type { RuleDoc } from '../types';

const SAMPLE: RuleDoc[] = [
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
];

describe('tokenize', () => {
  it('drops stop words and short tokens', () => {
    expect(tokenize('What is the rule for trample?')).toEqual(['trample']);
  });
});

describe('searchIndex', () => {
  const index = buildIndex(SAMPLE);

  it('ranks glossary hits for "what is X" style queries', () => {
    const results = searchIndex(index, 'What is trample?');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe('Trample');
    expect(results[0].kind).toBe('glossary');
  });

  it('boosts exact rule-number lookups', () => {
    const results = searchIndex(index, 'see rule 509.1', 3, /\b\d{3}(?:\.\d+[a-z]?)?\b/);
    expect(results[0].number).toBe('509.1');
    expect(results[0].score).toBeGreaterThanOrEqual(100);
  });

  it('returns empty for stop-word-only queries', () => {
    expect(searchIndex(index, 'what is the')).toEqual([]);
  });

  it('finds section-style entry titles', () => {
    const results = searchIndex(index, 'How does castling work?');
    expect(results.some((r) => r.title === 'Castling')).toBe(true);
  });
});

describe('buildContext', () => {
  it('returns empty string when there are no matches', () => {
    expect(buildContext([])).toBe('');
  });

  it('formats rule / glossary / entry labels and respects the char budget', () => {
    const matches = [
      { number: '509.1', title: '509.1', text: 'Blockers are declared.', kind: 'rule' as const, score: 10 },
      { number: 'Trample', title: 'Trample', text: 'Excess damage.', kind: 'glossary' as const, score: 8 },
      {
        number: 'Castling',
        title: 'Castling',
        text: 'King moves two squares.',
        kind: 'entry' as const,
        section: 'Special Moves',
        score: 7,
      },
    ];
    const ctx = buildContext(matches);
    expect(ctx).toContain('Rule 509.1:');
    expect(ctx).toContain('Glossary — Trample:');
    expect(ctx).toContain('Special Moves — Castling:');

    const tiny = buildContext(matches, 40);
    expect(tiny.split('\n').length).toBe(1);
  });
});
