/**
 * Vite plugin: local lab API for synthesize / eval / optional Python training.
 * Dev-only — not part of the published package.
 */

import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  statSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { loadCorpora, loadCorporaManifest } from '../training/lib/load_corpora.mjs';

function ensureParent(path) {
  mkdirSync(dirname(path), { recursive: true });
}

function countJsonl(path) {
  if (!existsSync(path)) return 0;
  const text = readFileSync(path, 'utf8').trim();
  if (!text) return 0;
  return text.split('\n').filter(Boolean).length;
}

function fileInfo(path) {
  if (!existsSync(path)) return { exists: false, bytes: 0, mtime: null, lines: 0 };
  const st = statSync(path);
  return {
    exists: true,
    bytes: st.size,
    mtime: st.mtime.toISOString(),
    lines: path.endsWith('.jsonl') ? countJsonl(path) : 0,
  };
}

function runNode(scriptRel, args, root) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(root, scriptRel), ...args], {
      cwd: root,
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function runPython(scriptRel, args, root, logPath) {
  return new Promise((resolve) => {
    const child = spawn('python3', [join(root, scriptRel), ...args], {
      cwd: root,
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    const append = (chunk) => {
      const s = chunk.toString();
      stdout += s;
      try {
        ensureParent(logPath);
        writeFileSync(logPath, stdout + stderr);
      } catch {
        /* ignore */
      }
    };
    child.stdout.on('data', append);
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      try {
        ensureParent(logPath);
        writeFileSync(logPath, stdout + stderr);
      } catch {
        /* ignore */
      }
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on('error', (err) => {
      resolve({ code: 1, stdout, stderr: String(err) });
    });
  });
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

export function labApiPlugin(root = process.cwd()) {
  const dataDir = join(root, 'training', 'data');
  const artifactsDir = join(root, 'training', 'artifacts');
  const logPath = join(artifactsDir, 'lab-train.log');
  let busy = null;

  return {
    name: 'rules-engine-lab-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (!url.startsWith('/api/lab')) return next();

        try {
          if (req.method === 'GET' && url === '/api/lab/status') {
            const live = loadCorpora(root);
            const manifest = loadCorporaManifest(root);
            return sendJson(res, 200, {
              busy,
              files: {
                qa: fileInfo(join(dataDir, 'qa.jsonl')),
                pairs: fileInfo(join(dataDir, 'pairs.jsonl')),
                eval: fileInfo(join(dataDir, 'eval.jsonl')),
                metrics: fileInfo(join(dataDir, 'eval-metrics.json')),
                compare: fileInfo(join(dataDir, 'compare-metrics.json')),
                manifest: fileInfo(join(dataDir, 'corpora-manifest.json')),
                toys: fileInfo(join(dataDir, 'toy_rulebooks.json')),
              },
              metrics: existsSync(join(dataDir, 'eval-metrics.json'))
                ? JSON.parse(readFileSync(join(dataDir, 'eval-metrics.json'), 'utf8'))
                : null,
              compare: existsSync(join(dataDir, 'compare-metrics.json'))
                ? JSON.parse(readFileSync(join(dataDir, 'compare-metrics.json'), 'utf8'))
                : null,
              trainLogExists: existsSync(logPath),
              trainedDomains: (manifest?.domains ?? []).map((d) => ({
                id: d.id,
                label: d.label,
                docCount: d.docCount,
                origin: d.origin,
              })),
              availableDomains: live.domains.map((d) => ({
                id: d.id,
                label: d.label,
                docCount: d.docCount,
                origin: d.origin,
              })),
            });
          }

          if (req.method === 'GET' && url === '/api/lab/domains') {
            // Prefer last synth snapshot so Test matches what you trained with.
            const manifest = loadCorporaManifest(root);
            const live = loadCorpora(root);
            const domains = manifest?.domains?.length ? manifest.domains : live.domains;
            return sendJson(res, 200, {
              source: manifest?.domains?.length ? 'trained' : 'available',
              generatedAt: manifest?.generatedAt ?? null,
              domains,
            });
          }

          if (req.method === 'POST' && url === '/api/lab/rulebooks') {
            const body = await readBody(req);
            if (!body || typeof body !== 'object') {
              return sendJson(res, 400, { error: 'JSON body required' });
            }
            const id = String(body.id || body.label || `book-${Date.now()}`)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
              .slice(0, 64);
            if (!id) return sendJson(res, 400, { error: 'Missing id/label' });

            const docs = Array.isArray(body.docs)
              ? body.docs
              : Array.isArray(body.entries)
                ? body.entries.map((e) => ({
                    kind: e.kind || 'entry',
                    number: e.number ?? e.title,
                    title: e.title ?? e.number,
                    text: e.text,
                    section: e.section,
                  }))
                : null;
            if (!docs?.length) {
              return sendJson(res, 400, {
                error:
                  'Provide docs[] or entries[] with {title/number, text}. Any rulebook JSON works.',
              });
            }

            const dir = join(dataDir, 'rulebooks');
            mkdirSync(dir, { recursive: true });
            const payload = {
              id,
              label: body.label || body.source || id,
              source: body.source || body.label || id,
              sourceUrl: body.sourceUrl || body.url || '',
              version: body.version || body.versionLabel || 'custom',
              icon: body.icon || '📘',
              docs,
            };
            const path = join(dir, `${id}.json`);
            writeFileSync(path, JSON.stringify(payload, null, 2));
            return sendJson(res, 201, {
              ok: true,
              id,
              path: `training/data/rulebooks/${id}.json`,
              message: 'Saved. Run Synthesize so Test chat uses this book.',
            });
          }

          if (req.method === 'DELETE' && url.startsWith('/api/lab/rulebooks/')) {
            const id = decodeURIComponent(url.slice('/api/lab/rulebooks/'.length));
            const path = join(dataDir, 'rulebooks', `${id}.json`);
            if (!existsSync(path)) return sendJson(res, 404, { error: 'Not found' });
            unlinkSync(path);
            return sendJson(res, 200, { ok: true, id });
          }

          if (req.method === 'GET' && url === '/api/lab/samples') {
            const evalPath = join(dataDir, 'eval.jsonl');
            if (!existsSync(evalPath)) {
              return sendJson(res, 404, { error: 'No eval.jsonl — run Synthesize first.' });
            }
            const q = new URL(req.url, 'http://local');
            const limit = Math.min(20, Math.max(1, Number(q.searchParams.get('limit') || 5)));
            const lines = readFileSync(evalPath, 'utf8')
              .trim()
              .split('\n')
              .filter(Boolean)
              .slice(0, limit)
              .map((line) => {
                const row = JSON.parse(line);
                return {
                  domainId: row.domainId,
                  question: row.question,
                  relevant_ids: row.relevant_ids,
                  answer: row.answer,
                };
              });
            return sendJson(res, 200, { samples: lines });
          }

          if (req.method === 'GET' && url === '/api/lab/train-log') {
            if (!existsSync(logPath)) {
              return sendJson(res, 200, { log: '' });
            }
            return sendJson(res, 200, { log: readFileSync(logPath, 'utf8') });
          }

          if (req.method === 'POST' && url === '/api/lab/synth') {
            if (busy) return sendJson(res, 409, { error: `Busy: ${busy}` });
            busy = 'synth';
            const result = await runNode('training/synthesize_qa.mjs', [], root);
            busy = null;
            return sendJson(res, result.code === 0 ? 200 : 500, {
              ok: result.code === 0,
              stdout: result.stdout.trim(),
              stderr: result.stderr.trim(),
              files: {
                qa: fileInfo(join(dataDir, 'qa.jsonl')),
                pairs: fileInfo(join(dataDir, 'pairs.jsonl')),
                eval: fileInfo(join(dataDir, 'eval.jsonl')),
              },
            });
          }

          if (req.method === 'POST' && url === '/api/lab/eval') {
            if (busy) return sendJson(res, 409, { error: `Busy: ${busy}` });
            busy = 'eval';
            const synth = await runNode('training/synthesize_qa.mjs', [], root);
            if (synth.code !== 0) {
              busy = null;
              return sendJson(res, 500, {
                ok: false,
                stdout: synth.stdout.trim(),
                stderr: synth.stderr.trim(),
              });
            }
            const result = await runNode('training/eval_retrieval.mjs', ['--json'], root);
            busy = null;
            let metrics = null;
            try {
              metrics = JSON.parse(readFileSync(join(dataDir, 'eval-metrics.json'), 'utf8'));
            } catch {
              /* parse from stdout fallback */
              try {
                metrics = JSON.parse(result.stdout.trim().split('\n').pop() || '{}');
              } catch {
                metrics = null;
              }
            }
            return sendJson(res, result.code === 0 ? 200 : 500, {
              ok: result.code === 0,
              stdout: result.stdout.trim(),
              stderr: result.stderr.trim(),
              metrics,
            });
          }

          if (req.method === 'POST' && url === '/api/lab/compare') {
            if (busy) return sendJson(res, 409, { error: `Busy: ${busy}` });
            if (!existsSync(join(dataDir, 'eval.jsonl'))) {
              return sendJson(res, 400, {
                error: 'No eval.jsonl — run Synthesize first (freeze the eval set).',
              });
            }
            busy = 'compare';
            const result = await runNode('training/eval_compare.mjs', ['--json'], root);
            busy = null;
            let compare = null;
            try {
              compare = JSON.parse(readFileSync(join(dataDir, 'compare-metrics.json'), 'utf8'));
            } catch {
              try {
                compare = JSON.parse(result.stdout.trim().split('\n').pop() || '{}');
              } catch {
                compare = null;
              }
            }
            return sendJson(res, result.code === 0 ? 200 : 500, {
              ok: result.code === 0,
              stdout: result.stdout.trim(),
              stderr: result.stderr.trim(),
              compare,
            });
          }

          if (req.method === 'POST' && (url === '/api/lab/train-embed' || url === '/api/lab/train-sft')) {
            if (busy) return sendJson(res, 409, { error: `Busy: ${busy}` });
            const kind = url.endsWith('embed') ? 'embed' : 'sft';
            const script =
              kind === 'embed' ? 'training/train_embed.py' : 'training/train_sft.py';
            if (!existsSync(join(root, script))) {
              return sendJson(res, 404, { error: `Missing ${script}` });
            }
            if (!existsSync(join(dataDir, kind === 'embed' ? 'pairs.jsonl' : 'qa.jsonl'))) {
              return sendJson(res, 400, {
                error: 'Training data missing — run Synthesize first.',
              });
            }
            busy = `train-${kind}`;
            ensureParent(logPath);
            writeFileSync(logPath, `Starting ${script}…\n`);
            // Fire-and-forget long jobs; client polls train-log + status
            runPython(script, [], root, logPath).then((result) => {
              const footer = `\n\n[exit ${result.code}]\n`;
              try {
                writeFileSync(
                  logPath,
                  (existsSync(logPath) ? readFileSync(logPath, 'utf8') : '') + footer
                );
              } catch {
                /* ignore */
              }
              busy = null;
            });
            await readBody(req);
            return sendJson(res, 202, {
              ok: true,
              started: kind,
              message: `Started ${script}. Poll /api/lab/train-log for output.`,
            });
          }

          return sendJson(res, 404, { error: 'Unknown lab endpoint' });
        } catch (err) {
          busy = null;
          return sendJson(res, 500, { error: String(err) });
        }
      });
    },
  };
}
