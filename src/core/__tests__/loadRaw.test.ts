import { describe, expect, it } from 'vitest';
import { clearDomains, registerDomains, loadDomain, searchDomain, getDomainMeta } from '../index';
import { chess } from '../../domains/chess';

describe('loadRaw bundling (chess domain)', () => {
  it('loads via loadRaw without fetching a URL and can search', async () => {
    clearDomains();
    registerDomains(chess);

    const ok = await loadDomain(chess);
    expect(ok).toBe(true);

    const meta = getDomainMeta(chess);
    expect(meta?.source).toMatch(/Chess/i);
    expect(meta?.versionLabel).toBeTruthy();

    const hits = searchDomain(chess, 'How does castling work?');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].title.toLowerCase()).toContain('castling');
  });
});
