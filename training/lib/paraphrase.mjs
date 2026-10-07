/**
 * Optional LLM paraphrase of template questions into player language.
 * Strips rule titles/keywords from the question while keeping intent.
 *
 * Env:
 *   OPENAI_API_KEY or RULES_PARAPHRASE_API_KEY
 *   RULES_PARAPHRASE_BASE_URL (default https://api.openai.com/v1)
 *   RULES_PARAPHRASE_MODEL (default gpt-4o-mini)
 */

const SYSTEM = `You rewrite rules-assistant questions into natural player language.
Rules:
- Keep the same intent and domain meaning.
- Do NOT include the rule number, rule title, or distinctive keywords from the gold rule text.
- One short question only. No quotes, no preamble, no explanation.
- Sound like a player asking at the table.`;

function apiConfig() {
  const apiKey =
    process.env.RULES_PARAPHRASE_API_KEY || process.env.OPENAI_API_KEY || '';
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (process.env.RULES_PARAPHRASE_BASE_URL || 'https://api.openai.com/v1').replace(
      /\/$/,
      ''
    ),
    model: process.env.RULES_PARAPHRASE_MODEL || 'gpt-4o-mini',
  };
}

async function paraphraseOne(question, goldText, cfg) {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.7,
      max_tokens: 80,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content:
            `Original question: ${question}\n\n` +
            `Gold rule text (do not leak titles/keywords into the rewrite):\n${goldText.slice(0, 600)}\n\n` +
            `Rewritten player question:`,
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Paraphrase API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim() ?? '';
  return text.replace(/^["']|["']$/g, '').split('\n')[0].trim();
}

/**
 * @param {Array<{ question: string, domainId?: string, relevant_ids?: string[], positive?: { id: string } }>} rows
 * @param {(row: object) => string} goldTextForRow
 * @param {{ concurrency?: number }} opts
 * @returns {Promise<{ paraphrased: number, skipped: number, enabled: boolean }>}
 */
export async function paraphraseQuestions(rows, goldTextForRow, opts = {}) {
  const cfg = apiConfig();
  if (!cfg) {
    console.warn(
      'Paraphrase skipped: set OPENAI_API_KEY or RULES_PARAPHRASE_API_KEY to enable.'
    );
    return { paraphrased: 0, skipped: rows.length, enabled: false };
  }

  const concurrency = opts.concurrency ?? 4;
  let paraphrased = 0;
  let skipped = 0;
  let i = 0;

  async function worker() {
    while (i < rows.length) {
      const idx = i++;
      const row = rows[idx];
      const goldText = goldTextForRow(row) || '';
      try {
        const next = await paraphraseOne(row.question, goldText || row.question, cfg);
        if (next && next.length > 8 && next !== row.question) {
          row.question = next;
          row.paraphrased = true;
          paraphrased += 1;
        } else {
          skipped += 1;
        }
      } catch (err) {
        skipped += 1;
        if (skipped <= 3) {
          console.warn(`Paraphrase failed for row ${idx}: ${err.message}`);
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { paraphrased, skipped, enabled: true };
}

export function wantsParaphrase(argv = process.argv) {
  return (
    argv.includes('--paraphrase') ||
    process.env.PARAPHRASE === '1' ||
    process.env.PARAPHRASE === 'true'
  );
}
