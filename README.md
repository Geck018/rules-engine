# Rules Engine

**Headless rules RAG you plug into your own product.**  
We ship the model stack and capabilities — retrieval, grounding, and optional
browser generation. **UI and visual identity are yours.**

- **Core:** normalize any rulebook → search → citation context (`./core`)
- **Browser model:** hybrid TF + embeddings + small instruct answerer (`./browser`)
- **Your surface:** call those APIs from whatever UI you already have
- **Optional reference shell:** `./react` `<RulesChat />` for demos only — restyle
  via `identity` or ignore it and build your own

## Install

```bash
npm install github:Geck018/rules-engine @huggingface/transformers
# add react only if you use the optional ./react reference shell
```

`@huggingface/transformers` (**Transformers.js**, © Hugging Face, Apache-2.0) is a
**local npm dependency** — resolved from `node_modules` and bundled by your app.
We do not load it from a CDN. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Model *weights* (ONNX) are separate: downloaded once from a model host into the
browser cache unless you self-host them.

## What you integrate (headless)

```ts
import { loadDomain, searchDomain, buildDomainContext } from '@geck018/rules-engine/core';
import {
  browserModelAnswerer,
  getBrowserRetrieverForDomain,
} from '@geck018/rules-engine/browser';
import type { RulesDomain } from '@geck018/rules-engine/core';

// 1) Your rulebook as a RulesDomain (normalize JSON → RuleDoc[])
const domain: RulesDomain = { /* id, normalize, loadRaw|datasetUrl, ai, ui */ };

await loadDomain(domain);

// 2) Retrieval (TF built-in, or hybrid via browser retriever)
const retriever = await getBrowserRetrieverForDomain(domain);
const citations = await retriever.search(question, 6);
const context = await retriever.buildContext(question);

// 3) Answer — wire into YOUR chat UI
const answer = browserModelAnswerer();
const text = await answer({ query: question, domain, context, citations });
```

Same specialized weights for every rulebook; quality comes from retrieval over
*that* book, not memorized lore for one game.

| Role | Specialized id (preferred) | Fallback |
| --- | --- | --- |
| Embeddings | `geck018/rules-embed-minilm` | `Xenova/all-MiniLM-L6-v2` |
| Generator | `geck018/rules-qa-instruct` | `onnx-community/Qwen2.5-0.5B-Instruct` |

## Optional reference UI

`<RulesChat />` is a convenience shell for labs/demos. Pass `identity` to skin it,
or skip the export and keep full control.

```tsx
import { RulesChat, type RulesVisualIdentity } from '@geck018/rules-engine/react';

const identity: RulesVisualIdentity = {
  name: 'Your Brand',
  year: 2026,
  showCredit: true,
  colors: { accent: '#…', surface: '#…' /* … */ },
};

<RulesChat domains={[domain]} answer={answer} search={search} identity={identity} />
```

## Local lab (dev only)

```bash
npm run lab   # http://localhost:5174 — train/eval + test against trained corpora
```

Lab chrome/skin lives under `examples/demo/` and is **not** the customer product UI.

## Package surface

```
dist/
  core/       Types, registry, TF search, loaders, buildPrompt   ← product
  browser/    Hybrid retrieval + browserModelAnswerer            ← product
  adapters/   httpAnswerer, openAiAnswerer (optional cloud)
  react/      Optional reference <RulesChat /> + identity helper
  worker/     Deprecated Cloudflare helper
  domains/    Example rulebook configs (not required)
public/data/  Example datasets
training/     Dev-only synth / fine-tune / eval (not published)
```

## Scripts

```bash
npm run build:lib
npm test
npm run typecheck
npm run lab          # local train/test UI
npm run train:synth
npm run train:eval
```

## Define a rulebook

Implement `RulesDomain`: `id`, `normalize` → `RuleDoc[]`, plus `loadRaw` or
`datasetUrl`. Ingestion helpers live under `scripts/`; messy sources may need a
small custom parser. No UI work required to add a book.
