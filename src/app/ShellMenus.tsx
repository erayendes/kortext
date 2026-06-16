/**
 * ShellMenus — the remaining global chrome that hangs off the topbar and
 * footer: the project / version dropdowns (`.menu`), the footer Agents /
 * Worktrees up-panels (`.uppanel`), the New-item modal (`.ni-*`) and a toast.
 *
 * Everything is event-driven (see shell-events.ts):
 *   open-proj-menu / open-ver-menu  → topbar dropdowns (carry an anchor rect)
 *   open-agents / open-worktrees    → footer up-panels
 *   open-new-item                   → the create-item modal (e.g. Board "New")
 *
 * Menus/up-panels close via a transparent backdrop so the opening click can't
 * also dismiss them. Real data only — personas/runs/project from the API.
 */
import { useEffect, useRef, useState } from 'react';
import { Box, Check, GitBranch, Plus } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api.ts';
import type {
  BacklogItem, Run, ProjectMeta,
} from '../lib/api-types.ts';
import { assigneeOf } from '../lib/board-drawer.ts';
import { emitShell, useShellEvent } from './shell-events.ts';

type MenuState = { which: 'proj' | 'ver'; left: number; top: number } | null;

export function ShellMenus() {
  return (
    <>
      <TopbarMenus />
      <UpPanels />
      <NewItemModal />
    </>
  );
}

/* ----------------------------- topbar dropdowns ---------------------------- */

function TopbarMenus() {
  const [menu, setMenu] = useState<MenuState>(null);
  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [versions, setVersions] = useState<string[]>([]);

  useEffect(() => {
    apiGet<{ meta: ProjectMeta }>('/api/project-meta')
      .then((r) => setProject(r.meta))
      .catch(() => undefined);
    apiGet<{ items: BacklogItem[] }>('/api/backlog')
      .then((r) => {
        const seen = new Set<string>();
        for (const it of r.items) if (it.version) seen.add(it.version);
        setVersions([...seen].sort().reverse());
      })
      .catch(() => undefined);
  }, []);

  function place(which: 'proj' | 'ver', rect?: DOMRect) {
    if (!rect) return;
    setMenu((cur) =>
      cur?.which === which
        ? null
        : { which, left: rect.left, top: rect.bottom + 6 },
    );
  }

  useShellEvent('open-proj-menu', (e) => place('proj', e.detail?.rect));
  useShellEvent('open-ver-menu', (e) => place('ver', e.detail?.rect));

  if (!menu) return null;

  const projName = project?.name ?? 'Project';
  const currentVer = versions[0] ?? project?.code ?? 'v1.0';

  return (
    <>
      {/* transparent click-away catcher (below .menu's z-index of 55) */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 54 }}
        onClick={() => setMenu(null)}
      />
      {menu.which === 'proj' ? (
        <div className="menu open" style={{ left: menu.left, top: menu.top }}>
          <div className="menu-sec">Project</div>
          <div className="menu-item">
            <Box />
            {projName}
            <span className="mi-check">
              <Check style={{ width: 13, height: 13 }} />
            </span>
          </div>
          <div className="menu-sep" />
          <div className="menu-item" onClick={() => setMenu(null)}>
            <Plus />
            New project…
          </div>
        </div>
      ) : (
        <div
          className="menu open"
          style={{ left: menu.left, top: menu.top, minWidth: 150 }}
        >
          <div className="menu-sec">Version</div>
          {(versions.length ? versions : [currentVer]).map((v, i) => (
            <div className="menu-item mono" key={v} onClick={() => setMenu(null)}>
              {v}
              {i === 0 && (
                <span className="mi-check">
                  <Check style={{ width: 13, height: 13 }} />
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------------------------- footer up-panels ----------------------------- */

// Real agent runtime — the live run records, not backlog item statuses.
const RUN_RUNTIME_COLOR: Partial<Record<Run['status'], string>> = {
  running: 'var(--green)',
  queued: 'var(--amber)',
  awaiting_approval: 'var(--red)',
};
const RUN_RUNTIME_LABEL: Partial<Record<Run['status'], string>> = {
  running: 'running',
  queued: 'queued',
  awaiting_approval: 'awaiting approval',
};

function UpPanels() {
  const [which, setWhich] = useState<'agents' | 'worktrees' | 'review' | null>(null);
  const [left, setLeft] = useState(74);
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);

  function open(target: 'agents' | 'worktrees' | 'review', rect?: DOMRect) {
    setWhich((cur) => (cur === target ? null : target));
    if (rect) {
      // anchor the panel under the clicked foot-item, clamped to the viewport
      const W = window.innerWidth;
      setLeft(Math.min(Math.max(Math.round(rect.left), 8), W - 272 - 8));
    }
    if (target === 'worktrees' || target === 'agents') {
      apiGet<{ runs: Run[] }>('/api/runs').then((r) => setRuns(r.runs)).catch(() => undefined);
    }
    if (target === 'agents') {
      // items only to put a name (the owning agent) on each active run
      apiGet<{ items: BacklogItem[] }>('/api/backlog?limit=500')
        .then((r) => setItems(r.items))
        .catch(() => undefined);
    }
  }

  useShellEvent('open-agents', (e) => open('agents', e.detail?.rect));
  useShellEvent('open-worktrees', (e) => open('worktrees', e.detail?.rect));
  useShellEvent('open-review', (e) => open('review', e.detail?.rect));

  // Active runs = the agents actually doing something right now.
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const activeRuns = runs.filter(
    (r) => r.status === 'running' || r.status === 'queued' || r.status === 'awaiting_approval',
  );
  // Only *active* worktrees (a finished run's checkout is gone) — matches the
  // footer count so the popover never disagrees with the badge.
  const worktrees = runs.filter(
    (r) => (r.status === 'running' || r.status === 'awaiting_approval') && r.worktree_path,
  );

  // "Skip reviews" toggles — when on, +prime work in that scope auto-approves.
  // Persisted locally; backend enforcement of auto-approve is a follow-up.
  const [skip, setSkip] = useState<{ refs?: boolean; items?: boolean }>(() => {
    try {
      return JSON.parse(localStorage.getItem('kx-skip-reviews') || '{}');
    } catch {
      return {};
    }
  });
  const toggleSkip = (k: 'refs' | 'items') =>
    setSkip((s) => {
      const next = { ...s, [k]: !s[k] };
      try {
        localStorage.setItem('kx-skip-reviews', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  return (
    <>
      {which && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 44 }} onClick={() => setWhich(null)} />
      )}
      <div
        className={`uppanel${which ? ' open' : ''}`}
        style={{ left, right: 'auto', bottom: 34 }}
      >
        {which === 'review' ? (
          <>
            <div className="pop-head">
              <span className="pop-title">Skip reviews</span>
            </div>
            <div className="pop-note">
              Turn one on to let the house auto-approve that scope without +prime.
            </div>
            <div className="pop-body">
              <div className="pop-toggle">
                <span className="pop-tg-t">References review</span>
                <span
                  className={`switch${skip.refs ? ' on' : ''}`}
                  role="switch"
                  aria-checked={!!skip.refs}
                  onClick={() => toggleSkip('refs')}
                />
              </div>
              <div className="pop-toggle">
                <span className="pop-tg-t">Item review</span>
                <span
                  className={`switch${skip.items ? ' on' : ''}`}
                  role="switch"
                  aria-checked={!!skip.items}
                  onClick={() => toggleSkip('items')}
                />
              </div>
            </div>
          </>
        ) : which === 'agents' ? (
          <>
            <div className="pop-head">
              <span className="pop-title">Agents on task</span>
              <span className="badge-count">{activeRuns.length}</span>
            </div>
            <div className="up-list">
              {activeRuns.length === 0 ? (
                <div className="up-empty">No agents running right now.</div>
              ) : (
                activeRuns.map((r) => {
                  const item = r.item_id ? itemsById.get(r.item_id) : undefined;
                  const owner = item ? assigneeOf(item) : null;
                  const color = RUN_RUNTIME_COLOR[r.status] ?? 'var(--amber)';
                  const desc = item
                    ? `${r.item_id} · ${item.title}`
                    : `${RUN_RUNTIME_LABEL[r.status] ?? r.status}`;
                  return (
                    <div
                      className="up-row"
                      key={r.id}
                      style={r.item_id ? { cursor: 'pointer' } : undefined}
                      onClick={
                        r.item_id
                          ? () => {
                              emitShell('open-item', { id: r.item_id! });
                              setWhich(null);
                            }
                          : undefined
                      }
                    >
                      <span
                        className={`up-dot${r.status === 'running' ? ' beat' : ''}`}
                        style={{ background: color, color }}
                      />
                      <div className="up-rowb">
                        <div className="up-name">{owner ?? `run-${r.id}`}</div>
                        <div
                          className="up-task"
                          style={r.status === 'awaiting_approval' ? { color: 'var(--red)' } : undefined}
                        >
                          {desc}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <>
            <div className="pop-head">
              <span className="pop-title">Open worktrees</span>
              <span className="badge-count">{worktrees.length}</span>
            </div>
            <div className="up-list">
              {worktrees.length === 0 ? (
                <div className="up-empty">No active worktrees.</div>
              ) : (
                worktrees.map((w) => (
                  <div className="up-row" key={w.id}>
                    <GitBranch className="ic" />
                    <span className="up-name">
                      {w.worktree_path?.split('/').filter(Boolean).pop() ?? `run-${w.id}`}
                    </span>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ------------------------------ new-item modal ----------------------------- */

const NI_TYPES: { key: BacklogItem['type']; label: string; dot: string }[] = [
  { key: 'task', label: 'Task', dot: '#5E84D2' },
  { key: 'bug', label: 'Bug', dot: '#CC6B6B' },
  { key: 'debt', label: 'Debt', dot: '#D2A24C' },
];

function NewItemModal() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<BacklogItem['type']>('task');
  const [title, setTitle] = useState('');
  const [parent, setParent] = useState('');
  const [epics, setEpics] = useState<BacklogItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useShellEvent('open-new-item', () => {
    setOpen(true);
    setTitle('');
    setType('task');
    setParent('');
    setError(null);
    apiGet<{ items: BacklogItem[] }>('/api/backlog')
      .then((r) => setEpics(r.items.filter((i) => i.type === 'epic')))
      .catch(() => undefined);
  });

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }

  async function create() {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ item: BacklogItem }>('/api/backlog', {
        type,
        title: title.trim(),
        parent_id: parent || undefined,
      });
      setOpen(false);
      showToast(`Item created · ${res.item.id}`);
    } catch (err) {
      const e = err as { message?: string; error?: string };
      setError(e.message || e.error || 'Could not create item');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && (
        <div
          className="overlay center open"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="cmdk-box" style={{ width: 440 }}>
            <div style={{ padding: '18px 18px 16px' }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>New item</div>

              <div className="ni-field">
                <span className="ni-lbl">Type</span>
                <div className="chips">
                  {NI_TYPES.map((t) => (
                    <span
                      key={t.key}
                      className={`chip${type === t.key ? ' on' : ''}`}
                      onClick={() => setType(t.key)}
                    >
                      <span
                        className="d"
                        style={{ width: 6, height: 6, borderRadius: '50%', background: t.dot }}
                      />
                      {t.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="ni-field">
                <span className="ni-lbl">Title</span>
                <input
                  className="ni-input"
                  placeholder="What needs doing?"
                  value={title}
                  autoFocus
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') create();
                    if (e.key === 'Escape') setOpen(false);
                  }}
                />
              </div>

              <div className="ni-field">
                <span className="ni-lbl">Parent epic</span>
                <select
                  className="set-select ni-input"
                  style={{ height: 34 }}
                  value={parent}
                  onChange={(e) => setParent(e.target.value)}
                >
                  <option value="">— none</option>
                  {epics.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.id} · {ep.title}
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <div style={{ color: 'var(--red)', fontSize: 12, marginTop: -4, marginBottom: 10 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary btn-sm" onClick={create} disabled={busy || !title.trim()}>
                  <Plus style={{ width: 13, height: 13 }} />
                  {busy ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`toast${toast ? ' show' : ''}`}>
        <Check style={{ width: 14, height: 14 }} />
        {toast}
      </div>
    </>
  );
}
