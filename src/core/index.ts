/** Public entry point for the domain-agnostic rules engine core. */

export * from './types';
export { tokenize, buildIndex, searchIndex, buildContext, type IndexedDoc } from './engine';
export { buildPrompt, type PromptParts } from './prompt';
export { registerDomains, getDomain, listDomains, clearDomains } from './registry';
export {
  loadDomain,
  getDomainMeta,
  searchDomain,
  buildDomainContext,
} from './loader';
export { loadManifest, isUpdateAvailable, getLastCheckedAt } from './manifest';
