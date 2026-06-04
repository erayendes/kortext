/**
 * Project info (settings) — GET/PUT /api/project-meta.
 *
 * Maps to the `project-info` route in wireframe-v6-hifi.html. Name + code are
 * displayed read-only (set at init, immutable server-side via type/createdAt
 * carry-over); target platforms are interactive chips persisted via PUT.
 * Per-project notification toggles + the Danger zone are wireframe-faithful UI
 * with no backing endpoint yet (TODO).
 */
import { useEffect, useState } from 'react';
import { Globe, Smartphone, TabletSmartphone, Monitor, Server, Terminal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiGet, apiPut } from '../../lib/api.ts';
import type { ProjectMeta } from '../../lib/api-types.ts';
import { SettingsPane, SetSection, SetCard, SetRow, Switch, Chip } from '../../components/v6/SettingsPane.tsx';

type MetaResponse = { meta: ProjectMeta | null };

/** Platform catalogue — neutral Lucide icons (brand glyphs may not render). */
const PLATFORMS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'web', label: 'Web', icon: Globe },
  { id: 'ios', label: 'iOS', icon: Smartphone },
  { id: 'android', label: 'Android', icon: TabletSmartphone },
  { id: 'desktop', label: 'Desktop', icon: Monitor },
  { id: 'api', label: 'API', icon: Server },
  { id: 'cli', label: 'CLI', icon: Terminal },
];

export function ProjectInfoRoute() {
  const [meta, setMeta] = useState<ProjectMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Per-project notification toggles — local only (no endpoint yet · TODO).
  const [slackOn, setSlackOn] = useState(true);
  const [telegramOn, setTelegramOn] = useState(true);

  useEffect(() => {
    let alive = true;
    apiGet<MetaResponse>('/api/project-meta')
      .then((r) => alive && setMeta(r.meta))
      .catch(() => alive && setMeta(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const platforms = new Set((meta?.platforms ?? []).map((p) => p.toLowerCase()));

  async function togglePlatform(id: string) {
    if (!meta || saving) return;
    const next = new Set(platforms);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const nextArr = [...next];
    const prev = meta.platforms;
    setMeta({ ...meta, platforms: nextArr });
    setSaving(true);
    try {
      const r = await apiPut<MetaResponse>('/api/project-meta', { platforms: nextArr });
      if (r.meta) setMeta(r.meta);
    } catch {
      // Revert on failure.
      setMeta((m) => (m ? { ...m, platforms: prev } : m));
    } finally {
      setSaving(false);
    }
  }

  const projectLabel = meta?.name ?? 'this project';

  return (
    <SettingsPane
      title="Project info"
      subtitle={
        <>
          Settings for <span style={{ color: 'var(--fg-mid)' }}>{projectLabel}</span>
        </>
      }
    >
      <SetSection>General</SetSection>
      <SetCard>
        <SetRow label="Project name" desc="Set at init · immutable">
          <span className="set-val">{loading ? '…' : meta?.name ?? '—'}</span>
        </SetRow>
        <SetRow
          label="Project code"
          desc={
            <>
              Item id prefix — e.g. <span className="mono">{meta?.code ?? 'CODE'}-T01</span>
            </>
          }
        >
          <span className="set-val mono">{loading ? '…' : meta?.code ?? '—'}</span>
        </SetRow>
        <SetRow label="Target platforms" desc="Toggle the platforms this project ships to">
          <div className="chips" style={{ justifyContent: 'flex-end' }}>
            {PLATFORMS.map(({ id, label, icon: Icon }) => (
              <Chip key={id} on={platforms.has(id)} onClick={() => togglePlatform(id)}>
                <Icon />
                {label}
              </Chip>
            ))}
          </div>
        </SetRow>
      </SetCard>

      <SetSection>Notifications</SetSection>
      <SetCard>
        <div className="set-note">
          Connection is global · <b>Kortext &gt; Notifications</b>. Toggle this project's alerts here.
        </div>
        <SetRow
          label={
            <>
              Slack →{' '}
              <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                #{(meta?.code ?? 'project').toLowerCase()}
              </span>
            </>
          }
        >
          <Switch on={slackOn} onToggle={() => setSlackOn((v) => !v)} />
        </SetRow>
        <SetRow
          label={
            <>
              Telegram →{' '}
              <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                +prime
              </span>
            </>
          }
        >
          <Switch on={telegramOn} onToggle={() => setTelegramOn((v) => !v)} />
        </SetRow>
      </SetCard>

      {/* TODO: per-project notification routing has no backend endpoint yet —
          toggles above are local. Reset/Remove below are not wired (no engine
          reset / project unregister API). Kept wireframe-faithful as UI. */}
      <SetSection danger>Danger zone</SetSection>
      <SetCard danger>
        <SetRow label="Reset engine state" desc="Clears SQLite + worktrees; markdown is preserved">
          <button className="btn btn-sm btn-danger-line" disabled title="Not wired yet">
            Reset
          </button>
        </SetRow>
        <SetRow
          label="Remove project"
          desc={
            <>
              Unregister (keeps <span className="mono">.kortext/</span>) or delete entirely
            </>
          }
        >
          <button className="btn btn-sm btn-danger" disabled title="Not wired yet">
            Remove…
          </button>
        </SetRow>
      </SetCard>
    </SettingsPane>
  );
}
