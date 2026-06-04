/**
 * Environments (settings) — GET /api/env, PUT/DELETE /api/env/:key.
 *
 * Maps to the `environments` route in wireframe-v6-hifi.html. The backend
 * stores a single `.env` set per project and only ever returns the *masked*
 * value (presence, never the secret). The wireframe's dev/staging/production
 * matrix is aspirational — the engine doesn't split envs yet, so we render the
 * real single-value table and surface the three-env split as a TODO note.
 */
import { useCallback, useEffect, useState } from 'react';
import { Lock, Globe, Plus, Shield, X } from 'lucide-react';
import { apiGet, apiPut, apiDelete } from '../../lib/api.ts';

type EnvVar = { key: string; valueMasked: string };
type EnvResponse = { vars: EnvVar[] };

const PUBLIC_RE = /(^NEXT_PUBLIC_|^VITE_|PUBLIC)/;

export function EnvironmentsRoute() {
  const [vars, setVars] = useState<EnvVar[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiGet<EnvResponse>('/api/env')
      .then((r) => setVars(r.vars))
      .catch(() => setVars([]));
  }, []);

  useEffect(() => load(), [load]);

  async function addVar() {
    const key = window.prompt('Variable name (e.g. DATABASE_URL)');
    if (!key || !key.trim()) return;
    const value = window.prompt(`Value for ${key.trim()}`);
    if (value === null) return;
    setBusy(true);
    try {
      await apiPut(`/api/env/${encodeURIComponent(key.trim())}`, { value });
      load();
    } catch {
      window.alert(`Could not save ${key.trim()} (invalid key or reserved name).`);
    } finally {
      setBusy(false);
    }
  }

  async function removeVar(key: string) {
    if (!window.confirm(`Remove ${key}?`)) return;
    setBusy(true);
    try {
      await apiDelete(`/api/env/${encodeURIComponent(key)}`);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="set-wrap">
      <div className="set-inner wide">
        <div className="set-title">Environments</div>
        <div className="set-sub">
          Variables for this project · <span style={{ color: 'var(--fg-mid)' }}>secrets masked</span>
        </div>

        <div className="env-head">
          <span className="env-tag">
            <span className="d" style={{ background: 'var(--green)' }} />
            {vars.length} variable{vars.length === 1 ? '' : 's'}
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-line btn-sm" disabled={busy} onClick={addVar}>
            <Plus style={{ width: 13, height: 13 }} />
            Add variable
          </button>
        </div>

        <div className="set-card" style={{ marginBottom: 10 }}>
          <table className="env-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
                <th style={{ width: 44 }} />
              </tr>
            </thead>
            <tbody>
              {vars.map((v) => {
                const PublicIcon = PUBLIC_RE.test(v.key) ? Globe : Lock;
                return (
                  <tr key={v.key}>
                    <td>
                      <span className="env-key">
                        <PublicIcon />
                        {v.key}
                      </span>
                    </td>
                    <td>
                      <span className="env-mask">{v.valueMasked}</span>
                    </td>
                    <td>
                      <button
                        className="btn btn-line btn-sm"
                        title={`Remove ${v.key}`}
                        disabled={busy}
                        onClick={() => removeVar(v.key)}
                        style={{ padding: '0 8px' }}
                      >
                        <X style={{ width: 13, height: 13 }} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {vars.length === 0 && (
                <tr>
                  <td colSpan={3} className="env-none" style={{ padding: '16px 15px' }}>
                    No variables set
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="set-note" style={{ paddingLeft: 2 }}>
          <Shield style={{ width: 12, height: 12, display: 'inline', verticalAlign: -1, marginRight: 4 }} />
          Secret values live in <span className="mono">.env</span> — the dashboard only shows presence,
          never the value.
          {/* TODO: per-environment split (dev / staging / production) is not in
              the backend yet — a single .env set is stored per project. */}
        </div>
      </div>
    </div>
  );
}
