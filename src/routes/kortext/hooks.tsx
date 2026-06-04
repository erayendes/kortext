/**
 * Kortext › Hooks (engine scope) — GET/PUT /api/hooks.
 *
 * Maps to `.kpane[data-k=hooks]` in wireframe-v6-hifi.html. Each lifecycle
 * event (PreToolUse / PostToolUse / UserPromptSubmit / SessionStart /
 * HandoverStart / BlockerDetected) has an on/off toggle. Toggling persists the
 * full hook set via PUT; the canonical set + labels come from the server.
 */
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPut } from '../../lib/api.ts';
import { SettingsPane, SetCard, SetRow, Switch } from '../../components/v6/SettingsPane.tsx';

type Hook = { id: string; label: string; description: string; enabled: boolean; command: string };
type HooksResponse = { hooks: Hook[] };

export function HooksRoute() {
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    apiGet<HooksResponse>('/api/hooks')
      .then((r) => setHooks(r.hooks))
      .catch(() => setHooks([]));
  }, []);

  useEffect(() => load(), [load]);

  async function toggle(id: string) {
    if (saving) return;
    const next = hooks.map((h) => (h.id === id ? { ...h, enabled: !h.enabled } : h));
    setHooks(next);
    setSaving(true);
    try {
      const r = await apiPut<HooksResponse>('/api/hooks', {
        hooks: next.map((h) => ({ id: h.id, enabled: h.enabled, command: h.command })),
      });
      setHooks(r.hooks);
    } catch {
      load(); // re-sync from server on failure
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsPane title="Hooks" subtitle="Event-triggered automation">
      <SetCard>
        {hooks.map((h) => (
          <SetRow
            key={h.id}
            label={<span className="mono">{h.label}</span>}
            desc={h.description}
          >
            <Switch on={h.enabled} onToggle={() => toggle(h.id)} />
          </SetRow>
        ))}
        {hooks.length === 0 && (
          <div style={{ padding: '14px 16px', color: 'var(--fg-faint)', fontSize: 12.5 }}>
            No hooks
          </div>
        )}
      </SetCard>
    </SettingsPane>
  );
}
