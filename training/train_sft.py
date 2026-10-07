#!/usr/bin/env python3
"""
Supervised fine-tune of a small instruct LM on grounded rules Q&A (qa.jsonl).

Requires:
  pip install transformers datasets accelerate peft bitsandbytes torch

Input:  training/data/qa.jsonl
Output: training/artifacts/rules-qa-instruct/

Default base: Qwen/Qwen2.5-0.5B-Instruct (matches browser fallback family).
Use LoRA for modest GPU VRAM. Export ONNX afterward with export_onnx.py.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
QA = ROOT / "data" / "qa.jsonl"
OUT = ROOT / "artifacts" / "rules-qa-instruct"
BASE = "Qwen/Qwen2.5-0.5B-Instruct"


def load_messages():
    rows = []
    with QA.open() as f:
        for line in f:
            rows.append(json.loads(line)["messages"])
    return rows


def format_chat(messages, tokenizer):
    return tokenizer.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=False
    )


def main():
    try:
        from datasets import Dataset
        from peft import LoraConfig, get_peft_model
        from transformers import (
            AutoModelForCausalLM,
            AutoTokenizer,
            DataCollatorForLanguageModeling,
            Trainer,
            TrainingArguments,
        )
    except ImportError as e:
        raise SystemExit(
            "Install training deps: pip install transformers datasets accelerate peft torch\n"
            + str(e)
        )

    if not QA.exists():
        raise SystemExit("Run npm run train:synth first")

    tokenizer = AutoTokenizer.from_pretrained(BASE, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    texts = [format_chat(m, tokenizer) for m in load_messages()]
    ds = Dataset.from_dict({"text": texts}).train_test_split(test_size=0.05, seed=42)

    def tok(batch):
        return tokenizer(
            batch["text"], truncation=True, max_length=1024, padding="max_length"
        )

    train_ds = ds["train"].map(tok, batched=True, remove_columns=["text"])
    eval_ds = ds["test"].map(tok, batched=True, remove_columns=["text"])

    model = AutoModelForCausalLM.from_pretrained(BASE, trust_remote_code=True)
    model = get_peft_model(
        model,
        LoraConfig(
            r=16,
            lora_alpha=32,
            lora_dropout=0.05,
            bias="none",
            task_type="CAUSAL_LM",
            target_modules=["q_proj", "v_proj"],
        ),
    )

    OUT.mkdir(parents=True, exist_ok=True)
    args = TrainingArguments(
        output_dir=str(OUT),
        per_device_train_batch_size=2,
        per_device_eval_batch_size=2,
        num_train_epochs=1,
        learning_rate=2e-4,
        logging_steps=20,
        eval_strategy="epoch",
        save_strategy="epoch",
        fp16=False,
        report_to=[],
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        data_collator=DataCollatorForLanguageModeling(tokenizer, mlm=False),
    )
    trainer.train()
    trainer.save_model(str(OUT))
    tokenizer.save_pretrained(str(OUT))
    print(f"Saved SFT adapter/model to {OUT}")


if __name__ == "__main__":
    main()
