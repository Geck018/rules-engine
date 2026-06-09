/**
 * Deployable Cloudflare Worker for the rules-engine demo.
 *
 * Wires the reusable handler factory to the bundled MTG + Warhammer domains.
 * To support a different set of games/sports, swap the domains below.
 */

import { createRulesHandler, type RulesAiEnv } from '../src/worker/handler';
import { mtg, wh40k } from '../src/domains';

export interface Env extends RulesAiEnv {}

const handleRulesChat = createRulesHandler([mtg, wh40k]);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === '/api/health') {
      return new Response(
        JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    if (url.pathname === '/api/rules/chat' && request.method === 'POST') {
      return handleRulesChat(request, env);
    }

    return new Response('Not found', { status: 404, headers: corsHeaders });
  },
};
