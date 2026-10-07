/**
 * Template-based Q&A synthesis grounded only in provided RuleDoc text.
 * Voice: short natural answer + "Refer to: …" (matches production answer style).
 */

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

  const keywords = doc.text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 5)
    .slice(0, 3);
  if (keywords.length >= 2) {
    out.push({
      domainId,
      question: `How do ${keywords[0]} and ${keywords[1]} interact under the rules?`,
      relevant_ids: [`${doc.kind}:${doc.number}`],
      answer: quickAnswer(doc),
    });
  }

  return out;
}

/** Build contrastive training pairs for embedding adaptation. */
export function pairsFromDocs(docs, domainId, negativesPer = 3) {
  const pairs = [];
  for (let i = 0; i < docs.length; i++) {
    const pos = docs[i];
    const negDocs = docs.filter((_, j) => j !== i);
    const negatives = [];
    for (let n = 0; n < negativesPer && n < negDocs.length; n++) {
      const idx = (i * 7 + n * 3) % negDocs.length;
      negatives.push({
        id: `${negDocs[idx].kind}:${negDocs[idx].number}`,
        text: `${negDocs[idx].title}\n${negDocs[idx].text}`,
      });
    }
    pairs.push({
      domainId,
      question: `What is the rule about ${pos.title}?`,
      positive: {
        id: `${pos.kind}:${pos.number}`,
        text: `${pos.title}\n${pos.text}`,
      },
      negatives,
    });
  }
  return pairs;
}

export function formatSftRow(example, docsById, systemPrompt) {
  const excerpts = example.relevant_ids
    .map((id) => docsById.get(id))
    .filter(Boolean)
    .map((d) => `${citeLabel(d)}: ${d.text}`)
    .join('\n');

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content:
          `Rulebook: ${example.domainId}\nQuestion: ${example.question}\n\n` +
          `Official rules (excerpts, use these to ground your answer):\n${excerpts || 'None'}\n\n` +
          `Remember: short natural answer, then "Refer to: [rule ref]".`,
      },
      { role: 'assistant', content: example.answer },
    ],
    meta: {
      domainId: example.domainId,
      relevant_ids: example.relevant_ids,
    },
  };
}

export const GENERIC_SYSTEM_PROMPT =
  'You are a portable rules referee. Answer only from the provided official ' +
  'rules excerpts. Give a short natural answer, then a "Refer to:" line with ' +
  'the rule number/title. Do not invent rules. Do not paste long quotes.';
