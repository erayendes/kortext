/**
 * Kortext › LLM models (engine scope) — GET/PUT /api/llm-models.
 *
 * Replaces the old "LLM Auth" pane and merges it with a hand-maintained model
 * catalogue. One card per provider (claude / codex / antigravity):
 *   · auth method  — CLI vs API key (per provider, persisted)
 *   · models       — the model names the user types in (the source of truth)
 *
 * These models flow into the Agents pane, where each persona is assigned one.
 * No secrets live here: API keys are entered in Environments; this only records
 * the chosen method + the expected env-var hint.
 */
import { useCallback, useEffect, useState } from 'react';
import { Plus, X, Check } from 'lucide-react';
import { apiGet, apiPut } from '../../lib/api.ts';
import { SettingsPane } from '../../components/v6/SettingsPane.tsx';

type AuthMethod = 'cli' | 'apikey';
type ProviderConfig = { authMethod: AuthMethod; models: string[] };
type KeyInfo = { env: string; masked: string | null };
type LlmConfig = {
  providers: Record<string, ProviderConfig>;
  assignments: Record<string, string>;
  keys: Record<string, KeyInfo>;
};

const PROVIDERS: { id: string; label: string; envVar: string }[] = [
  { id: 'claude', label: 'Claude', envVar: 'ANTHROPIC_API_KEY' },
  { id: 'codex', label: 'Codex', envVar: 'OPENAI_API_KEY' },
  { id: 'antigravity', label: 'Antigravity', envVar: 'ANTIGRAVITY_API_KEY' },
];

export function LlmModelsRoute() {
  const [cfg, setCfg] = useState<LlmConfig | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [keyEditing, setKeyEditing] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');

  const load = useCallback(() => {
    apiGet<LlmConfig>('/api/llm-models')
      .then(setCfg)
      .catch(() => setCfg(null));
  }, []);

  useEffect(() => load(), [load]);

  const save = useCallback(
    async (id: string, patch: Partial<ProviderConfig>) => {
      setBusy(id);
      try {
        await apiPut(`/api/llm-models/provider/${id}`, patch);
        load();
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  function addModel(id: string, current: string[]) {
    const m = draft.trim();
    if (!m) return;
    setAddingFor(null);
    setDraft('');
    void save(id, { models: [...current, m] });
  }

  function removeModel(id: string, current: string[], m: string) {
    if (!window.confirm(`Remove model "${m}" from ${id}?`)) return;
    void save(id, { models: current.filter((x) => x !== m) });
  }

  const saveKey = useCallback(
    async (id: string, key: string | null) => {
      setBusy(id);
      try {
        await apiPut(`/api/llm-models/provider/${id}/key`, { key });
        setKeyEditing(null);
        setKeyDraft('');
        load();
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  return (
    <SettingsPane title="LLM models" subtitle="Add the models for each LLM and pick how it authenticates" wide>
      {(cfg ? PROVIDERS : []).map((p) => {
        const conf = cfg!.providers[p.id] ?? { authMethod: 'cli' as AuthMethod, models: [] };
        const keyInfo = cfg!.keys?.[p.id];
        return (
          <div className="intg-card" style={{ marginBottom: 12 }} key={p.id}>
            <div className="intg-head">
              <span className="intg-name">{p.label}</span>
              <span style={{ flex: 1 }} />
              <div className="dt-tabs llm-seg" style={{ marginBottom: 0 }}>
                <button
                  className={`dt-tab${conf.authMethod === 'cli' ? ' on' : ''}`}
                  disabled={busy === p.id}
                  onClick={() => save(p.id, { authMethod: 'cli' })}
                >
                  CLI
                </button>
                <button
                  className={`dt-tab${conf.authMethod === 'apikey' ? ' on' : ''}`}
                  disabled={busy === p.id}
                  onClick={() => save(p.id, { authMethod: 'apikey' })}
                >
                  API key
                </button>
              </div>
            </div>

            {conf.authMethod === 'apikey' && (
              <div className="intg-row" style={{ marginBottom: 10 }}>
                <span className="k">
                  API key <span className="mono faint" style={{ fontSize: 11 }}>{p.envVar}</span>
                </span>
                {keyEditing === p.id ? (
                  <span className="intg-connect" style={{ marginTop: 0, flex: 1 }}>
                    <input
                      className="intg-input"
                      type="text"
                      autoFocus
                      value={keyDraft}
                      placeholder={`Paste ${p.label} API key`}
                      onChange={(e) => setKeyDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveKey(p.id, keyDraft);
                        if (e.key === 'Escape') setKeyEditing(null);
                      }}
                    />
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={busy === p.id || !keyDraft.trim()}
                      onClick={() => void saveKey(p.id, keyDraft)}
                    >
                      <Check style={{ width: 13, height: 13 }} />
                    </button>
                    <button className="btn btn-sm btn-secondary btn-icon" onClick={() => setKeyEditing(null)} aria-label="Cancel">
                      <X style={{ width: 13, height: 13 }} />
                    </button>
                  </span>
                ) : (
                  <>
                    <span className="v mono">{keyInfo?.masked ?? 'not set'}</span>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={busy === p.id}
                      onClick={() => {
                        setKeyDraft('');
                        setKeyEditing(p.id);
                      }}
                    >
                      {keyInfo?.masked ? 'Replace' : 'Add key'}
                    </button>
                    {keyInfo?.masked && (
                      <button className="btn btn-secondary btn-sm" disabled={busy === p.id} onClick={() => void saveKey(p.id, null)}>
                        Clear
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="llm-models-row">
              {conf.models.map((m) => (
                <span className="llm-model" key={m}>
                  {m}
                  <button
                    aria-label={`Remove ${m}`}
                    disabled={busy === p.id}
                    onClick={() => removeModel(p.id, conf.models, m)}
                  >
                    <X style={{ width: 12, height: 12 }} />
                  </button>
                </span>
              ))}

              {addingFor === p.id ? (
                <span className="intg-connect" style={{ marginTop: 0, gap: 6 }}>
                  <input
                    className="intg-input"
                    style={{ width: 200 }}
                    autoFocus
                    value={draft}
                    placeholder="model name / id"
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addModel(p.id, conf.models);
                      if (e.key === 'Escape') setAddingFor(null);
                    }}
                  />
                  <button className="btn btn-sm btn-primary" disabled={!draft.trim()} onClick={() => addModel(p.id, conf.models)}>
                    <Check style={{ width: 13, height: 13 }} />
                  </button>
                  <button className="btn btn-sm btn-secondary btn-icon" onClick={() => setAddingFor(null)} aria-label="Cancel">
                    <X style={{ width: 13, height: 13 }} />
                  </button>
                </span>
              ) : (
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={busy === p.id}
                  onClick={() => {
                    setDraft('');
                    setAddingFor(p.id);
                  }}
                >
                  <Plus style={{ width: 13, height: 13 }} />
                  Add model
                </button>
              )}
              {conf.models.length === 0 && addingFor !== p.id && (
                <span className="llm-none">No models yet</span>
              )}
            </div>
          </div>
        );
      })}
      {!cfg && <div className="llm-none" style={{ padding: '8px 2px' }}>Loading…</div>}
    </SettingsPane>
  );
}
