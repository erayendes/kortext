/**
 * Integrations (settings) — GET /api/integrations, PUT/DELETE /api/integrations/:id.
 *
 * Maps to the `integrations` route in wireframe-v6-hifi.html. The backend is a
 * store-only catalogue: each known service has a `connected` flag + a masked
 * token (no real OAuth, no service-specific config). Connected services render
 * as full cards with a masked token + Disconnect; the rest sit in the
 * connect-grid. The per-service automation toggles in the wireframe (auto-commit,
 * deploy-on-merge…) have no backing endpoint yet and are omitted (TODO).
 */
import { useCallback, useEffect, useState } from 'react';
import { GitBranch, Triangle, CreditCard, Shield, Hash, Send, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiGet, apiPut, apiDelete } from '../../lib/api.ts';

type Integration = {
  id: string;
  label: string;
  connected: boolean;
  tokenMasked: string | null;
};
type IntegrationsResponse = { integrations: Integration[] };

const ICONS: Record<string, LucideIcon> = {
  github: GitBranch,
  vercel: Triangle,
  stripe: CreditCard,
  auth0: Shield,
  slack: Hash,
  telegram: Send,
};

function IntgIcon({ id }: { id: string }) {
  const Icon = ICONS[id] ?? Plus;
  return (
    <span className="intg-ico">
      <Icon />
    </span>
  );
}

export function IntegrationsRoute() {
  const [items, setItems] = useState<Integration[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet<IntegrationsResponse>('/api/integrations')
      .then((r) => setItems(r.integrations))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => load(), [load]);

  async function connect(it: Integration) {
    const token = window.prompt(`Paste the ${it.label} access token`);
    if (!token || !token.trim()) return;
    setBusy(it.id);
    try {
      await apiPut(`/api/integrations/${it.id}`, { token: token.trim() });
      load();
    } catch {
      window.alert(`Could not connect ${it.label}.`);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(it: Integration) {
    if (!window.confirm(`Disconnect ${it.label}? The stored token will be removed.`)) return;
    setBusy(it.id);
    try {
      await apiDelete(`/api/integrations/${it.id}`);
      load();
    } finally {
      setBusy(null);
    }
  }

  const connected = items.filter((i) => i.connected);
  const available = items.filter((i) => !i.connected);

  return (
    <div className="set-wrap">
      <div className="set-inner">
        <div className="set-title">Integrations</div>
        <div className="set-sub">Services connected to this project · tokens stored masked</div>

        {connected.map((it) => (
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
                <button
                  className="btn btn-line btn-sm"
                  disabled={busy === it.id}
                  onClick={() => disconnect(it)}
                >
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        ))}

        <div className="intg-grid">
          {available.map((it) => (
            <div className="intg-card" key={it.id}>
              <div className="intg-head">
                <IntgIcon id={it.id} />
                <span className="intg-name">{it.label}</span>
                <button
                  className="btn btn-line btn-sm"
                  disabled={busy === it.id}
                  onClick={() => connect(it)}
                >
                  Connect
                </button>
              </div>
              <div className="intg-desc">Store an access token to enable {it.label}.</div>
            </div>
          ))}
          {/* TODO: "Add integration" + per-service automation toggles need a
              richer backend (config schema per service). Static for now. */}
          <div className="add-card" style={{ gridColumn: '1/-1', cursor: 'default', opacity: 0.6 }}>
            <Plus />
            Add integration
          </div>
        </div>
      </div>
    </div>
  );
}
