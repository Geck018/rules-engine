/**
 * Template-based Q&A synthesis grounded only in provided RuleDoc text.
 * Voice: short natural answer + "Refer to: …" (matches production answer style).
 */

import { docId, tfSearch } from './retrieval_scorer.mjs';

export const ABSTAIN_ANSWER = "The provided rules don't cover this.";

export const ABSTAIN_RATE = 0.12; // mid of 10–15%

function citeLabel(doc) {
  if (doc.kind === 'glossary') return doc.title;
  if (doc.kind === 'rule') {
    return doc.title && doc.title !== doc.number
      ? `Rule ${doc.number} — ${doc.title}`
      : `Rule ${doc.number}`;
  }
  return doc.section ? `${doc.section} — ${doc.title}` : doc.title;
}

function firstSentence(text) {
  const m = text.match(/^[^.!?]+[.!?]?/);
  return (m ? m[0] : text).trim();
}

function quickAnswer(doc) {
  const label = citeLabel(doc);
  return `${firstSentence(doc.text)}\n\nRefer to: ${label}`;
}

function shuffleInPlace(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Top TF-ranked wrong rules for a question, with random fill if needed.
 * @returns {string[]} doc ids
 */
export function pickDistractors(docs, question, relevantIds, count, rand = Math.random) {
  if (count <= 0 || !docs.length) return [];
  const relevant = new Set(relevantIds);
  const hits = tfSearch(docs, question, count + relevant.size + 8);
  const out = [];
  const seen = new Set();
  for (const h of hits) {
    if (relevant.has(h.id) || seen.has(h.id)) continue;
    seen.add(h.id);
    out.push(h.id);
    if (out.length >= count) return out;
  }
  const pool = docs
    .map((d) => docId(d))
    .filter((id) => !relevant.has(id) && !seen.has(id));
  while (out.length < count && pool.length) {
    const idx = Math.floor(rand() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/**
 * Context excerpt ids for an SFT row: relevant (+ distractors), or distractors-only when abstaining.
 * Always shuffled so the gold rule is not first.
 */
export function buildContextIds(
  docs,
  question,
  relevantIds,
  { distractorCount = 4, rand = Math.random, abstain = false } = {}
) {
  const distractors = pickDistractors(docs, question, relevantIds, distractorCount, rand);
  const ids = abstain ? [...distractors] : [...relevantIds, ...distractors];
  return shuffleInPlace(ids, rand);
}

/** Build grounded Q&A examples from a single doc. */
export function examplesFromDoc(doc, domainId) {
  const label = citeLabel(doc);
  const out = [];

  out.push({
    domainId,
    question: `What does ${doc.title} say?`,
    relevant_ids: [`${doc.kind}:${doc.number}`],
    answer: quickAnswer(doc),
  });

  if (doc.kind === 'glossary') {
    out.push({
      domainId,
      question: `What is ${doc.title}?`,
      relevant_ids: [`${doc.kind}:${doc.number}`],
      answer: `${doc.text}\n\nRefer to: ${label}`,
    });
  }

  if (doc.kind === 'rule') {
    out.push({
      domainId,
      question: `Explain rule ${doc.number}`,
      relevant_ids: [`${doc.kind}:${doc.number}`],
      answer: quickAnswer(doc),
    });
  }

  // Interaction templates deferred: only revive when two related rules are both
  // in context and the answer draws on both.

  return out;
}

/** Build contrastive training pairs with TF hard negatives. */
export function pairsFromDocs(docs, domainId, negativesPer = 3, rand = Math.random) {
  const pairs = [];
  for (const pos of docs) {
    const posId = docId(pos);
    const question = `What is the rule about ${pos.title}?`;
    const hits = tfSearch(docs, question, negativesPer + 8);
    const negatives = [];
    const seen = new Set([posId]);
    for (const h of hits) {
      if (seen.has(h.id)) continue;
      seen.add(h.id);
      negatives.push({
        id: h.id,
        text: `${h.doc.title}\n${h.doc.text}`,
      });
      if (negatives.length >= negativesPer) break;
    }
    if (negatives.length < negativesPer) {
      const pool = docs.filter((d) => !seen.has(docId(d)));
      while (negatives.length < negativesPer && pool.length) {
        const idx = Math.floor(rand() * pool.length);
        const neg = pool.splice(idx, 1)[0];
        const id = docId(neg);
        seen.add(id);
        negatives.push({ id, text: `${neg.title}\n${neg.text}` });
      }
    }
    pairs.push({
      domainId,
      question,
      positive: {
        id: posId,
        text: `${pos.title}\n${pos.text}`,
      },
      negatives,
    });
  }
  return pairs;
}

/**
 * Enrich a template example with shuffled context (distractors / abstention).
 * Abstention rows keep the original question but only distractor excerpts.
 */
export function enrichExample(example, docs, rand, { abstain = false } = {}) {
  const distractorCount = 3 + Math.floor(rand() * 3); // 3–5
  const canAbstain = abstain && docs.length >= 2;
  const context_ids = buildContextIds(docs, example.question, example.relevant_ids, {
    distractorCount,
    rand,
    abstain: canAbstain,
  });
  if (canAbstain) {
    return {
      ...example,
      context_ids,
      answer: ABSTAIN_ANSWER,
      abstain: true,
    };
  }
  return {
    ...example,
    context_ids,
    abstain: false,
  };
}

export function formatSftRow(example, docsById, systemPrompt) {
  const ids = example.context_ids ?? example.relevant_ids;
  const excerpts = ids
    .map((id) => docsById.get(id))
    .filter(Boolean)
    .map((d) => `${citeLabel(d)}: ${d.text}`)
    .join('\n');

  const abstainHint = example.abstain
    ? `\nIf none of the excerpts answer the question, reply exactly: ${ABSTAIN_ANSWER}`
    : `\nIf the excerpts do not address the question, say that the provided rules don't cover this.`;

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content:
          `Rulebook: ${example.domainId}\nQuestion: ${example.question}\n\n` +
          `Official rules (excerpts, use these to ground your answer):\n${excerpts || 'None'}\n\n` +
          `Remember: short natural answer, then "Refer to: [rule ref]".` +
          abstainHint,
      },
      { role: 'assistant', content: example.answer },
    ],
    meta: {
      domainId: example.domainId,
      relevant_ids: example.relevant_ids,
      context_ids: ids,
      abstain: Boolean(example.abstain),
    },
  };
}

export const GENERIC_SYSTEM_PROMPT =
  'You are a portable rules referee. Answer only from the provided official ' +
  'rules excerpts. Give a short natural answer, then a "Refer to:" line with ' +
  'the rule number/title. Do not invent rules. Do not paste long quotes. ' +
  'If the excerpts do not address the question, say that the provided rules don\'t cover this.';
