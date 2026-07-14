/**
 * Demo app. This is all it takes to consume the engine: import the component,
 * pass it the domains you want, and you have a grounded rules assistant.
 *
 * Chess uses loadRaw (bundled JSON). MTG / Warhammer use datasetUrl (served
 * from public/data). Adding another game = one more domain in the array.
 */

import { RulesChat } from '../../src/react';
import { httpAnswerer } from '../../src/adapters';
import { mtg, wh40k, chess } from '../../src/domains';

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
        <RulesChat domains={[mtg, wh40k, chess]} answer={answer} />
      </main>
    </div>
  );
}
