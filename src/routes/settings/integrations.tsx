/**
 * Integrations (settings) — GET /api/integrations, PUT/DELETE /api/integrations/:id.
 *
 * Store-only catalogue (decided set: GitHub · Stripe · Vercel · Firebase · Sentry):
 * each service stores a masked access token — no real OAuth, no outbound calls.
 * GitHub additionally carries config (repo · branch · auto-commit · PR-approval)
 * persisted via PUT `{ config }`. Connecting is an inline token form (no prompts).
 */
import { useCallback, useEffect, useState } from 'react';
import { GitMerge, Triangle, CreditCard, Flame, Radio, Database, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiGet, apiPut, apiDelete } from '../../lib/api.ts';
import { Switch } from '../../components/v6/SettingsPane.tsx';

type GithubConfig = { repo: string; branch: string; autoCommit: boolean; prApproval: boolean };
type Integration = {
  id: string;
  label: string;
  connected: boolean;
  tokenMasked: string | null;
  config?: GithubConfig;
};
type IntegrationsResponse = { integrations: Integration[] };

const ICONS: Record<string, LucideIcon> = {
  github: GitMerge,
  stripe: CreditCard,
  vercel: Triangle,
  firebase: Flame,
  supabase: Database,
  sentry: Radio,
};

function IntgIcon({ id }: { id: string }) {
  const Icon = ICONS[id] ?? GitMerge;
  return (
    <span className="intg-ico">
      <Icon />
    </span>
  );
}

export function IntegrationsRoute() {
  const [items, setItems] = useState<Integration[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [tokenDraft, setTokenDraft] = useState('');

  const load = useCallback(() => {
    apiGet<IntegrationsResponse>('/api/integrations')
      .then((r) => setItems(r.integrations))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => load(), [load]);

  function beginConnect(id: string) {
    setConnectingId(id);
    setTokenDraft('');
  }

  async function saveToken(it: Integration) {
    const token = tokenDraft.trim();
    if (!token) return;
    setBusy(it.id);
    try {
      await apiPut(`/api/integrations/${it.id}`, { token });
      setConnectingId(null);
      setTokenDraft('');
      load();
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(it: Integration) {
    setBusy(it.id);
    try {
      await apiDelete(`/api/integrations/${it.id}`);
      load();
    } finally {
      setBusy(null);
    }
  }

  async function saveConfig(it: Integration, patch: Partial<GithubConfig>) {
    setBusy(it.id);
    try {
      await apiPut(`/api/integrations/${it.id}`, { config: patch });
      load();
    } finally {
      setBusy(null);
    }
  }

  const connected = items.filter((i) => i.connected);
  const available = items.filter((i) => !i.connected);

  return (
    <div className="set-wrap">
      <div className="set-inner full">
        <div className="set-title">Integrations</div>
        <div className="set-sub">Connect services to this project · tokens stored masked, never sent anywhere</div>

        {connected.map((it) =>
          it.id === 'github' && it.config ? (
            <GithubCard key={it.id} it={it} busy={busy === it.id} onDisconnect={() => disconnect(it)} onSaveConfig={(p) => saveConfig(it, p)} />
          ) : (
            <div className="intg-card" style={{ marginBottom: 12 }} key={it.id}>
              <div className="intg-head">
                <IntgIcon id={it.id} />
                <span className="intg-name">{it.label}</span>
                <span className="badge-ok">
                  <span className="d" />
                  Connected
                </span>
              </div>
              <div className="intg-rows">
                <div className="intg-row">
                  <span className="k">Access token</span>
                  <span className="v mono">{it.tokenMasked ?? '••••••'}</span>
                  <button className="btn btn-secondary btn-sm" disabled={busy === it.id} onClick={() => disconnect(it)}>
                    Disconnect
                  </button>
                </div>
              </div>
            </div>
          ),
        )}

        <div className="intg-grid">
          {available.map((it) => (
            <div className="intg-card" key={it.id}>
              <div className="intg-head">
                <IntgIcon id={it.id} />
                <span className="intg-name">{it.label}</span>
                {connectingId !== it.id && (
                  <button className="btn btn-secondary btn-sm" disabled={busy === it.id} onClick={() => beginConnect(it.id)}>
                    Connect
                  </button>
                )}
              </div>
              {connectingId === it.id ? (
                <div className="intg-connect">
                  <input
                    className="intg-input"
                    type="password"
                    autoFocus
                    value={tokenDraft}
                    placeholder={`Paste your ${it.label} access token`}
                    onChange={(e) => setTokenDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveToken(it);
                      if (e.key === 'Escape') setConnectingId(null);
                    }}
                  />
                  <button className="btn btn-sm btn-primary" disabled={busy === it.id || !tokenDraft.trim()} onClick={() => void saveToken(it)}>
                    Save
                  </button>
                  <button className="btn btn-sm btn-secondary btn-icon" onClick={() => setConnectingId(null)} aria-label="Cancel">
                    <X style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              ) : (
                <div className="intg-desc">Store an access token to enable {it.label}.</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Connected GitHub card — masked token + the repo/branch/auto-commit/PR-approval config. */
function GithubCard({
  it,
  busy,
  onDisconnect,
  onSaveConfig,
}: {
  it: Integration;
  busy: boolean;
  onDisconnect: () => void;
  onSaveConfig: (patch: Partial<GithubConfig>) => void;
}) {
  const [cfg, setCfg] = useState<GithubConfig>(it.config!);
  // Re-sync local draft whenever a reload brings fresh server config.
  useEffect(() => setCfg(it.config!), [it.config]);

  const saveText = (key: 'repo' | 'branch') => {
    if (cfg[key] !== it.config?.[key]) onSaveConfig({ [key]: cfg[key] } as Partial<GithubConfig>);
  };
  const toggle = (key: 'autoCommit' | 'prApproval') => {
    const next = !cfg[key];
    setCfg((c) => ({ ...c, [key]: next }));
    onSaveConfig({ [key]: next } as Partial<GithubConfig>);
  };

  return (
    <div className="intg-card" style={{ marginBottom: 12 }}>
      <div className="intg-head">
        <IntgIcon id="github" />
        <span className="intg-name">GitHub</span>
        <span className="badge-ok">
          <span className="d" />
          Connected
        </span>
      </div>
      <div className="intg-rows">
        <div className="intg-row">
          <span className="k">Access token</span>
          <span className="v mono">{it.tokenMasked ?? '••••••'}</span>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
        <div className="intg-row">
          <span className="k">Repository</span>
          <input
            className="intg-input"
            value={cfg.repo}
            placeholder="owner/repo"
            onChange={(e) => setCfg((c) => ({ ...c, repo: e.target.value }))}
            onBlur={() => saveText('repo')}
          />
        </div>
        <div className="intg-row">
          <span className="k">Default branch</span>
          <input
            className="intg-input"
            value={cfg.branch}
            placeholder="main"
            onChange={(e) => setCfg((c) => ({ ...c, branch: e.target.value }))}
            onBlur={() => saveText('branch')}
          />
        </div>
      </div>
      <div className="intg-toggle">
        <span className="k">Auto-commit agent work</span>
        <Switch on={cfg.autoCommit} onToggle={() => toggle('autoCommit')} />
      </div>
      <div className="intg-toggle">
        <span className="k">Require PR approval before merge</span>
        <Switch on={cfg.prApproval} onToggle={() => toggle('prApproval')} />
      </div>
    </div>
  );
}
