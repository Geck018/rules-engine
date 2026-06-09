# Rules Engine

A **config-driven rules assistant you plug into any app**. Define a game or
sport as one config object, point it at an official rules dataset, and get a
grounded, citable rules chatbot React component.

- **No hosting required.** It runs entirely inside your app. By default it works
  fully offline: it retrieves and shows the most relevant official rule.
- **Bring your own LLM (optional).** Want conversational answers? Plug in an
  answerer — OpenAI-compatible, your own backend, a Cloudflare Worker, a local
  model, anything. Or don't, and stay offline.
- **Add a game = one config object + one dataset.** No engine/UI/worker changes.

## Install

```bash
npm install rules-engine react
```

React is a peer dependency.

## Use it (offline, zero hosting)

```tsx
import { RulesChat } from 'rules-engine/react';
import { mtg, wh40k } from 'rules-engine/domains';

export function Help() {
  return <RulesChat domains={[mtg, wh40k]} />;
}
```

That's it — no backend, no API key. The component lazy-loads the rules dataset,
finds the best-matching official rules for the question, and shows them with
citations. Styles inject themselves (no CSS import).

> The bundled domains default to fetching their dataset from `/data/*.json`.
> Either copy the JSON into your app's public dir, or bundle it (next section).

## Bundle the dataset (no static files to serve)

```tsx
import { mtg } from 'rules-engine/domains';
import mtgData from 'rules-engine/data/mtg-comprehensive-rules.json';

const mtgBundled = { ...mtg, loadRaw: async () => mtgData };

<RulesChat domains={[mtgBundled]} />
```

`loadRaw` takes precedence over `datasetUrl`, so nothing needs to be hosted.

## Add an LLM (optional)

Pass an `answer` function. Use a bundled adapter or write your own.

**Your own backend** (keeps API keys server-side — recommended for production):

```tsx
import { httpAnswerer } from 'rules-engine/adapters';

<RulesChat domains={[mtg]} answer={httpAnswerer({ url: '/api/rules/chat' })} />
```

Your endpoint receives `{ query, gameSystem, rulesContext }` and returns
`{ response: string }`. The `rules-engine/worker` export and `worker/index.ts`
give you a ready-made Cloudflare Workers AI implementation, but any backend works.

**OpenAI-compatible, directly** (single-user / local tools — exposes the key in
the browser, so don't ship it to end users):

```tsx
import { openAiAnswerer } from 'rules-engine/adapters';

<RulesChat
  domains={[mtg]}
  answer={openAiAnswerer({ apiKey: import.meta.env.VITE_OPENAI_KEY, model: 'gpt-4o-mini' })}
/>
```

**Anything else** — an answerer is just a function:

```ts
import type { RulesAnswerer } from 'rules-engine/core';

const answer: RulesAnswerer = async ({ query, domain, context, citations }) => {
  // call your model with `context` (retrieved official rules) as grounding
  return '...';
};
```

`buildPrompt(domain, query, context, enrichment)` from `rules-engine/core`
produces the same grounded system/user messages every adapter uses.

## Define a new domain (e.g. a sport)

1. **Get the rules text.** `pdftotext -layout rules.pdf scripts/data/pickleball.txt`
2. **Ingest into JSON** with the generic parser:
   ```bash
   node scripts/ingest-generic.mjs \
     --in scripts/data/pickleball.txt \
     --out public/data/pickleball-rules.json \
     --source "Official Pickleball Rulebook" \
     --url "https://usapickleball.org/rules" \
     --version "2026"
   ```
3. **Write the domain config** (`pickleball.ts`):
   ```ts
   import type { RulesDomain, NormalizedRules } from 'rules-engine/core';
   import data from './pickleball-rules.json';

   function normalize(raw: unknown): NormalizedRules {
     const ds = raw as { source: string; sourceUrl: string; version: string;
       entries: { title: string; section: string; text: string }[] };
     return {
       docs: ds.entries.map((e) => ({
         kind: 'entry', number: e.title, title: e.title, text: e.text, section: e.section,
       })),
       meta: { source: ds.source, sourceUrl: ds.sourceUrl, versionLabel: ds.version },
     };
   }

   export const pickleball: RulesDomain = {
     id: 'pickleball',
     label: { short: 'Pickleball', full: 'USA Pickleball', icon: '🏓' },
     loadRaw: async () => data,
     sourceUrl: 'https://usapickleball.org/rules',
     normalize,
     ai: {
       systemPrompt: 'You are a pickleball rules assistant. ...',
       rulesHeading: 'Official Rulebook (excerpts, use these to ground your answer):',
     },
     ui: {
       citationLabel: '📜 Official Rulebook',
       quickQuestions: [{ label: 'The kitchen', query: 'What is the non-volley zone?' }],
     },
   };
   ```
4. Add `pickleball` to your `domains` array. Done.

## What ships in the package

```
dist/
  core/       Engine: types, registry, search, lazy loader, buildPrompt, manifest
  react/      <RulesChat /> (self-injecting styles, pluggable answerer)
  adapters/   httpAnswerer, openAiAnswerer
  worker/     createRulesHandler factory (optional, for Cloudflare Workers AI)
  domains/    Example domains: mtg, wh40k
public/data/  Datasets + freshness manifest (importable via rules-engine/data/*)
```

`src/demo` (a runnable example app) and `worker/index.ts` (a deployable worker)
live in the repo but are **not** part of the published library.

## Repo scripts

```bash
npm run build:lib    # build the distributable library (dist/) with tsup
npm run dev          # run the demo app
npm run worker:dev   # run the example Cloudflare worker (for the demo's AI path)
npm run rules:ingest # generic text -> dataset JSON
npm run rules:check  # probe publishers + update freshness manifest
```

## The one honest caveat

Engine, UI, adapters, and worker are fully reusable. **Ingestion is ~80%
generic** — the generic heading parser handles most structured rulebooks and the
freshness check is config-driven — but messy sources may need a small custom
parser. That's the only per-source glue.
