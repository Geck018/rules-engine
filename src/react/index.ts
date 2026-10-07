/**
 * Optional reference React shell. The shipped product is headless:
 * `@geck018/rules-engine/core` + `/browser`. Use RulesChat only for demos or
 * as a starting point — customers own production UI and brand.
 */

export { RulesChat } from './RulesChat';
export type { RulesChatProps, ChatMessage, RulesChatSearch } from './RulesChat';
export {
  DEFAULT_IDENTITY,
  identityToCssVars,
  identityChromeAttrs,
  identityCredit,
  resolveIdentity,
  type RulesVisualIdentity,
  type RulesIdentityColors,
  type RulesIdentityTypography,
  type RulesIdentityShape,
  type RulesIdentityChrome,
} from './identity';
