/**
 * Optional theming for the reference <RulesChat /> shell only.
 *
 * The product surface is headless: `@geck018/rules-engine/core` + `/browser`
 * (retrieval, answerer, models). Customers own UI. Use this identity API only
 * if you adopt the reference React shell and need to restyle it quickly.
 */

import type { CSSProperties } from 'react';

/** Color tokens. All optional — missing keys fall back to {@link DEFAULT_IDENTITY}. */
export interface RulesIdentityColors {
  /** Page-adjacent deep background (rarely visible inside the widget). */
  bg?: string;
  /** Main panel surface. */
  surface?: string;
  /** Recessed surfaces (messages, inputs). */
  surfaceAlt?: string;
  border?: string;
  text?: string;
  textMuted?: string;
  /** Primary action / emphasis. */
  accent?: string;
  /** Text/icons on solid accent fills. */
  accentContrast?: string;
  /** Soft accent wash (badges, selected chips). */
  accentSoft?: string;
}

export interface RulesIdentityTypography {
  fontFamily?: string;
  fontMono?: string;
}

export interface RulesIdentityShape {
  /** CSS length, e.g. "6px" or "0.5rem". */
  radius?: string;
}

export interface RulesIdentityChrome {
  /** Show message avatars (default true in neutral identity). */
  showAvatars?: boolean;
  /** Show domain label.icon in the switcher (default true). */
  showDomainIcon?: boolean;
}

/**
 * Host-provided visual identity. Pass to `<RulesChat identity={…} />`.
 * The lab demo ships one identity; production apps should supply their own.
 */
export interface RulesVisualIdentity {
  /** Brand / author name for optional attribution. */
  name?: string;
  /** Year (or range) paired with name when credit is shown. */
  year?: string | number;
  /** When true and `name` is set, show a quiet credit mark in the widget. */
  showCredit?: boolean;
  colors?: RulesIdentityColors;
  typography?: RulesIdentityTypography;
  shape?: RulesIdentityShape;
  chrome?: RulesIdentityChrome;
}

/** Neutral default — usable anywhere; not a product brand. */
export const DEFAULT_IDENTITY: Required<
  Pick<RulesVisualIdentity, 'colors' | 'typography' | 'shape' | 'chrome'>
> &
  RulesVisualIdentity = {
  showCredit: false,
  colors: {
    bg: '#12141a',
    surface: '#1a1d26',
    surfaceAlt: '#12151c',
    border: '#2c3140',
    text: '#e8eaef',
    textMuted: '#9aa0b0',
    accent: '#6b8cae',
    accentContrast: '#0e1116',
    accentSoft: 'rgba(107, 140, 174, 0.18)',
  },
  typography: {
    fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
    fontMono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  shape: {
    radius: '8px',
  },
  chrome: {
    showAvatars: true,
    showDomainIcon: true,
  },
};

function mergeIdentity(identity?: RulesVisualIdentity): {
  name?: string;
  year?: string | number;
  showCredit: boolean;
  colors: Required<RulesIdentityColors>;
  typography: Required<RulesIdentityTypography>;
  shape: Required<RulesIdentityShape>;
  chrome: Required<RulesIdentityChrome>;
} {
  return {
    name: identity?.name,
    year: identity?.year,
    showCredit: identity?.showCredit ?? DEFAULT_IDENTITY.showCredit ?? false,
    colors: {
      ...DEFAULT_IDENTITY.colors,
      ...identity?.colors,
    } as Required<RulesIdentityColors>,
    typography: {
      ...DEFAULT_IDENTITY.typography,
      ...identity?.typography,
    } as Required<RulesIdentityTypography>,
    shape: {
      ...DEFAULT_IDENTITY.shape,
      ...identity?.shape,
    } as Required<RulesIdentityShape>,
    chrome: {
      ...DEFAULT_IDENTITY.chrome,
      ...identity?.chrome,
    } as Required<RulesIdentityChrome>,
  };
}

/** Resolve identity → CSS custom properties for the `.rules-chat` root. */
export function identityToCssVars(identity?: RulesVisualIdentity): CSSProperties {
  const i = mergeIdentity(identity);
  return {
    ['--re-bg-primary' as string]: i.colors.bg,
    ['--re-bg-secondary' as string]: i.colors.surface,
    ['--re-bg-tertiary' as string]: i.colors.surfaceAlt,
    ['--re-border' as string]: i.colors.border,
    ['--re-text-primary' as string]: i.colors.text,
    ['--re-text-secondary' as string]: i.colors.textMuted,
    ['--re-accent' as string]: i.colors.accent,
    ['--re-accent-contrast' as string]: i.colors.accentContrast,
    ['--re-accent-soft' as string]: i.colors.accentSoft,
    ['--re-radius' as string]: i.shape.radius,
    ['--re-font' as string]: i.typography.fontFamily,
    ['--re-font-mono' as string]: i.typography.fontMono,
  } as CSSProperties;
}

/** Data attributes controlling optional chrome. */
export function identityChromeAttrs(identity?: RulesVisualIdentity): {
  'data-avatars': 'on' | 'off';
  'data-domain-icon': 'on' | 'off';
} {
  const i = mergeIdentity(identity);
  return {
    'data-avatars': i.chrome.showAvatars ? 'on' : 'off',
    'data-domain-icon': i.chrome.showDomainIcon ? 'on' : 'off',
  };
}

/** Quiet credit line from identity, or null when disabled / unnamed. */
export function identityCredit(identity?: RulesVisualIdentity): string | null {
  const i = mergeIdentity(identity);
  if (!i.showCredit || !i.name) return null;
  return i.year != null && i.year !== '' ? `${i.name} · ${i.year}` : i.name;
}

export function resolveIdentity(identity?: RulesVisualIdentity) {
  return mergeIdentity(identity);
}
