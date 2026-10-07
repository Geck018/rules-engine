#!/usr/bin/env python3
"""
Contrastive fine-tune of a MiniLM sentence encoder on multi-rulebook pairs.

Requires:
  pip install sentence-transformers torch

Input:  training/data/pairs.jsonl  (from npm run train:synth)
Output: training/artifacts/rules-embed-minilm/

Then run export_onnx.py and push to Hugging Face as geck018/rules-embed-minilm
(compatible with Transformers.js / ONNX).
"""

from __future__ import annotations

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PAIRS = ROOT / "data" / "pairs.jsonl"
OUT = ROOT / "artifacts" / "rules-embed-minilm"


def load_pairs():
    rows = []
    with PAIRS.open() as f:
        for line in f:
            rows.append(json.loads(line))
    return rows


def main():
    try:
        from sentence_transformers import InputExample, SentenceTransformer, losses
        from torch.utils.data import DataLoader
    except ImportError as e:
        raise SystemExit(
            "Install training deps: pip install sentence-transformers torch\n" + str(e)
        )

    if not PAIRS.exists():
        raise SystemExit("Run npm run train:synth first")

    pairs = load_pairs()
    random.seed(42)
    random.shuffle(pairs)

    examples = []
    for p in pairs:
        examples.append(
            InputExample(texts=[p["question"], p["positive"]["text"]], label=1.0)
        )
        for neg in p.get("negatives", [])[:2]:
            examples.append(
                InputExample(texts=[p["question"], neg["text"]], label=0.0)
            )

    model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    loader = DataLoader(examples, shuffle=True, batch_size=16)
    loss = losses.CosineSimilarityLoss(model)

    OUT.mkdir(parents=True, exist_ok=True)
    model.fit(
        train_objectives=[(loader, loss)],
        epochs=1,
        warmup_steps=min(100, len(loader)),
        output_path=str(OUT),
        show_progress_bar=True,
    )
    print(f"Saved embedder to {OUT}")


if __name__ == "__main__":
    main()
