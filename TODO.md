# rules-engine — status & remaining steps

Last updated: 2026-07-14

## Done

- [x] GitHub repo live; `main` in sync with `origin/main`
- [x] MIT `LICENSE`
- [x] GitHub install path (`npm install github:Geck018/rules-engine`)
- [x] Plug-in module shape (core / react / adapters / worker / domains)
- [x] Offline default + pluggable `answer` (http / OpenAI / custom)
- [x] CI workflow (`.github/workflows/ci.yml`) — typecheck, test, build:lib
- [x] Unit tests for `searchIndex` / `buildContext` / `loadRaw`
- [x] Third example domain: **chess** (bundled via `loadRaw`)
- [x] Demo + deployable worker moved under `examples/`
- [x] Package scoped to `@geck018/rules-engine` with `publishConfig.access: public`
- [x] README updated for scoped imports + examples layout

## Still needs you (credentials / manual)

### Publish to npm
```bash
npm login
npm run build:lib
npm pack --dry-run
npm publish          # already scoped + public
git tag v0.1.0 && git push --tags
```

### Deploy example Workers AI endpoint (optional)
Offline mode needs no backend. Only do this if you want a hosted LLM for demos.
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
npm run build:lib
npm run dev          # http://localhost:5174
```

## Consumer cheat sheet

```bash
npm install github:Geck018/rules-engine react
# or, after publish:
npm install @geck018/rules-engine react
```

```tsx
import { RulesChat } from '@geck018/rules-engine/react';
import { mtg, wh40k, chess } from '@geck018/rules-engine/domains';

<RulesChat domains={[mtg, wh40k, chess]} />
```
