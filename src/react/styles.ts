/**
 * Self-injecting structural styles for <RulesChat />.
 * Visual tokens come from {@link RulesVisualIdentity} via CSS variables on the
 * root — the package owns layout; the host owns brand.
 */

let injected = false;

export const RULES_CHAT_CSS = `
.rules-chat {
  --re-bg-primary: #12141a;
  --re-bg-secondary: #1a1d26;
  --re-bg-tertiary: #12151c;
  --re-border: #2c3140;
  --re-text-primary: #e8eaef;
  --re-text-secondary: #9aa0b0;
  --re-accent: #6b8cae;
  --re-accent-contrast: #0e1116;
  --re-accent-soft: rgba(107, 140, 174, 0.18);
  --re-radius: 8px;
  --re-font: system-ui, -apple-system, Segoe UI, sans-serif;
  --re-font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 480px;
  max-width: 900px;
  margin: 0 auto;
  background: var(--re-bg-secondary);
  border-radius: var(--re-radius);
  border: 1px solid var(--re-border);
  overflow: hidden;
  color: var(--re-text-primary);
  font-family: var(--re-font);
  position: relative;
}
.rules-chat-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: var(--re-bg-secondary);
  border-bottom: 1px solid var(--re-border);
  flex-wrap: wrap;
}
.rules-chat-title { display: flex; align-items: center; gap: 0.75rem; flex: 1; min-width: 0; }
.rules-chat-icon { font-size: 1.5rem; }
.rules-chat[data-domain-icon="off"] .rules-chat-icon { display: none; }
.rules-chat-title h2 { margin: 0; font-size: 1.05rem; font-weight: 600; color: var(--re-text-primary); }
.rules-chat .back-button {
  background: var(--re-bg-tertiary);
  border: 1px solid var(--re-border);
  color: var(--re-text-primary);
  padding: 0.4rem 0.8rem;
  border-radius: var(--re-radius);
  cursor: pointer;
  font-family: var(--re-font);
}
.rules-source-note {
  font-size: 0.7rem;
  color: var(--re-text-secondary);
  background: var(--re-bg-tertiary);
  border: 1px solid var(--re-border);
  padding: 0.15rem 0.5rem;
  border-radius: calc(var(--re-radius) * 0.5);
  white-space: nowrap;
}
.rules-game-switch {
  display: inline-flex;
  gap: 0.25rem;
  background: var(--re-bg-tertiary);
  border: 1px solid var(--re-border);
  border-radius: var(--re-radius);
  padding: 0.2rem;
}
.game-switch-btn {
  background: transparent;
  border: none;
  color: var(--re-text-secondary);
  padding: 0.4rem 0.7rem;
  border-radius: calc(var(--re-radius) * 0.75);
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  font-family: var(--re-font);
  white-space: nowrap;
  transition: background 0.12s ease, color 0.12s ease;
}
.game-switch-btn:hover:not(:disabled) { color: var(--re-text-primary); background: var(--re-accent-soft); }
.game-switch-btn.active { background: var(--re-accent-soft); color: var(--re-accent); }
.game-switch-btn:disabled { opacity: 0.6; cursor: default; }
.rules-chat[data-domain-icon="off"] .game-switch-btn .domain-icon { display: none; }
.rules-update-banner {
  margin: 0.75rem 1.5rem 0;
  padding: 0.65rem 1rem;
  border-radius: var(--re-radius);
  border: 1px solid var(--re-border);
  background: var(--re-accent-soft);
  color: var(--re-text-secondary);
  font-size: 0.85rem;
  line-height: 1.45;
}
.rules-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.chat-message { display: flex; gap: 0.75rem; max-width: 85%; }
.chat-message.user { align-self: flex-end; flex-direction: row-reverse; }
.chat-message.assistant { align-self: flex-start; }
.message-avatar {
  width: 36px;
  height: 36px;
  background: var(--re-bg-tertiary);
  border: 1px solid var(--re-border);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  flex-shrink: 0;
}
.rules-chat[data-avatars="off"] .message-avatar { display: none; }
.message-content { display: flex; flex-direction: column; gap: 0.75rem; min-width: 0; }
.message-text {
  background: var(--re-bg-tertiary);
  border: 1px solid var(--re-border);
  padding: 0.75rem 1rem;
  border-radius: var(--re-radius);
  line-height: 1.6;
}
.chat-message.user .message-text {
  background: var(--re-accent-soft);
  border-color: var(--re-accent);
  color: var(--re-text-primary);
}
.message-text p { margin: 0 0 0.5rem 0; }
.message-text p:last-child { margin-bottom: 0; }
.message-text strong { color: var(--re-accent); font-weight: 600; }
.chat-message.user .message-text strong { color: var(--re-accent); text-decoration: none; }
.message-text em { color: var(--re-text-secondary); font-style: italic; }
.message-text .md-bullet { display: flex; gap: 0.5rem; margin: 0.25rem 0; padding-left: 0.5rem; }
.message-text .bullet { color: var(--re-accent); flex-shrink: 0; }
.message-text .md-hr { border: none; border-top: 1px solid var(--re-border); margin: 0.75rem 0; }
.message-text .md-spacer { height: 0.25rem; margin: 0; }
.message-rules { display: flex; flex-direction: column; gap: 0.5rem; }
.message-rules.comp-rules { margin-top: 0.35rem; border-top: 1px solid var(--re-border); padding-top: 0.65rem; }
.comp-rules-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  margin: 0;
  padding: 0.35rem 0;
  border: 0;
  background: transparent;
  color: var(--re-text-secondary);
  cursor: pointer;
  font-family: var(--re-font);
  text-align: left;
}
.comp-rules-toggle:hover { color: var(--re-accent); }
.comp-rules-label {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.comp-rules-count {
  font-size: 0.75rem;
  white-space: nowrap;
}
.comp-rules-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.35rem;
}
.rule-card {
  background: var(--re-bg-tertiary);
  border: 1px solid var(--re-border);
  border-radius: var(--re-radius);
  overflow: hidden;
  transition: border-color 0.12s ease;
}
.rule-card:hover { border-color: var(--re-accent); }
.rule-card-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 1rem;
  background: var(--re-bg-secondary);
}
.rule-number {
  font-family: var(--re-font-mono);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--re-accent);
  background: var(--re-accent-soft);
  padding: 0.25rem 0.5rem;
  border-radius: calc(var(--re-radius) * 0.5);
}
.rule-title { flex: 1; font-weight: 600; color: var(--re-text-primary); }
.rule-expand { color: var(--re-text-secondary); font-size: 1.25rem; width: 24px; text-align: center; }
.comp-rule-card .rule-card-body { padding: 0.6rem 1rem 0.75rem; }
.rule-text { color: var(--re-text-secondary); line-height: 1.6; margin: 0; }
.typing-indicator {
  display: flex;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
  background: var(--re-bg-tertiary);
  border: 1px solid var(--re-border);
  border-radius: var(--re-radius);
}
.typing-indicator span {
  width: 8px;
  height: 8px;
  background: var(--re-text-secondary);
  border-radius: 50%;
  animation: re-typing 1.4s infinite ease-in-out both;
}
.typing-indicator span:nth-child(1) { animation-delay: 0s; }
.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
@keyframes re-typing {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}
.rules-chat-suggestions {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: var(--re-bg-secondary);
  border-top: 1px solid var(--re-border);
  overflow-x: auto;
  align-items: center;
}
.rules-chat-suggestions span { color: var(--re-text-secondary); font-size: 0.85rem; white-space: nowrap; }
.rules-chat-suggestions button {
  background: var(--re-bg-tertiary);
  border: 1px solid var(--re-border);
  color: var(--re-text-primary);
  padding: 0.25rem 0.75rem;
  border-radius: var(--re-radius);
  cursor: pointer;
  font-size: 0.85rem;
  font-family: var(--re-font);
  white-space: nowrap;
}
.rules-chat-suggestions button:hover { border-color: var(--re-accent); color: var(--re-accent); }
.rules-chat-input {
  display: flex;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background: var(--re-bg-secondary);
  border-top: 1px solid var(--re-border);
}
.rules-chat-input input {
  flex: 1;
  background: var(--re-bg-tertiary);
  border: 1px solid var(--re-border);
  border-radius: var(--re-radius);
  padding: 0.65rem 1rem;
  color: var(--re-text-primary);
  font-size: 0.95rem;
  font-family: var(--re-font);
}
.rules-chat-input input:focus { outline: none; border-color: var(--re-accent); }
.rules-chat-input button {
  background: var(--re-accent);
  border: none;
  color: var(--re-accent-contrast);
  padding: 0.65rem 1.5rem;
  border-radius: var(--re-radius);
  cursor: pointer;
  font-weight: 600;
  font-family: var(--re-font);
}
.rules-chat-input button:disabled { opacity: 0.5; cursor: default; }
.rules-chat-credit {
  position: absolute;
  right: 0.85rem;
  bottom: 0.45rem;
  font-size: 0.65rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--re-text-secondary);
  opacity: 0.45;
  pointer-events: none;
  user-select: none;
}
`;

/** Inject the component stylesheet once (idempotent, no-op when not in a DOM). */
export function injectStyles(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.setAttribute('data-rules-engine', '');
  style.textContent = RULES_CHAT_CSS;
  document.head.appendChild(style);
}
