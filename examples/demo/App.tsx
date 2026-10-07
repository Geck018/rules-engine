/**
 * Local lab UI: test browser RAG against whatever corpora you trained with,
 * synthesize/eval training data, and upload any rulebook JSON.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RulesChat } from '../../src/react';
import {
  browserModelAnswerer,
  clearBrowserRetrieverCache,
  createRulesChatSearch,
  getBrowserRetrieverForDomain,
  preloadBrowserModels,
} from '../../src/browser';
import { clearDomains } from '../../src/core';
import {
  domainFromCorpus,
  type CorpusDomainPayload,
} from './domainFromCorpus';
import { labIdentity } from './labIdentity';

type Tab = 'test' | 'train';

interface LabFileInfo {
  exists: boolean;
  bytes: number;
  mtime: string | null;
  lines: number;
}

interface LabMetrics {
  evalRows: number;
  recallAt1: number;
  recallAt3: number;
  recallAt6: number;
  groundedness: number;
  generatedAt: string;
}

interface CompareSide {
  label: string;
  recallAt1: number;
  recallAt3: number;
  recallAt6: number;
  extractiveGroundedness: number;
}

interface CompareReport {
  evalRows: number;
  hybridEnabled: boolean;
  before: CompareSide;
  after: CompareSide;
  delta: {
    recallAt1: number;
    recallAt3: number;
    recallAt6: number;
    extractiveGroundedness: number;
  };
  generatedAt: string;
}

interface DomainSummary {
  id: string;
  label: { short: string; full: string; icon: string };
  docCount: number;
  origin: string;
}

interface LabStatus {
  busy: string | null;
  files: Record<string, LabFileInfo>;
  metrics: LabMetrics | null;
  compare: CompareReport | null;
  trainLogExists: boolean;
  trainedDomains: DomainSummary[];
  availableDomains: DomainSummary[];
}

function signedPp(n: number | undefined): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  const pp = (n * 100).toFixed(1);
  return `${n >= 0 ? '+' : ''}${pp} pp`;
}

interface SampleRow {
  domainId: string;
  question: string;
  relevant_ids: string[];
  answer: string;
}

function pct(n: number | undefined): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function formatBytes(n: number): string {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function labFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `${res.status} ${path}`);
  return data;
}

function ChatPane({
  statusMessage,
  setStatusMessage,
}: {
  statusMessage: string | null;
  setStatusMessage: (s: string | null) => void;
}) {
  const [corpora, setCorpora] = useState<CorpusDomainPayload[]>([]);
  const [source, setSource] = useState<'trained' | 'available' | 'loading'>('loading');
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await labFetch<{
        source: 'trained' | 'available';
        generatedAt: string | null;
        domains: CorpusDomainPayload[];
      }>('/api/lab/domains');
      clearDomains();
      clearBrowserRetrieverCache();
      setCorpora(res.domains);
      setSource(res.source);
      setGeneratedAt(res.generatedAt);
      setError(null);
      setStatusMessage(
        res.source === 'trained'
          ? `Testing trained corpora (${res.domains.length} rulebooks).`
          : 'No synth yet — showing available corpora. Run Train → Synthesize to lock the test set.'
      );
    } catch (err) {
      setError(String(err));
    }
  }, [setStatusMessage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const domains = useMemo(() => corpora.map(domainFromCorpus), [corpora]);

  const answer = useMemo(
    () =>
      browserModelAnswerer({
        reRetrieve: false,
        onProgress: (p) => {
          if (p.status === 'ready' || p.status === 'done' || p.status === 'error') {
            setStatusMessage(p.message);
            return;
          }
          const pctNum =
            typeof p.progress === 'number' ? ` ${Math.round(p.progress * 100)}%` : '';
          setStatusMessage(`${p.message}${pctNum}`);
        },
      }),
    [setStatusMessage]
  );

  const search = useMemo(
    () =>
      createRulesChatSearch((domain) =>
        getBrowserRetrieverForDomain(domain, {
          onProgress: (p) => {
            if (p.status === 'error' || p.status === 'ready') {
              setStatusMessage(p.message);
              return;
            }
            const pctNum =
              typeof p.progress === 'number' ? ` ${Math.round(p.progress * 100)}%` : '';
            setStatusMessage(`${p.message}${pctNum}`);
          },
        })
      ),
    [setStatusMessage]
  );

  if (error) {
    return (
      <div className="lab-train">
        <section className="lab-card">
          <h2>Could not load corpora</h2>
          <p className="lab-error">{error}</p>
          <button type="button" onClick={() => void reload()}>
            Retry
          </button>
        </section>
      </div>
    );
  }

  if (source === 'loading' || domains.length === 0) {
    return (
      <div className="lab-train">
        <section className="lab-card">
          <h2>No rulebooks yet</h2>
          <p className="lab-muted">
            Upload any rulebook JSON on the Train tab (or keep the bundled examples), then
            run <strong>Synthesize</strong>. Test chat switches to those trained books.
          </p>
          <button type="button" onClick={() => void reload()}>
            Refresh
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="lab-chat-wrap">
      <div className="lab-corpus-bar">
        <span className={`lab-tag ${source === 'trained' ? 'ok' : 'warn'}`}>
          {source === 'trained' ? 'Trained' : 'Unsynthesized'}
        </span>
        <span>
          {domains.length} corpora
          {generatedAt ? ` · ${new Date(generatedAt).toLocaleString()}` : ''}
        </span>
        <button type="button" className="lab-linkish" onClick={() => void reload()}>
          Reload
        </button>
      </div>
      <RulesChat
        key={domains.map((d) => d.id).join('|')}
        domains={domains}
        answer={answer}
        search={search}
        identity={labIdentity}
        statusMessage={statusMessage}
      />
    </div>
  );
}

function TrainPane() {
  const [status, setStatus] = useState<LabStatus | null>(null);
  const [samples, setSamples] = useState<SampleRow[]>([]);
  const [log, setLog] = useState('');
  const [actionLog, setActionLog] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [uploadText, setUploadText] = useState('');

  const refresh = useCallback(async () => {
    try {
      const s = await labFetch<LabStatus>('/api/lab/status');
      setStatus(s);
      if (s.files.eval?.exists) {
        const sampleRes = await labFetch<{ samples: SampleRow[] }>(
          '/api/lab/samples?limit=5'
        );
        setSamples(sampleRes.samples);
      } else {
        setSamples([]);
      }
      if (s.trainLogExists) {
        const logRes = await labFetch<{ log: string }>('/api/lab/train-log');
        setLog(logRes.log);
      }
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, 2500);
    return () => clearInterval(id);
  }, [refresh]);

  const run = async (path: string, label: string) => {
    setPending(label);
    setError(null);
    setActionLog(`Running ${label}…`);
    try {
      const result = await labFetch<{
        ok?: boolean;
        stdout?: string;
        stderr?: string;
        metrics?: LabMetrics;
        message?: string;
      }>(path, { method: 'POST', body: '{}' });
      setActionLog(
        [result.message, result.stdout, result.stderr].filter(Boolean).join('\n\n')
      );
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setPending(null);
    }
  };

  const uploadRulebook = async () => {
    setPending('Upload');
    setError(null);
    try {
      const body = JSON.parse(uploadText);
      const result = await labFetch<{ message?: string; id?: string }>(
        '/api/lab/rulebooks',
        { method: 'POST', body: JSON.stringify(body) }
      );
      setActionLog(result.message || `Saved ${result.id}`);
      setUploadText('');
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setPending(null);
    }
  };

  const removeCustom = async (id: string) => {
    setPending(`Remove ${id}`);
    try {
      await labFetch(`/api/lab/rulebooks/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setPending(null);
    }
  };

  const files = status?.files;
  const metrics = status?.metrics;
  const compare = status?.compare;
  const busy = status?.busy || pending;
  const trained = status?.trainedDomains ?? [];
  const available = status?.availableDomains ?? [];

  return (
    <div className="lab-train">
      <section className="lab-card">
        <h2>Corpora</h2>
        <p className="lab-muted">
          Test uses the <strong>trained</strong> snapshot from the last synthesize.
          Add rulebooks below, then synthesize to refresh that set.
        </p>
        <div className="lab-domain-cols">
          <div>
            <h3>Available (next synth)</h3>
            <ul className="lab-domain-list">
              {available.map((d) => (
                <li key={d.id}>
                  <span>
                    {d.label.short}{' '}
                    <span className="lab-muted">
                      {d.docCount} docs · {d.origin}
                    </span>
                  </span>
                  {d.origin === 'custom' && (
                    <button
                      type="button"
                      className="lab-linkish"
                      disabled={!!busy}
                      onClick={() => void removeCustom(d.id)}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Trained (Test chat)</h3>
            {trained.length === 0 ? (
              <p className="lab-muted">None yet — run Synthesize.</p>
            ) : (
              <ul className="lab-domain-list">
                {trained.map((d) => (
                  <li key={d.id}>
                    <span>
                      {d.label.short}{' '}
                      <span className="lab-muted">{d.docCount} docs</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="lab-card">
        <h2>Import rulebook</h2>
        <p className="lab-muted">
          JSON with <code>id</code>, <code>label</code>, and <code>docs[]</code> or{' '}
          <code>entries[]</code> (<code>title</code>/<code>number</code>, <code>text</code>).
        </p>
        <textarea
          className="lab-textarea"
          rows={8}
          value={uploadText}
          onChange={(e) => setUploadText(e.target.value)}
          placeholder={`{\n  "id": "pickleball",\n  "label": "USA Pickleball",\n  "docs": [\n    { "kind": "entry", "number": "NVZ", "title": "Non-Volley Zone", "text": "..." }\n  ]\n}`}
        />
        <div className="lab-actions">
          <button
            type="button"
            disabled={!!busy || !uploadText.trim()}
            onClick={() => void uploadRulebook()}
          >
            Import
          </button>
        </div>
      </section>

      <section className="lab-card">
        <h2>Pipeline</h2>
        <p className="lab-muted">
          Synthesize freezes the eval set. Eval = TF baseline. Compare = automated
          before (TF) vs after (hybrid) on that frozen set (
          <code>train:compare</code>).
        </p>
        <div className="lab-actions">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void run('/api/lab/synth', 'Synthesize')}
          >
            Synthesize
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void run('/api/lab/eval', 'Eval')}
          >
            Synthesize + eval
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void run('/api/lab/compare', 'Compare')}
          >
            Before / after compare
          </button>
          <button type="button" disabled={!!busy} onClick={() => void refresh()}>
            Refresh status
          </button>
        </div>
        {busy && <p className="lab-busy">Busy: {busy}</p>}
        {error && <p className="lab-error">{error}</p>}
        {actionLog && <pre className="lab-log">{actionLog}</pre>}
      </section>

      <section className="lab-card">
        <h2>Files</h2>
        <table className="lab-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Lines</th>
              <th>Size</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['qa.jsonl', files?.qa],
                ['pairs.jsonl', files?.pairs],
                ['eval.jsonl', files?.eval],
                ['corpora-manifest.json', files?.manifest],
                ['eval-metrics.json', files?.metrics],
                ['compare-metrics.json', files?.compare],
              ] as const
            ).map(([name, info]) => (
              <tr key={name}>
                <td>
                  <code>{name}</code>
                </td>
                <td>{info?.exists ? info.lines || '—' : 'missing'}</td>
                <td>{info?.exists ? formatBytes(info.bytes) : '—'}</td>
                <td>{info?.mtime ? new Date(info.mtime).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="lab-card">
        <h2>TF baseline</h2>
        {metrics ? (
          <div className="lab-metrics">
            <div>
              <span>Rows</span>
              <strong>{metrics.evalRows}</strong>
            </div>
            <div>
              <span>Recall@1</span>
              <strong>{pct(metrics.recallAt1)}</strong>
            </div>
            <div>
              <span>Recall@3</span>
              <strong>{pct(metrics.recallAt3)}</strong>
            </div>
            <div>
              <span>Recall@6</span>
              <strong>{pct(metrics.recallAt6)}</strong>
            </div>
            <div>
              <span>Groundedness</span>
              <strong>{pct(metrics.groundedness)}</strong>
            </div>
          </div>
        ) : (
          <p className="lab-muted">No metrics yet — run Synthesize + eval.</p>
        )}
      </section>

      <section className="lab-card">
        <h2>Before / after</h2>
        <p className="lab-muted">
          TF-only vs hybrid retrieval on the frozen eval set. Extractive groundedness
          scores the top hit as the answer (offline fallback path).
        </p>
        {compare ? (
          <>
            <table className="lab-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Before (TF)</th>
                  <th>After (hybrid)</th>
                  <th>Δ</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Recall@1', 'recallAt1'],
                    ['Recall@3', 'recallAt3'],
                    ['Recall@6', 'recallAt6'],
                    ['Extractive groundedness', 'extractiveGroundedness'],
                  ] as const
                ).map(([label, key]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>{pct(compare.before[key])}</td>
                    <td>{pct(compare.after[key])}</td>
                    <td>{signedPp(compare.delta[key])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="lab-muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
              {compare.evalRows} rows
              {compare.hybridEnabled ? '' : ' · hybrid skipped (TF-only both sides)'}
              {compare.generatedAt
                ? ` · ${new Date(compare.generatedAt).toLocaleString()}`
                : ''}
            </p>
          </>
        ) : (
          <p className="lab-muted">No compare report yet — run Before / after compare.</p>
        )}
      </section>

      <section className="lab-card">
        <h2>Held-out samples</h2>
        {samples.length === 0 ? (
          <p className="lab-muted">Run synthesize to preview evaluation questions.</p>
        ) : (
          <ul className="lab-samples">
            {samples.map((s) => (
              <li key={`${s.domainId}-${s.question}`}>
                <div className="lab-sample-meta">
                  <span className="lab-tag">{s.domainId}</span>
                  <span className="lab-muted">{s.relevant_ids.join(', ')}</span>
                </div>
                <strong>{s.question}</strong>
                <p>
                  {s.answer.slice(0, 220)}
                  {s.answer.length > 220 ? '…' : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="lab-card">
        <h2>Fine-tune</h2>
        <p className="lab-muted">
          Optional. Requires <code>python3</code> and deps listed in{' '}
          <code>training/README.md</code>. Output streams below.
        </p>
        <div className="lab-actions">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void run('/api/lab/train-embed', 'Train embed')}
          >
            Embedder
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void run('/api/lab/train-sft', 'Train SFT')}
          >
            Generator (SFT)
          </button>
        </div>
        <pre className="lab-log lab-log-tall">{log || 'No fine-tune log yet.'}</pre>
      </section>
    </div>
  );
}

export function App() {
  const [tab, setTab] = useState<Tab>('test');
  const [statusMessage, setStatusMessage] = useState<string | null>(
    'Loading trained corpora…'
  );

  // Warm models once on lab open — first download is large; then browser cache.
  useEffect(() => {
    let cancelled = false;
    setStatusMessage('Preloading models (one-time download, then browser cache)…');
    void preloadBrowserModels({
      onProgress: (p) => {
        if (cancelled) return;
        if (p.status === 'ready' || p.status === 'done' || p.status === 'error') {
          setStatusMessage(p.message);
          return;
        }
        const pctNum =
          typeof p.progress === 'number' ? ` ${Math.round(p.progress * 100)}%` : '';
        setStatusMessage(`${p.message}${pctNum}`);
      },
    }).catch((err) => {
      if (!cancelled) setStatusMessage(`Model preload failed: ${String(err)}`);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="demo-shell">
      <header className="demo-header">
        <h1>Rules Engine Lab</h1>
        <p>
          Train on any rulebook corpus, then evaluate retrieval and chat against the
          synthesized set.
        </p>
        <div className="lab-tabs" role="tablist" aria-label="Lab sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'test'}
            className={tab === 'test' ? 'active' : ''}
            onClick={() => setTab('test')}
          >
            Test
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'train'}
            className={tab === 'train' ? 'active' : ''}
            onClick={() => setTab('train')}
          >
            Train
          </button>
        </div>
      </header>
      <main className="demo-main">
        {tab === 'test' ? (
          <ChatPane statusMessage={statusMessage} setStatusMessage={setStatusMessage} />
        ) : (
          <TrainPane />
        )}
      </main>
      {labIdentity.showCredit && labIdentity.name && (
        <footer className="lab-credit">
          {labIdentity.name}
          {labIdentity.year != null ? ` · ${labIdentity.year}` : ''}
        </footer>
      )}
    </div>
  );
}
