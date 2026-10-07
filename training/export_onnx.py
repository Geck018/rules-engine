#!/usr/bin/env python3
"""
Export fine-tuned artifacts to ONNX for Transformers.js / onnxruntime.

Embeddings: use optimum or sentence-transformers ONNX export.
Generator: prefer Hugging Face optimum `ORTModelForCausalLM` then quantize.

Example (after train_* scripts):

  python training/export_onnx.py --embed
  python training/export_onnx.py --gen

Publish the resulting folders to:
  geck018/rules-embed-minilm
  geck018/rules-qa-instruct

Until specialized repos exist, the browser runtime falls back to:
  Xenova/all-MiniLM-L6-v2
  onnx-community/Qwen2.5-0.5B-Instruct
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EMBED_SRC = ROOT / "artifacts" / "rules-embed-minilm"
GEN_SRC = ROOT / "artifacts" / "rules-qa-instruct"
EMBED_OUT = ROOT / "artifacts" / "onnx" / "rules-embed-minilm"
GEN_OUT = ROOT / "artifacts" / "onnx" / "rules-qa-instruct"


def export_embed():
    if not EMBED_SRC.exists():
        raise SystemExit(f"Missing {EMBED_SRC} — run train_embed.py first")
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as e:
        raise SystemExit("pip install sentence-transformers\n" + str(e))

    model = SentenceTransformer(str(EMBED_SRC))
    EMBED_OUT.mkdir(parents=True, exist_ok=True)
    # Prefer native export when available; otherwise copy HF weights for optimum.
    try:
        model.save(str(EMBED_OUT))
        print(
            f"Saved embedding model to {EMBED_OUT}. "
            "Convert with: optimum-cli export onnx --model "
            f"{EMBED_OUT} {EMBED_OUT / 'onnx'} --task feature-extraction"
        )
    except Exception:
        shutil.copytree(EMBED_SRC, EMBED_OUT, dirs_exist_ok=True)
        print(f"Copied embedder weights to {EMBED_OUT} for manual ONNX conversion")


def export_gen():
    if not GEN_SRC.exists():
        raise SystemExit(f"Missing {GEN_SRC} — run train_sft.py first")
    GEN_OUT.mkdir(parents=True, exist_ok=True)
    shutil.copytree(GEN_SRC, GEN_OUT, dirs_exist_ok=True)
    print(
        f"Copied generator to {GEN_OUT}. Convert with optimum-cli, e.g.:\n"
        f"  optimum-cli export onnx --model {GEN_OUT} {GEN_OUT / 'onnx'} "
        "--task text-generation-with-past\n"
        "Then quantize (q4/q8) for browser and push to geck018/rules-qa-instruct."
    )


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--embed", action="store_true")
    p.add_argument("--gen", action="store_true")
    args = p.parse_args()
    if not args.embed and not args.gen:
        p.print_help()
        raise SystemExit(1)
    if args.embed:
        export_embed()
    if args.gen:
        export_gen()


if __name__ == "__main__":
    main()
