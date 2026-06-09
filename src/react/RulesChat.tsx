/**
 * Drop-in rules assistant UI. Fully driven by the `domains` you pass in — the
 * game switcher, quick questions, citations, greeting and AI grounding are all
 * derived from each domain's config. No game-specific code lives here.
 */

import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import {
  registerDomains,
  loadDomain,
  getDomainMeta,
  searchDomain,
  buildDomainContext,
  loadManifest,
  isUpdateAvailable,
  type RulesDomain,
  type RuleSearchResult,
  type RulesAnswerer,
} from '../core';
import { injectStyles } from './styles';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: RuleSearchResult[];
  citationLabel?: string;
  timestamp: Date;
}

export interface RulesChatProps {
  /** Domains this assistant supports. The first is selected by default. */
  domains: RulesDomain[];
  /** Optional id of the domain to start on. */
  defaultDomainId?: string;
  /**
   * Optional pluggable AI answerer. Omit it for a fully offline, retrieval-only
   * assistant (it shows the best-matching official rule). Provide one (e.g.
   * `httpAnswerer`, `openAiAnswerer`, or your own) to get LLM answers.
   */
  answer?: RulesAnswerer;
  /** Optional manifest URL override (freshness banner). Default '/data/rules-manifest.json'. */
  manifestUrl?: string;
  onBack?: () => void;
}

function renderMarkdown(text: string): JSX.Element[] {
  const lines = text.split('\n');
  const elements: JSX.Element[] = [];

  lines.forEach((line, lineIndex) => {
    const parseInline = (str: string): (string | JSX.Element)[] => {
      const parts: (string | JSX.Element)[] = [];
      let remaining = str;
      let keyCounter = 0;
      while (remaining.length > 0) {
        const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
        if (boldMatch && boldMatch.index !== undefined) {
          if (boldMatch.index > 0) parts.push(remaining.slice(0, boldMatch.index));
          parts.push(<strong key={`b-${lineIndex}-${keyCounter++}`}>{boldMatch[1]}</strong>);
          remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
          continue;
        }
        const italicMatch = remaining.match(/\*(.+?)\*/);
        if (italicMatch && italicMatch.index !== undefined) {
          if (italicMatch.index > 0) parts.push(remaining.slice(0, italicMatch.index));
          parts.push(<em key={`i-${lineIndex}-${keyCounter++}`}>{italicMatch[1]}</em>);
          remaining = remaining.slice(italicMatch.index + italicMatch[0].length);
          continue;
        }
        parts.push(remaining);
        break;
      }
      return parts;
    };

    const trimmed = line.trim();
    if (trimmed.startsWith('• ') || trimmed.startsWith('- ')) {
      elements.push(
        <p key={lineIndex} className="md-bullet">
          <span className="bullet">•</span> {parseInline(trimmed.slice(2))}
        </p>
      );
    } else if (trimmed === '---') {
      elements.push(<hr key={lineIndex} className="md-hr" />);
    } else if (trimmed === '') {
      elements.push(<p key={lineIndex} className="md-spacer">&nbsp;</p>);
    } else {
      elements.push(<p key={lineIndex}>{parseInline(line)}</p>);
    }
  });

  return elements;
}

function buildEntryFallback(results: RuleSearchResult[]): string | null {
  if (!results || results.length === 0) return null;
  const top = results[0];
  let label: string;
  if (top.kind === 'glossary') label = top.title;
  else if (top.kind === 'rule') label = `${top.number}${top.title !== top.number ? ` ${top.title}` : ''}`;
  else label = top.title;
  let out = `**${label}**\n\n${top.text}`;
  if (results.length > 1) out += `\n\n---\n*See the related rules below for more detail.*`;
  return out;
}

export function RulesChat({
  domains,
  defaultDomainId,
  answer,
  manifestUrl,
  onBack,
}: RulesChatProps) {
  // Register the supplied domains once so the engine can resolve them.
  useMemo(() => registerDomains(...domains), [domains]);

  // Inject the component stylesheet once (no CSS import needed by consumers).
  useEffect(() => injectStyles(), []);

  const initialId = defaultDomainId && domains.some((d) => d.id === defaultDomainId)
    ? defaultDomainId
    : domains[0]?.id;

  const [activeId, setActiveId] = useState(initialId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [versionLabel, setVersionLabel] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeDomain = useMemo(
    () => domains.find((d) => d.id === activeId) ?? domains[0],
    [domains, activeId]
  );

  // Lazy-load the active domain's dataset + the freshness manifest.
  useEffect(() => {
    if (!activeDomain) return;
    let cancelled = false;
    setVersionLabel(null);
    setSourceName(null);
    setUpdateAvailable(false);
    Promise.all([loadDomain(activeDomain), loadManifest(manifestUrl)]).then(([ok]) => {
      if (cancelled) return;
      if (ok) {
        const meta = getDomainMeta(activeDomain);
        setVersionLabel(meta?.versionLabel ?? null);
        setSourceName(meta?.source ?? null);
      }
      setUpdateAvailable(isUpdateAvailable(activeDomain.id));
    });
    return () => {
      cancelled = true;
    };
  }, [activeDomain, manifestUrl]);

  // Greeting whenever the active domain changes.
  useEffect(() => {
    if (!activeDomain) return;
    const samples = activeDomain.ui.quickQuestions
      .slice(0, 3)
      .map((q) => `• "${q.query}"`)
      .join('\n');
    const note = activeDomain.ui.greetingNote ? `\n\n${activeDomain.ui.greetingNote}` : '';
    setMessages([
      {
        id: `welcome-${activeDomain.id}`,
        role: 'assistant',
        content: `Welcome to the ${activeDomain.label.full} Rules Assistant! 🎲\n\nAsk me any rules question. Try:\n${samples}${note}`,
        timestamp: new Date(),
      },
    ]);
  }, [activeDomain]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeDomain) return;

    const question = input.trim();
    const domain = activeDomain;

    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', content: question, timestamp: new Date() },
    ]);
    setInput('');
    setIsTyping(true);

    await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 400));

    // Retrieve the most relevant official rules: shown as citations + sent to AI.
    let citations: RuleSearchResult[] = [];
    let ruleContext = '';
    try {
      await loadDomain(domain);
      citations = searchDomain(domain, question, 6);
      ruleContext = buildDomainContext(domain, question);
    } catch {
      /* non-fatal: continue without grounding */
    }

    let content = '';
    if (answer) {
      try {
        const result = await answer({ query: question, domain, context: ruleContext, citations });
        if (result?.trim()) content = result.trim();
      } catch {
        /* silent fallback to retrieval-only below */
      }
    }

    if (!content) {
      content =
        buildEntryFallback(citations) ||
        "I couldn't find a matching rules entry. Try rephrasing your question.";
    }

    setMessages((prev) => [
      ...prev,
      {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content,
        citations,
        citationLabel: domain.ui.citationLabel,
        timestamp: new Date(),
      },
    ]);
    setIsTyping(false);
    inputRef.current?.focus();
  };

  if (!activeDomain) {
    return <div className="rules-chat">No rules domains configured.</div>;
  }

  return (
    <div className="rules-chat">
      <div className="rules-chat-header">
        {onBack && (
          <button className="back-button" onClick={onBack}>
            ← Back
          </button>
        )}
        <div className="rules-chat-title">
          <span className="rules-chat-icon">📖</span>
          <h2>{activeDomain.label.short} Rules Assistant</h2>
          {versionLabel && (
            <span className="rules-source-note">
              {sourceName} · {versionLabel}
            </span>
          )}
        </div>
        {domains.length > 1 && (
          <div className="rules-game-switch" role="group" aria-label="Choose game">
            {domains.map((d) => (
              <button
                key={d.id}
                className={`game-switch-btn ${activeDomain.id === d.id ? 'active' : ''}`}
                onClick={() => setActiveId(d.id)}
                disabled={isTyping}
                title={d.label.full}
              >
                <span aria-hidden="true">{d.label.icon}</span> {d.label.short}
              </button>
            ))}
          </div>
        )}
      </div>

      {updateAvailable && (
        <div className="rules-update-banner" role="status">
          A newer official {activeDomain.label.short} rules document is available from the
          publisher. The site will pick it up on the next automated rules refresh.
        </div>
      )}

      <div className="rules-chat-messages">
        {messages.map((message) => (
          <div key={message.id} className={`chat-message ${message.role}`}>
            <div className="message-avatar">{message.role === 'user' ? '👤' : '🤖'}</div>
            <div className="message-content">
              <div className="message-text">{renderMarkdown(message.content)}</div>
              {message.citations && message.citations.length > 0 && (
                <div className="message-rules comp-rules">
                  <div className="comp-rules-label">{message.citationLabel || '📜 Official Rules'}</div>
                  {message.citations.map((rule) => (
                    <CompRuleCard key={`${rule.kind}-${rule.number}`} rule={rule} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="chat-message assistant">
            <div className="message-avatar">🤖</div>
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="rules-chat-suggestions">
        <span>Quick questions:</span>
        {activeDomain.ui.quickQuestions.map((q) => (
          <button
            key={q.label}
            onClick={() => {
              setInput(q.query);
              inputRef.current?.focus();
            }}
          >
            {q.label}
          </button>
        ))}
      </div>

      <form className="rules-chat-input" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a rules question..."
          disabled={isTyping}
        />
        <button type="submit" disabled={isTyping || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

function CompRuleCard({ rule }: { rule: RuleSearchResult }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = rule.text.length > 220;
  const preview = isLong && !expanded ? `${rule.text.slice(0, 220).trim()}…` : rule.text;

  let badge: string;
  let secondary: string;
  if (rule.kind === 'glossary') {
    badge = rule.title;
    secondary = 'Glossary';
  } else if (rule.kind === 'rule') {
    badge = `Rule ${rule.number}`;
    secondary = rule.title !== rule.number ? rule.title : '';
  } else {
    badge = rule.title;
    secondary = rule.section || '';
  }

  return (
    <div className={`rule-card comp-rule-card ${expanded ? 'expanded' : ''}`}>
      <div
        className="rule-card-header"
        onClick={() => isLong && setExpanded(!expanded)}
        style={{ cursor: isLong ? 'pointer' : 'default' }}
      >
        <span className="rule-number">{badge}</span>
        <span className="rule-title">{secondary}</span>
        {isLong && <span className="rule-expand">{expanded ? '−' : '+'}</span>}
      </div>
      <div className="rule-card-body">
        <p className="rule-text">{preview}</p>
      </div>
    </div>
  );
}
