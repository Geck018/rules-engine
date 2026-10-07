# Training — domain-agnostic rules RAG models

Weights learn the **task** (retrieve + answer from excerpts), not a specific game.
Per-rulebook state at runtime is only `RuleDoc[]` + an embedding index.

## Local lab UI

```bash
npm run lab
# open http://localhost:5174 → tabs: Test chat | Train & eval
```

The Train tab calls the Vite lab API (`scripts/lab-api-plugin.mjs`) to run
synthesize / eval and optionally kick off the Python fine-tunes.

**Any rulebook:** drop JSON into `training/data/rulebooks/` (or paste via the UI).
Synthesize writes `corpora-manifest.json`; the **Test chat** tab loads that set
(not a hardcoded game list).

## Pipeline (CLI)

```bash
# 1) Build synthetic multi-domain Q&A + contrastive pairs
npm run train:synth

# Optional: paraphrase template questions into player language (needs API key)
OPENAI_API_KEY=… npm run train:synth -- --paraphrase

# 2) (Optional) fine-tune + export ONNX — requires Python + GPU recommended
python training/train_embed.py
python training/train_sft.py
python training/export_onnx.py

# 3) Eval Recall@k / groundedness heuristics on held-out books (TF baseline)
npm run train:eval

# 4) Before/after efficacy: TF vs hybrid (writes compare-metrics.json)
npm run train:compare
```

`train:compare` freezes `eval.jsonl` and reports Recall@1/3/6 + extractive
groundedness for **before (TF)** vs **after (hybrid TF+MiniLM)**. First run may
download the embedding model. Use `SKIP_EMBED=1` for TF-only.

### Synth details

- **Held-out eval by rulebook**, not by row. Default: one real book (`chess` if present) + one toy (`lanterns`). Override with `EVAL_DOMAIN_IDS=nbha,orchard`. Those domains appear only in `eval.jsonl` (excluded from `qa.jsonl` / `pairs.jsonl`).
- **SFT distractors:** each row gets 3–5 other same-book rules (TF-ranked hard distractors), shuffled so gold isn’t always first.
- **Abstention (~12% of train):** context is distractors-only; answer is `The provided rules don't cover this.`
- **Pairs:** negatives are top TF-scoring wrong rules for that question (hard negatives).
- **Paraphrase (optional):** `--paraphrase` + `OPENAI_API_KEY` / `RULES_PARAPHRASE_API_KEY` rewrites questions without leaking rule titles/keywords.

## Outputs

| Path | Purpose |
| --- | --- |
| `training/data/qa.jsonl` | SFT rows: system/user/assistant grounded in excerpts |
| `training/data/pairs.jsonl` | Contrastive (query, positive, hard negatives) for embedder |
| `training/data/eval.jsonl` | Held-out **rulebooks** (not a random row slice) |
| `training/data/toy_rulebooks.json` | Synthetic rulebooks mixed into training |

## Publish targets (runtime defaults)

After export, push ONNX repos (or GitHub Releases) so the browser loader can fetch them:

- Embeddings → `geck018/rules-embed-minilm` (fallback: `Xenova/all-MiniLM-L6-v2`)
- Generator → `geck018/rules-qa-instruct` (fallback: `onnx-community/Qwen2.5-0.5B-Instruct`)

Override at runtime via `browserModelAnswerer({ embeddingModelId, generatorModelId })`.

## Design rules

1. Never train only on MTG/chess — mix toy books + every available domain.
2. Answers must be supportable from the provided excerpts (no invented facts).
3. Keep core/npm free of training deps; this folder is dev-only.
