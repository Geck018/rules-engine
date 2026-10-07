# rules-engine — status & remaining steps

Last updated: 2026-10-07

## Done

- [x] GitHub repo live; `main` in sync with `origin/main`
- [x] MIT `LICENSE`
- [x] GitHub install path (`npm install github:Geck018/rules-engine`)
- [x] Plug-in module shape (core / react / adapters / browser / worker / domains)
- [x] Offline TF default + pluggable `answer` (browser / http / OpenAI / custom)
- [x] Browser specialized RAG (`./browser`): hybrid TF+embeddings + instruct generator
- [x] Training pipeline (`training/`) for domain-agnostic Q&A specialization
- [x] CI workflow (`.github/workflows/ci.yml`) — typecheck, test, build:lib
- [x] Unit tests for search / hybrid fusion / loadRaw / groundedness helpers
- [x] Third example domain: **chess** (bundled via `loadRaw`)
- [x] Demo + optional worker under `examples/`
- [x] Package scoped to `@geck018/rules-engine` with `publishConfig.access: public`
- [x] README updated for scoped imports + browser path

## Still needs you (credentials / manual)

### Publish specialized ONNX weights
After `npm run train:synth` and the Python train/export scripts:
```bash
# push training/artifacts/onnx/* to Hugging Face (or GitHub Releases)
# expected ids (already the runtime defaults):
#   geck018/rules-embed-minilm
#   geck018/rules-qa-instruct
```
Until those repos exist, the browser runtime automatically falls back to
`Xenova/all-MiniLM-L6-v2` and `onnx-community/Qwen2.5-0.5B-Instruct`.

### Publish to npm
```bash
npm login
npm run build:lib
npm pack --dry-run
npm publish          # already scoped + public
git tag v0.1.0 && git push --tags
```

### Optional — Cloudflare Workers AI (deprecated path)
Prefer `@geck018/rules-engine/browser`. Only deploy the worker if you still want a remote LLM:
```bash
npx wrangler login
npm run worker:deploy
# then point httpAnswerer({ url: 'https://…workers.dev/api/rules/chat' })
```

### WH40K dataset refresh (blocked by GW download)
Current Core Rules JSON is ~pages 1–30. When you have a fuller PDF:
```bash
pdftotext -layout core.pdf scripts/data/wh40k-core-source.txt
# then re-run your WH parser / ingest and commit public/data/wh40k-core-rules.json
```

## Local verify

```bash
npm install
npm run typecheck
npm test
npm run train:eval
npm run build:lib
npm run lab          # http://localhost:5174 — Test chat + Train & eval UI
```

## Consumer cheat sheet (headless — preferred)

```bash
npm install github:Geck018/rules-engine @huggingface/transformers
```

```ts
import { loadDomain } from '@geck018/rules-engine/core';
import { browserModelAnswerer, getBrowserRetrieverForDomain } from '@geck018/rules-engine/browser';

await loadDomain(domain);
const retriever = await getBrowserRetrieverForDomain(domain);
const citations = await retriever.search(q, 6);
const context = await retriever.buildContext(q);
const text = await browserModelAnswerer()({ query: q, domain, context, citations });
// render `text` + `citations` in YOUR UI
```

`./react` `<RulesChat identity={…} />` is an optional reference shell only.
