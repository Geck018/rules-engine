/**
 * Self-injecting styles for <RulesChat />. The component calls `injectStyles()`
 * on mount so consumers don't need to import any CSS file — true plug-and-play.
 * Theme variables are scoped to `.rules-chat`; override them from a parent to
 * match your design system.
 */

let injected = false;

export const RULES_CHAT_CSS = `
.rules-chat {
  --re-bg-primary: #1a1a2e;
  --re-bg-secondary: #16213e;
  --re-bg-tertiary: #0f3460;
  --re-border: #2a3a5e;
  --re-text-primary: #e8e8e8;
  --re-text-secondary: #a0a0b0;
  --re-accent: #e94560;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 480px;
  max-width: 900px;
  margin: 0 auto;
  background: var(--re-bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--re-border);
  overflow: hidden;
  color: var(--re-text-primary);
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}
.rules-chat-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: var(--re-bg-tertiary);
  border-bottom: 1px solid var(--re-border);
  flex-wrap: wrap;
}
.rules-chat-title { display: flex; align-items: center; gap: 0.75rem; flex: 1; min-width: 0; }
.rules-chat-icon { font-size: 1.5rem; }
.rules-chat-title h2 { margin: 0; font-size: 1.2rem; color: var(--re-text-primary); }
.rules-chat .back-button {
  background: var(--re-bg-secondary);
  border: 1px solid var(--re-border);
  color: var(--re-text-primary);
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
}
.rules-source-note {
  font-size: 0.7rem;
  color: var(--re-text-secondary);
  background: var(--re-bg-secondary);
  border: 1px solid var(--re-border);
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  white-space: nowrap;
}
.rules-game-switch {
  display: inline-flex;
  gap: 0.25rem;
  background: var(--re-bg-secondary);
  border: 1px solid var(--re-border);
  border-radius: 8px;
  padding: 0.2rem;
}
.game-switch-btn {
  background: transparent;
  border: none;
  color: var(--re-text-secondary);
  padding: 0.4rem 0.7rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  transition: all 0.15s;
}
.game-switch-btn:hover:not(:disabled) { color: var(--re-text-primary); background: var(--re-border); }
.game-switch-btn.active { background: var(--re-accent); color: #fff; }
.game-switch-btn:disabled { opacity: 0.6; cursor: default; }
.rules-update-banner {
  margin: 0.75rem 1.5rem 0;
  padding: 0.65rem 1rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 193, 7, 0.45);
  background: rgba(255, 193, 7, 0.12);
  color: var(--re-text-primary);
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
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  flex-shrink: 0;
}
.message-content { display: flex; flex-direction: column; gap: 0.75rem; min-width: 0; }
.message-text { background: var(--re-bg-tertiary); padding: 0.75rem 1rem; border-radius: 12px; line-height: 1.6; }
.chat-message.user .message-text { background: var(--re-accent); color: #fff; }
.message-text p { margin: 0 0 0.5rem 0; }
.message-text p:last-child { margin-bottom: 0; }
.message-text strong { color: var(--re-accent); font-weight: 700; }
.chat-message.user .message-text strong { color: #fff; text-decoration: underline; }
.message-text em { color: var(--re-text-secondary); font-style: italic; }
.message-text .md-bullet { display: flex; gap: 0.5rem; margin: 0.25rem 0; padding-left: 0.5rem; }
.message-text .bullet { color: var(--re-accent); flex-shrink: 0; }
.message-text .md-hr { border: none; border-top: 1px solid var(--re-border); margin: 0.75rem 0; }
.message-text .md-spacer { height: 0.25rem; margin: 0; }
.message-rules { display: flex; flex-direction: column; gap: 0.5rem; }
.message-rules.comp-rules { margin-top: 0.25rem; border-top: 1px dashed var(--re-border); padding-top: 0.75rem; }
.comp-rules-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--re-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.25rem;
}
.rule-card { background: var(--re-bg-tertiary); border: 1px solid var(--re-border); border-radius: 8px; overflow: hidden; transition: all 0.2s; }
.rule-card:hover { border-color: var(--re-accent); }
.rule-card-header { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 1rem; background: var(--re-bg-secondary); }
.rule-number {
  font-family: monospace;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--re-accent);
  background: rgba(233, 69, 96, 0.1);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}
.rule-title { flex: 1; font-weight: 600; color: var(--re-text-primary); }
.rule-expand { color: var(--re-text-secondary); font-size: 1.25rem; width: 24px; text-align: center; }
.comp-rule-card .rule-card-body { padding: 0.6rem 1rem 0.75rem; }
.rule-text { color: var(--re-text-secondary); line-height: 1.6; margin: 0; }
.typing-indicator { display: flex; gap: 0.25rem; padding: 0.75rem 1rem; background: var(--re-bg-tertiary); border-radius: 12px; }
.typing-indicator span { width: 8px; height: 8px; background: var(--re-text-secondary); border-radius: 50%; animation: re-typing 1.4s infinite ease-in-out both; }
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
  background: var(--re-bg-tertiary);
  border-top: 1px solid var(--re-border);
  overflow-x: auto;
  align-items: center;
}
.rules-chat-suggestions span { color: var(--re-text-secondary); font-size: 0.85rem; white-space: nowrap; }
.rules-chat-suggestions button {
  background: var(--re-bg-secondary);
  border: 1px solid var(--re-border);
  color: var(--re-text-primary);
  padding: 0.25rem 0.75rem;
  border-radius: 16px;
  cursor: pointer;
  font-size: 0.85rem;
  white-space: nowrap;
}
.rules-chat-suggestions button:hover { border-color: var(--re-accent); }
.rules-chat-input { display: flex; gap: 0.75rem; padding: 1rem 1.5rem; background: var(--re-bg-tertiary); border-top: 1px solid var(--re-border); }
.rules-chat-input input {
  flex: 1;
  background: var(--re-bg-secondary);
  border: 1px solid var(--re-border);
  border-radius: 8px;
  padding: 0.65rem 1rem;
  color: var(--re-text-primary);
  font-size: 0.95rem;
}
.rules-chat-input input:focus { outline: none; border-color: var(--re-accent); }
.rules-chat-input button { background: var(--re-accent); border: none; color: #fff; padding: 0.65rem 1.5rem; border-radius: 8px; cursor: pointer; font-weight: 600; }
.rules-chat-input button:disabled { opacity: 0.5; cursor: default; }
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
