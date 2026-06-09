/**
 * Freshness manifest loader. The weekly check script probes publisher sites and
 * writes a manifest; the UI reads it to show an "update available" banner.
 */

import type { RulesManifest } from './types';

let manifestPromise: Promise<RulesManifest | null> | null = null;
let cached: RulesManifest | null = null;

/** Load the freshness manifest from a static asset path (cached). */
export async function loadManifest(url = '/data/rules-manifest.json'): Promise<RulesManifest | null> {
  if (cached) return cached;
  if (!manifestPromise) {
    manifestPromise = fetch(url)
      .then((res) => (res.ok ? (res.json() as Promise<RulesManifest>) : null))
      .then((data) => {
        cached = data;
        return data;
      })
      .catch(() => null);
  }
  return manifestPromise;
}

/** True when the weekly check found a newer publisher document for this domain. */
export function isUpdateAvailable(domainId: string): boolean {
  return Boolean(cached?.domains?.[domainId]?.updateAvailable);
}

/** When the manifest was last probed (ISO string), if known. */
export function getLastCheckedAt(): string | null {
  return cached?.lastCheckedAt ?? null;
}
