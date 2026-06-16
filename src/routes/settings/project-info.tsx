/**
 * Project info (settings) — GET/PUT /api/project-meta.
 *
 * Maps to the `project-info` route in wireframe-v6-hifi.html. Name + code are
 * displayed read-only (set at init, immutable server-side via type/createdAt
 * carry-over); target platforms are interactive chips persisted via PUT.
 * Per-project notification toggles + the Danger zone are wireframe-faithful UI
 * with no backing endpoint yet (TODO).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Globe, Smartphone, TabletSmartphone, Monitor, Server, SquareTerminal, AlertTriangle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiGet, apiPost, apiPut } from '../../lib/api.ts';
import type { ProjectMeta } from '../../lib/api-types.ts';
import { SettingsPane, SetSection, SetCard, SetRow, Switch, Chip } from '../../components/v6/SettingsPane.tsx';

type LifecycleAction = 'archive' | 'reset' | 'remove' | 'delete';

type MetaResponse = { meta: ProjectMeta | null };

/** Platform catalogue — neutral Lucide icons (brand glyphs may not render). */
const PLATFORMS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'web', label: 'Web', icon: Globe },
  { id: 'ios', label: 'iOS', icon: Smartphone },
  { id: 'android', label: 'Android', icon: TabletSmartphone },
  { id: 'desktop', label: 'Desktop', icon: Monitor },
  { id: 'api', label: 'API', icon: Server },
  { id: 'cli', label: 'CLI', icon: SquareTerminal },
];

export function ProjectInfoRoute() {
  const [meta, setMeta] = useState<ProjectMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Master notifications switch — alerts surface as in-app toasts + native
  // browser notifications. Persisted locally (a UI preference, not server state).
  const [notifOn, setNotifOn] = useState(() => (localStorage.getItem('kx-notifications') ?? '1') === '1');

  function toggleNotif() {
    setNotifOn((v) => {
      const next = !v;
      localStorage.setItem('kx-notifications', next ? '1' : '0');
      // Ask for native permission the first time alerts are switched on.
      if (next && 'Notification' in window && Notification.permission === 'default') {
        void Notification.requestPermission();
      }
      return next;
    });
  }

  // Lifecycle / danger actions. Archive is safe (delist only); reset/remove/delete
  // are destructive and gated by a type-the-project-code confirm (delete also
  // needs the word DELETE). Each takes the daemon down.
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  async function runAction() {
    if (!action) return;
    setActionBusy(true);
    setActionMsg(null);
    try {
      await apiPost(`/api/project/${action}`, {});
      setAction(null);
      setActionMsg(
        {
          archive: 'Project archived · daemon stopping…',
          reset: 'Engine state cleared · daemon restarting…',
          remove: 'Kortext removed · daemon stopping…',
          delete: 'Project deleted · daemon stopping…',
        }[action],
      );
    } catch {
      setActionMsg('İşlem başarısız oldu.');
    } finally {
      setActionBusy(false);
    }
  }

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
  const executorChain = meta?.executors ?? (meta?.executor ? [meta.executor] : []);

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
        <SetRow label="Engine" desc="Executor fallback chain — primary first, set at init">
          {loading ? (
            <span className="set-val">…</span>
          ) : executorChain.length ? (
            <span className="chips" style={{ justifyContent: 'flex-end' }}>
              {executorChain.map((ex, i) => (
                <span key={ex} className="flex items-center" style={{ gap: 6 }}>
                  {i > 0 && <span style={{ color: 'var(--fg-faint)' }}>→</span>}
                  <span className={`set-val mono${i === 0 ? '' : ' faint'}`}>{ex}</span>
                </span>
              ))}
            </span>
          ) : (
            <span className="set-val">—</span>
          )}
        </SetRow>
      </SetCard>

      <SetSection>Notifications</SetSection>
      <SetCard>
        <SetRow
          label="Notifications"
          desc="Alerts surface as in-app toasts and native browser notifications. Turn them all on or off for this project."
        >
          <Switch on={notifOn} onToggle={toggleNotif} />
        </SetRow>
      </SetCard>

      <SetSection>Lifecycle</SetSection>
      <SetCard>
        <SetRow
          label="Archive project"
          desc="Removes it from your active project list — nothing is deleted. Restore it any time."
        >
          <button className="btn btn-sm btn-secondary" onClick={() => setAction('archive')}>
            Archive…
          </button>
        </SetRow>
      </SetCard>

      <SetSection danger>Danger zone</SetSection>
      <SetCard danger>
        <SetRow label="Reset engine" desc="Clears the database + worktrees. Keeps your docs, settings, and code.">
          <button className="btn btn-sm btn-danger" onClick={() => setAction('reset')}>
            Reset…
          </button>
        </SetRow>
        <SetRow
          label="Remove Kortext"
          desc={
            <>
              Deletes the whole <span className="mono">.kortext/</span> (docs + state). Keeps your own code.
            </>
          }
        >
          <button className="btn btn-sm btn-danger" onClick={() => setAction('remove')}>
            Remove…
          </button>
        </SetRow>
        <SetRow
          label="Delete project"
          desc="Deletes the entire project folder — including your code. Cannot be undone."
        >
          <button className="btn btn-sm btn-danger" onClick={() => setAction('delete')}>
            Delete…
          </button>
        </SetRow>
      </SetCard>
      {actionMsg && (
        <div className="set-note" style={{ marginTop: 12 }}>
          {actionMsg}
        </div>
      )}

      <DangerConfirm
        action={action}
        code={meta?.code ?? 'PROJECT'}
        busy={actionBusy}
        onCancel={() => setAction(null)}
        onConfirm={() => void runAction()}
      />
    </SettingsPane>
  );
}

/** Copy + safety level per lifecycle action. */
const ACTION_COPY: Record<
  LifecycleAction,
  { title: string; confirm: string; danger: boolean; requireCode: boolean; extraWord?: string; body: ReactNode }
> = {
  archive: {
    title: 'Archive project',
    confirm: 'Archive',
    danger: false,
    requireCode: false,
    body: (
      <>
        Removes this project from your active list and stops its daemon. <b>Nothing is deleted</b> —
        every file stays on disk. Start it again from the picker to pick up exactly where you left off.
      </>
    ),
  },
  reset: {
    title: 'Reset engine',
    confirm: 'Reset',
    danger: false,
    requireCode: true,
    body: (
      <>
        Clears the database and all worktrees. Your docs (memory, foundation, references, reports),
        settings, and your own code are <b>kept</b>. The daemon restarts into a clean state.
      </>
    ),
  },
  remove: {
    title: 'Remove Kortext',
    confirm: 'Remove',
    danger: false,
    requireCode: true,
    body: (
      <>
        Deletes the entire <span className="mono">.kortext/</span> folder — database, worktrees, AND
        every agent doc — and unregisters the project. <b>Your own code is kept.</b> This cannot be undone.
      </>
    ),
  },
  delete: {
    title: 'Delete project',
    confirm: 'Delete forever',
    danger: true,
    requireCode: true,
    extraWord: 'DELETE',
    body: (
      <>
        Permanently deletes the <b>entire project folder</b> — including your own source code — and
        unregisters it. There is no undo and no backup. Be absolutely sure.
      </>
    ),
  },
};

/** Confirm dialog — the safety layer. Archive is a plain confirm; the destructive
 *  three require typing the project code; delete also requires the word DELETE. */
function DangerConfirm({
  action,
  code,
  busy,
  onConfirm,
  onCancel,
}: {
  action: LifecycleAction | null;
  code: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [extra, setExtra] = useState('');
  useEffect(() => {
    setTyped('');
    setExtra('');
  }, [action]);
  if (!action) return null;
  const copy = ACTION_COPY[action];
  const codeOk = !copy.requireCode || typed.trim() === code;
  const extraOk = !copy.extraWord || extra.trim() === copy.extraWord;
  const armed = codeOk && extraOk;
  return (
    <div className="kx-modal-backdrop" onClick={onCancel}>
      <div className="kx-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className={`kx-modal-h${copy.danger ? ' danger' : ''}`}>
          <AlertTriangle className="ic" />
          {copy.title}
        </div>
        <div className="kx-modal-body">{copy.body}</div>
        {copy.requireCode && (
          <label className="kx-modal-confirm">
            <span>
              Type <span className="mono">{code}</span> to confirm
            </span>
            <input
              value={typed}
              autoFocus
              placeholder={code}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && armed && !busy) onConfirm();
              }}
            />
          </label>
        )}
        {copy.extraWord && (
          <label className="kx-modal-confirm">
            <span>
              …and type <span className="mono">{copy.extraWord}</span> to be sure
            </span>
            <input
              value={extra}
              placeholder={copy.extraWord}
              onChange={(e) => setExtra(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && armed && !busy) onConfirm();
              }}
            />
          </label>
        )}
        <div className="kx-modal-actions">
          <button className="btn btn-sm btn-secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`btn btn-sm ${copy.danger ? 'btn-danger' : copy.requireCode ? 'btn-danger' : 'btn-primary'}`}
            disabled={!armed || busy}
            onClick={onConfirm}
          >
            {busy ? '…' : copy.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
