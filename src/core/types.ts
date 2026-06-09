/**
 * Core types for the rules engine.
 *
 * A `RulesDomain` is the single config object that fully describes a game or
 * sport: where its rules dataset lives, how to turn that dataset into
 * searchable documents, how the AI should answer, and how the UI should label
 * it. Add a new game/sport by writing one `RulesDomain` — no engine changes.
 */

/** A single searchable unit of rules text (a numbered rule, glossary term, or prose entry). */
export interface RuleDoc {
  /** Rule number (e.g. "509.1") or heading/term (e.g. "Engagement Range"). */
  number: string;
  title: string;
  text: string;
  /** Section/category context, when known. */
  section?: string;
  kind: 'rule' | 'glossary' | 'entry';
}

/** Human-readable metadata about a loaded ruleset. */
export interface RulesMeta {
  source: string;
  sourceUrl: string;
  /** Version label, e.g. "effective January 16, 2026" or "10th Edition". */
  versionLabel: string;
}

/** The output of a domain's `normalize` step. */
export interface NormalizedRules {
  docs: RuleDoc[];
  meta: RulesMeta;
}

/** A scored search hit returned to the UI / used to ground the AI. */
export interface RuleSearchResult {
  number: string;
  title: string;
  text: string;
  kind: RuleDoc['kind'];
  section?: string;
  score: number;
}

/** A quick-question chip shown in the chat UI. */
export interface QuickQuestion {
  label: string;
  query: string;
}

/** AI behavior for a domain. Used by any answerer (worker, OpenAI, custom). */
export interface DomainAiConfig {
  /** System prompt that defines the assistant's persona + answer format. */
  systemPrompt: string;
  /** Heading placed above the retrieved rules excerpts in the user prompt. */
  rulesHeading: string;
  /** Model id hint. Answerers may use or ignore it. */
  model?: string;
  /**
   * Optional, domain-specific enrichment run before answering. Returns an extra
   * context block (e.g. MTG Scryfall card data). May run client- or server-side
   * depending on which answerer is used; keep any network calls here.
   */
  enrich?: (query: string) => Promise<string>;
}

/** UI presentation for a domain. */
export interface DomainUiConfig {
  /** Label shown above the citation list, e.g. "📜 Official Comprehensive Rules". */
  citationLabel: string;
  quickQuestions: QuickQuestion[];
  /** Optional extra line appended to the greeting message. */
  greetingNote?: string;
}

/** The single descriptor that defines a game/sport. */
export interface RulesDomain {
  /** Stable id, e.g. "mtg", "wh40k", "pickleball". Used as the API gameSystem. */
  id: string;
  label: { short: string; full: string; icon: string };
  /**
   * Where to get the raw dataset JSON. Provide ONE of:
   *  - `loadRaw`: return the parsed JSON directly (e.g. a bundled import). No
   *    hosting needed — best for plugging into an app.
   *  - `datasetUrl`: a URL/static-asset path the engine will `fetch()`.
   */
  loadRaw?: () => Promise<unknown> | unknown;
  /** Optional static-asset URL for the dataset (used if `loadRaw` is absent). */
  datasetUrl?: string;
  /** Official rules page, for attribution + the freshness probe. */
  sourceUrl: string;
  /** Turn the raw dataset JSON into searchable docs + metadata. */
  normalize: (raw: unknown) => NormalizedRules;
  ai: DomainAiConfig;
  ui: DomainUiConfig;
}

/** Input handed to a pluggable answerer for one question. */
export interface AnswererInput {
  query: string;
  domain: RulesDomain;
  /** Retrieved official-rules excerpts, ready to ground a prompt. */
  context: string;
  /** The same retrieved rules, structured (also shown as citations). */
  citations: RuleSearchResult[];
}

/**
 * A pluggable answer provider. Return the assistant's answer text. Throw or
 * return '' to fall back to the built-in retrieval-only answer. This is the
 * seam that lets a host app bring its own LLM (OpenAI, a worker, local model,
 * …) — or none at all.
 */
export type RulesAnswerer = (input: AnswererInput) => Promise<string>;

/** Freshness-manifest entry produced by the weekly check script. */
export interface RulesManifestEntry {
  sourceUrl: string;
  localVersion: string | null;
  localGeneratedAt?: string;
  remoteVersion: string | null;
  remotePdfUrl?: string | null;
  updateAvailable: boolean;
  lastCheckedAt?: string;
  note?: string;
}

/** Freshness manifest: one entry per domain id, plus a top-level timestamp. */
export interface RulesManifest {
  lastCheckedAt: string;
  domains: Record<string, RulesManifestEntry>;
}
