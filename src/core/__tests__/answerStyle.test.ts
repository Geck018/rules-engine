import { describe, expect, it } from 'vitest';
import { citeLabel, formatQuickAnswer } from '../answerStyle';
import type { RuleSearchResult } from '../types';

const hit = (partial: Partial<RuleSearchResult> & Pick<RuleSearchResult, 'kind' | 'number' | 'title' | 'text'>): RuleSearchResult => ({
  score: 1,
  ...partial,
});

describe('citeLabel', () => {
  it('formats numbered rules', () => {
    expect(
      citeLabel(hit({ kind: 'rule', number: '1.1', title: '1.1', text: 'x' }))
    ).toBe('Rule 1.1');
    expect(
      citeLabel(hit({ kind: 'rule', number: '1.1', title: 'Ground rules', text: 'x' }))
    ).toBe('Rule 1.1 — Ground rules');
  });
});

describe('formatQuickAnswer', () => {
  it('returns natural summary plus Refer to line', () => {
    const out = formatQuickAnswer([
      hit({
        kind: 'rule',
        number: '1.1',
        title: 'Ground rules',
        text: 'Competitors must follow the ground rules at all times. Further clauses apply.',
      }),
    ]);
    expect(out).toContain('Competitors must follow the ground rules at all times.');
    expect(out).toContain('Refer to: Rule 1.1 — Ground rules');
    expect(out).not.toContain('In this situation');
  });
});
