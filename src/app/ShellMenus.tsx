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
import { Box, Check, Plus } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api.ts';
import type {
  BacklogItem, PersonaSummary, Run, ProjectMeta,
} from '../lib/api-types.ts';
import { useShellEvent } from './shell-events.ts';

const short = (h: string) => h.replace(/^\+/, '');

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

function runDot(status: Run['status']): string {
  if (status === 'running' || status === 'succeeded') return 'var(--green)';
  if (status === 'failed' || status === 'cancelled') return 'var(--red)';
  return 'var(--amber)';
}

function UpPanels() {
  const [which, setWhich] = useState<'agents' | 'worktrees' | null>(null);
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);

  function toggle(target: 'agents' | 'worktrees') {
    setWhich((cur) => (cur === target ? null : target));
    if (target === 'agents') {
      apiGet<{ personas: PersonaSummary[] }>('/api/personas')
        .then((r) => setPersonas(r.personas))
        .catch(() => undefined);
    } else {
      apiGet<{ runs: Run[] }>('/api/runs').then((r) => setRuns(r.runs)).catch(() => undefined);
    }
  }

  useShellEvent('open-agents', () => toggle('agents'));
  useShellEvent('open-worktrees', () => toggle('worktrees'));

  const worktrees = runs.filter((r) => r.worktree_path);

  return (
    <>
      {which && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 44 }}
          onClick={() => setWhich(null)}
        />
      )}
      <div
        className={`uppanel${which === 'agents' ? ' open' : ''}`}
        style={{ right: 170 }}
      >
        <div className="up-list">
          {personas.length === 0 ? (
            <div className="up-row up-task">no agents</div>
          ) : (
            personas.map((a) => (
              <div className="up-row" key={a.handle}>
                <span className="up-dot" style={{ background: 'var(--green)' }} />
                <span className="up-name">{short(a.handle)}</span>
                <span className="up-task">{a.description || a.id}</span>
              </div>
            ))
          )}
        </div>
      </div>
      <div
        className={`uppanel${which === 'worktrees' ? ' open' : ''}`}
        style={{ right: 74 }}
      >
        <div className="up-list">
          {worktrees.length === 0 ? (
            <div className="up-row up-task">no active worktrees</div>
          ) : (
            worktrees.map((w) => (
              <div className="up-row" key={w.id}>
                <span className="up-dot" style={{ background: runDot(w.status) }} />
                <span className="up-name">run-{w.id}</span>
                <span
                  className="up-task"
                  style={w.status !== 'running' ? { color: runDot(w.status) } : undefined}
                >
                  {w.item_id ? `${w.item_id} · ` : ''}
                  {w.status}
                </span>
              </div>
            ))
          )}
        </div>
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
                <button className="btn btn-line btn-sm" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button className="btn btn-pri btn-sm" onClick={create} disabled={busy || !title.trim()}>
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
