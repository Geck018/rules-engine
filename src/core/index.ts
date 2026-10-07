/** Public entry point for the domain-agnostic rules engine core. */

export * from './types';
export { tokenize, buildIndex, searchIndex, buildContext, type IndexedDoc } from './engine';
export { buildPrompt, type PromptParts } from './prompt';
export {
  ANSWER_STYLE_INSTRUCTIONS,
  citeLabel,
  formatQuickAnswer,
} from './answerStyle';
export { registerDomains, getDomain, listDomains, clearDomains } from './registry';
export {
  loadDomain,
  getDomainMeta,
  getDomainDocs,
  searchDomain,
  buildDomainContext,
} from './loader';
export { loadManifest, isUpdateAvailable, getLastCheckedAt } from './manifest';
