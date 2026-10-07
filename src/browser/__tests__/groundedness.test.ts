import { describe, expect, it } from 'vitest';
import { fuseRankings } from '../hybridSearch';
import { formatChatPrompt } from '../generator';
import type { RuleSearchResult } from '../../core/types';

/** Simple citation-overlap groundedness score used in training eval heuristics. */
function groundedness(answer: string, citations: RuleSearchResult[]): number {
  const text = answer.toLowerCase();
  if (!text || citations.length === 0) return 0;
  let hits = 0;
  for (const c of citations) {
    if (text.includes(c.number.toLowerCase()) || text.includes(c.title.toLowerCase())) {
      hits += 1;
    } else if (text.includes(c.text.toLowerCase().slice(0, 24))) {
      hits += 1;
    }
  }
  return hits / citations.length;
}

describe('groundedness heuristic', () => {
  it('scores high when the answer cites retrieved rules', () => {
    const citations: RuleSearchResult[] = [
      {
        kind: 'glossary',
        number: 'Trample',
        title: 'Trample',
        text: 'A keyword ability that lets a creature deal excess combat damage.',
        score: 1,
      },
    ];
    const answer =
      'A keyword ability that lets a creature deal excess combat damage.\n\nRefer to: Trample';
    expect(groundedness(answer, citations)).toBeGreaterThan(0.9);
  });

  it('scores low when the answer ignores citations', () => {
    const citations: RuleSearchResult[] = [
      {
        kind: 'entry',
        number: 'Castling',
        title: 'Castling',
        text: 'A special king-and-rook move.',
        score: 1,
      },
    ];
    expect(groundedness('The weather is nice today.', citations)).toBe(0);
  });
});

describe('formatChatPrompt', () => {
  it('wraps system and user in ChatML', () => {
    const prompt = formatChatPrompt('Be brief.', 'What is castling?');
    expect(prompt).toContain('<|im_start|>system');
    expect(prompt).toContain('Be brief.');
    expect(prompt).toContain('What is castling?');
    expect(prompt.endsWith('<|im_start|>assistant\n')).toBe(true);
  });
});

describe('fuseRankings stability', () => {
  it('returns at most limit results', () => {
    const mk = (n: string, score: number): RuleSearchResult => ({
      kind: 'entry',
      number: n,
      title: n,
      text: n,
      score,
    });
    const fused = fuseRankings(
      [mk('a', 3), mk('b', 2), mk('c', 1)],
      [mk('d', 0.9), mk('a', 0.8)],
      2
    );
    expect(fused).toHaveLength(2);
  });
});
