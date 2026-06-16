/**
 * Environments (settings) — GET/PUT/DELETE /api/env/:env[/:key].
 *
 * Maps to the `environments` route in wireframe-v6-hifi.html. Variables are split
 * across three deployment environments (dev / staging / production), each stored
 * in its own `.kortext/env/<env>.env` file. Integration tokens live elsewhere.
 *
 * Public vs secret is derived from the key name (PUBLIC_RE): public identifiers
 * (domain, app id, public keys) show their real value; everything else is a
 * secret and the dashboard only ever sees the masked form.
 *
 * The "All" tab renders a Vercel-style matrix (key × environment) so every
 * variable's value across all three environments is visible at a glance.
 */
import { useCallback, useEffect, useState } from 'react';
import { EyeOff, Eye, Plus, Shield, X, Check } from 'lucide-react';
import { apiGet, apiPut, apiDelete } from '../../lib/api.ts';

type EnvVar = { key: string; isPublic: boolean; valueMasked: string; value: string | null };
type EnvResponse = { env: string; vars: EnvVar[] };

/** Mirrors PUBLIC_RE in server/routes/env-vars.ts — keep in sync. */
const PUBLIC_RE = /(^NEXT_PUBLIC_|^VITE_|PUBLIC)/;

const ENVS = [
  { id: 'dev', label: 'Development' },
  { id: 'staging', label: 'Staging' },
  { id: 'production', label: 'Production' },
] as const;
type EnvId = (typeof ENVS)[number]['id'];
type TabId = EnvId | 'all';

const TABS: { id: TabId; label: string }[] = [{ id: 'all', label: 'All' }, ...ENVS];

type ByEnv = Record<EnvId, EnvVar[]>;
const EMPTY: ByEnv = { dev: [], staging: [], production: [] };

/** Render one variable's value cell — plain for public, masked for secret. */
function ValueCell({ v }: { v: EnvVar }) {
  return v.isPublic ? <span className="env-val">{v.value}</span> : <span className="env-mask">{v.valueMasked}</span>;
}

export function EnvironmentsRoute() {
  const [tab, setTab] = useState<TabId>('all');
  const [byEnv, setByEnv] = useState<ByEnv>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [valDraft, setValDraft] = useState('');
  // Which environments the new variable gets written to (Vercel-style multi-select).
  const [targets, setTargets] = useState<EnvId[]>(['dev']);

  const load = useCallback(() => {
    Promise.all(
      ENVS.map((e) =>
        apiGet<EnvResponse>(`/api/env/${e.id}`).catch(() => ({ env: e.id, vars: [] as EnvVar[] })),
      ),
    )
      .then((rs) => {
        const next: ByEnv = { dev: [], staging: [], production: [] };
        ENVS.forEach((e, i) => {
          next[e.id] = rs[i]?.vars ?? [];
        });
        setByEnv(next);
      })
      .catch(() => setByEnv(EMPTY));
  }, []);

  useEffect(() => load(), [load]);

  // Default the add-form targets to the current tab (all three when on "All").
  function beginAdd() {
    setKeyDraft('');
    setValDraft('');
    setTargets(tab === 'all' ? ENVS.map((e) => e.id) : [tab]);
    setAdding(true);
  }

  function toggleTarget(id: EnvId) {
    setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  }

  async function saveVar() {
    const key = keyDraft.trim();
    if (!key || targets.length === 0) return;
    setBusy(true);
    try {
      // Write the same key/value to every selected environment.
      await Promise.all(
        targets.map((t) => apiPut(`/api/env/${t}/${encodeURIComponent(key)}`, { value: valDraft })),
      );
      setAdding(false);
      setKeyDraft('');
      setValDraft('');
      load();
    } catch {
      window.alert(`Could not save ${key} (invalid key or reserved name).`);
    } finally {
      setBusy(false);
    }
  }

  // Single-env delete; in the "All" view the key is dropped from every env it lives in.
  async function removeVar(key: string, envs: EnvId[]) {
    const scope = envs.length === 1 ? envs[0] : 'all environments';
    if (!window.confirm(`Remove ${key} from ${scope}?`)) return;
    setBusy(true);
    try {
      await Promise.all(envs.map((e) => apiDelete(`/api/env/${e}/${encodeURIComponent(key)}`)));
      load();
    } finally {
      setBusy(false);
    }
  }

  // Live preview of how the typed key will be classified.
  const draftPublic = PUBLIC_RE.test(keyDraft.trim());

  // Distinct keys across all environments (for the "All" matrix + count).
  const allKeys = [...new Set(ENVS.flatMap((e) => byEnv[e.id].map((v) => v.key)))].sort((a, b) =>
    a.localeCompare(b),
  );
  const lookup = (envId: EnvId, key: string) => byEnv[envId].find((v) => v.key === key);
  const count = tab === 'all' ? allKeys.length : byEnv[tab].length;

  return (
    <div className="set-wrap">
      <div className="set-inner full">
        <div className="set-title">Environments</div>
        <div className="set-sub">
          Variables per deployment environment ·{' '}
          <span style={{ color: 'var(--fg-mid)' }}>secrets masked, public values shown</span>
        </div>

        <div className="dt-tabs" style={{ marginTop: 18 }}>
          {TABS.map((t) => (
            <button key={t.id} className={`dt-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="env-head">
          <span className="env-tag">
            <span className="d" style={{ background: 'var(--green)' }} />
            {count} variable{count === 1 ? '' : 's'}
            {tab === 'all' && <span style={{ color: 'var(--fg-faint)' }}> · across 3 environments</span>}
          </span>
          <span style={{ flex: 1 }} />
          {!adding && (
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={beginAdd}>
              <Plus style={{ width: 13, height: 13 }} />
              Add variable
            </button>
          )}
        </div>

        {adding && (
          <div className="set-card" style={{ marginBottom: 10, padding: '12px 15px' }}>
            <div className="intg-connect" style={{ marginTop: 0 }}>
              <input
                className="intg-input"
                style={{ flex: '0 0 38%' }}
                autoFocus
                value={keyDraft}
                placeholder="KEY  (e.g. NEXT_PUBLIC_SITE_URL)"
                onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveVar();
                  if (e.key === 'Escape') setAdding(false);
                }}
              />
              <input
                className="intg-input"
                value={valDraft}
                placeholder="value"
                onChange={(e) => setValDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveVar();
                  if (e.key === 'Escape') setAdding(false);
                }}
              />
              <button
                className="btn btn-sm btn-primary"
                disabled={busy || !keyDraft.trim() || targets.length === 0}
                onClick={() => void saveVar()}
              >
                <Check style={{ width: 13, height: 13 }} />
                Save
              </button>
              <button className="btn btn-sm btn-secondary btn-icon" onClick={() => setAdding(false)} aria-label="Cancel">
                <X style={{ width: 13, height: 13 }} />
              </button>
            </div>

            <div className="env-picks">
              <span className="env-picks-label">Apply to</span>
              {ENVS.map((e) => {
                const on = targets.includes(e.id);
                return (
                  <button key={e.id} className={`env-pick${on ? ' on' : ''}`} onClick={() => toggleTarget(e.id)}>
                    {on ? <Check /> : <span className="env-pick-box" />}
                    {e.label}
                  </button>
                );
              })}
            </div>
            {keyDraft.trim() && (
              <div className="set-note" style={{ padding: '8px 2px 0' }}>
                {draftPublic ? (
                  <>
                    <Eye style={{ width: 12, height: 12, display: 'inline', verticalAlign: -1, marginRight: 4 }} />
                    Public — value is shown in plain (domain, app id, public key).
                  </>
                ) : (
                  <>
                    <EyeOff style={{ width: 12, height: 12, display: 'inline', verticalAlign: -1, marginRight: 4 }} />
                    Secret — value is masked everywhere.
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <div className="set-card" style={{ marginBottom: 10 }}>
          {tab === 'all' ? (
            <table className="env-table">
              <thead>
                <tr>
                  <th>Key</th>
                  {ENVS.map((e) => (
                    <th key={e.id}>{e.label}</th>
                  ))}
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {allKeys.map((key) => {
                  const present = ENVS.filter((e) => lookup(e.id, key)).map((e) => e.id);
                  const sample = lookup(present[0]!, key)!;
                  return (
                    <tr key={key}>
                      <td>
                        <span className="env-key">
                          {sample.isPublic ? <Eye /> : <EyeOff />}
                          {key}
                        </span>
                      </td>
                      {ENVS.map((e) => {
                        const v = lookup(e.id, key);
                        return <td key={e.id}>{v ? <ValueCell v={v} /> : <span className="env-dash">—</span>}</td>;
                      })}
                      <td>
                        <button
                          className="btn btn-secondary btn-sm"
                          title={`Remove ${key} from all environments`}
                          disabled={busy}
                          onClick={() => removeVar(key, present)}
                          style={{ padding: '0 8px' }}
                        >
                          <X style={{ width: 13, height: 13 }} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {allKeys.length === 0 && (
                  <tr>
                    <td colSpan={ENVS.length + 2} className="env-none" style={{ padding: '16px 15px' }}>
                      No variables in any environment
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="env-table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Value</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {byEnv[tab].map((v) => (
                  <tr key={v.key}>
                    <td>
                      <span className="env-key">
                        {v.isPublic ? <Eye /> : <EyeOff />}
                        {v.key}
                      </span>
                    </td>
                    <td>
                      <ValueCell v={v} />
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        title={`Remove ${v.key}`}
                        disabled={busy}
                        onClick={() => removeVar(v.key, [tab])}
                        style={{ padding: '0 8px' }}
                      >
                        <X style={{ width: 13, height: 13 }} />
                      </button>
                    </td>
                  </tr>
                ))}
                {byEnv[tab].length === 0 && (
                  <tr>
                    <td colSpan={3} className="env-none" style={{ padding: '16px 15px' }}>
                      No variables in {TABS.find((t) => t.id === tab)!.label}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        <div className="set-note" style={{ paddingLeft: 2 }}>
          <Shield style={{ width: 12, height: 12, display: 'inline', verticalAlign: -1, marginRight: 4 }} />
          Secret values live in <span className="mono">.kortext/env/&lt;env&gt;.env</span> — the dashboard shows
          presence only. Public keys (<span className="mono">NEXT_PUBLIC_*</span>, <span className="mono">VITE_*</span>,{' '}
          <span className="mono">*PUBLIC*</span>) show their real value.
        </div>
      </div>
    </div>
  );
}
