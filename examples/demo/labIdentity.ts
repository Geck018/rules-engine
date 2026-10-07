/**
 * Lab-only visual identity. Not part of the published package brand —
 * customers supply their own UI (or their own identity if they use RulesChat).
 */

import type { RulesVisualIdentity } from '../../src/react';

export const labIdentity: RulesVisualIdentity = {
  name: 'MC Steyn',
  year: 2026,
  showCredit: true,
  colors: {
    bg: '#12111a',
    surface: '#1a1824',
    surfaceAlt: '#0e0d14',
    border: '#2c2938',
    text: '#eceaf2',
    textMuted: '#9b97a8',
    accent: '#a4b87a',
    accentContrast: '#12111a',
    accentSoft: 'rgba(164, 184, 122, 0.14)',
  },
  typography: {
    fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif",
    fontMono: "'IBM Plex Mono', ui-monospace, monospace",
  },
  shape: {
    radius: '6px',
  },
  chrome: {
    showAvatars: false,
    showDomainIcon: false,
  },
};
