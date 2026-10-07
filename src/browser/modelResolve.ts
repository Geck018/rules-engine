/**
 * Model id resolution + sticky browser preference.
 *
 * Transformers.js persists weights in the browser cache (Cache API / IndexedDB)
 * after the first successful download. We additionally remember which HF id
 * actually worked so we don't re-probe missing specialized repos (401) every
 * page load.
 */

import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_GENERATOR_MODEL,
  SPECIALIZED_EMBEDDING_MODEL,
  SPECIALIZED_GENERATOR_MODEL,
} from './types';

const STORAGE_PREFIX = 'rules-engine:model:';

type Role = 'embedding' | 'generator';

function storageKey(role: Role): string {
  return `${STORAGE_PREFIX}${role}`;
}

function readSticky(role: Role): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(storageKey(role));
  } catch {
    return null;
  }
}

/** Remember a model id that loaded successfully (survives reloads). */
export function rememberModelId(role: Role, modelId: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(storageKey(role), modelId);
  } catch {
    /* private mode / blocked storage */
  }
}

/** Forget sticky id (tests / force re-resolve). */
export function forgetModelId(role: Role): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(storageKey(role));
  } catch {
    /* ignore */
  }
}

/**
 * Cheap public check: can we read config.json for this HF model?
 * Avoids starting a full pipeline download against a 401 private/missing repo.
 */
export async function isModelReachable(modelId: string, timeoutMs = 4000): Promise<boolean> {
  if (!modelId.includes('/')) return true; // local / relative paths
  const url = `https://huggingface.co/${modelId}/resolve/main/config.json`;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl?.signal,
      // cache probe responses briefly
      cache: 'force-cache',
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface ResolveModelOptions {
  /** Explicit override wins. */
  modelId?: string;
  /** Public fallback (always tried if preferred fails). */
  fallbackModelId?: string;
  /**
   * When true, try the specialized HF id first (if reachable).
   * Default false until specialized weights are published publicly.
   */
  preferSpecialized?: boolean;
}

/**
 * Pick embedding / generator model ids without hitting dead specialized repos.
 * Order: explicit → sticky → (optional) specialized if reachable → public default.
 */
export async function resolveModelIds(
  role: Role,
  options: ResolveModelOptions = {}
): Promise<{ primary: string; fallback: string }> {
  const publicDefault =
    role === 'embedding' ? DEFAULT_EMBEDDING_MODEL : DEFAULT_GENERATOR_MODEL;
  const specialized =
    role === 'embedding' ? SPECIALIZED_EMBEDDING_MODEL : SPECIALIZED_GENERATOR_MODEL;
  const fallback = options.fallbackModelId ?? publicDefault;

  if (options.modelId) {
    return { primary: options.modelId, fallback };
  }

  const sticky = readSticky(role);
  if (sticky) {
    return { primary: sticky, fallback: sticky === fallback ? fallback : fallback };
  }

  if (options.preferSpecialized) {
    const ok = await isModelReachable(specialized);
    if (ok) return { primary: specialized, fallback };
  }

  return { primary: fallback, fallback };
}
