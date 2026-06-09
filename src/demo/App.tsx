/**
 * Demo app. This is all it takes to consume the engine: import the component,
 * pass it the domains you want, and you have a grounded rules assistant.
 *
 * Add a new game/sport by importing another domain config and adding it to the
 * `domains` array — no other changes needed.
 */

import { RulesChat } from '../react';
import { httpAnswerer } from '../adapters';
import { mtg, wh40k } from '../domains';

// Optional: route answers through the bundled worker (npm run worker:dev).
// If the worker isn't running, RulesChat silently falls back to offline,
// retrieval-only answers — demonstrating the "no hosting required" default.
const answer = httpAnswerer({ url: '/api/rules/chat' });

export function App() {
  return (
    <div className="demo-shell">
      <header className="demo-header">
        <h1>Rules Engine</h1>
        <p>One config-driven assistant. Switch games in the header.</p>
      </header>
      <main className="demo-main">
        <RulesChat domains={[mtg, wh40k]} answer={answer} />
      </main>
    </div>
  );
}
