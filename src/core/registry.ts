/**
 * Domain registry. Apps register the games/sports they support; the engine,
 * UI and worker all resolve domains by id from here.
 */

import type { RulesDomain } from './types';

const registry = new Map<string, RulesDomain>();

/** Register one or more domains. Later registrations override earlier ones by id. */
export function registerDomains(...domains: RulesDomain[]): void {
  for (const domain of domains) {
    registry.set(domain.id, domain);
  }
}

/** Look up a registered domain by id. */
export function getDomain(id: string): RulesDomain | undefined {
  return registry.get(id);
}

/** All registered domains, in registration order. */
export function listDomains(): RulesDomain[] {
  return [...registry.values()];
}

/** Remove all registered domains (useful for tests / re-init). */
export function clearDomains(): void {
  registry.clear();
}
