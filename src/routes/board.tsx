/**
 * Board (Session 3) — the v6 kanban board + item/epic detail drawer.
 *
 * Layout maps 1:1 to `wireframe-v6-hifi.html` → `.board-scroll`:
 *   [ epic-rail (filter) ] [ To do | In progress | Test | Review | Done ]
 *
 * Epics are NOT a status — they live in the left rail and act as a filter over
 * the columns. `blocked` is an orthogonal flag (DECISIONS §12.3), drawn as a red
 * card inside its underlying column, never a column of its own. All data is real
 * (GET /api/backlog); mutations (AC toggle, status transitions) hit the live
 * endpoints and refresh both the board and the open drawer.
 *
 * The pure logic (column bucketing, gate derivation, blocked introspection)
 * lives in src/lib/board-drawer.ts and is unit-tested; this file is the wiring.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Check,
  CircleStop,
  Link2,
  Plus,
  Tag,
  User,
  X,
} from 'lucide-react';
import { Drawer } from '../components/v6/Drawer.tsx';
import { apiGet, apiPost, formatElapsed, usePolling } from '../lib/api.ts';
import type { ActivityEntry, BacklogItem } from '../lib/api-types.ts';
import { personaPalette } from '../lib/persona-colors.ts';
import {
  acChecklist,
  assigneeOf,
  assigneesOf,
  availableTransitions,
  blockReasonFromActivity,
  boardColumns,
  childrenOf,
  defaultActiveVersion,
  dependenciesOf,
  describeActivity,
  descriptionFromBody,
  epicProgress,
  itemGates,
  sortedVersions,
  statusBadge,
  underlyingStatusFromActivity,
  type BoardTransition,
} from '../lib/board-drawer.ts';

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

const TYPE_META: Record<BacklogItem['type'], { label: string; color: string }> = {
  task: { label: 'Task', color: '#5E84D2' },
  bug: { label: 'Bug', color: '#CC6B6B' },
  debt: { label: 'Debt', color: '#D2A24C' },
  epic: { label: 'Epic', color: '#9B82CE' },
  spike: { label: 'Spike', color: '#67E8F9' },
  hotfix: { label: 'Hotfix', color: '#FB7185' },
};

/** hex (#rrggbb) → rgba() string, for the translucent pill/avatar fills. */
function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const short = (handle: string | null): string => (handle ? handle.replace(/^\+/, '') : '');

/** Persona-routed avatar (colour + Lucide glyph), mirrors the wireframe pAvatar. */
function Avatar({ handle, size = 24 }: { handle: string | null; size?: number }) {
  const { color, icon: Icon } = personaPalette(handle);
  const border = size <= 16 ? 1 : 1.5;
  return (
    <span
      className="avatar"
      title={handle ?? undefined}
      style={{ width: size, height: size, background: rgba(color, 0.1), border: `${border}px solid ${rgba(color, 0.65)}`, color }}
    >
      <Icon size={Math.round(size * 0.52)} strokeWidth={size <= 16 ? 1.8 : 2} />
    </span>
  );
}

function TypePill({ type }: { type: BacklogItem['type'] }) {
  const t = TYPE_META[type];
  return (
    <span className="ty-pill" style={{ color: t.color, background: rgba(t.color, 0.1) }}>
      <span className="d" style={{ background: t.color }} />
      {t.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Activity hook — fetch an item's audit feed on demand (drawer only)
// ---------------------------------------------------------------------------

function useActivity(itemId: string | null) {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const reload = useCallback(() => {
    if (!itemId) return;
    void apiGet<{ activity: ActivityEntry[] }>(`/api/backlog/${itemId}/activity`)
      .then((r) => setActivity(r.activity))
      .catch(() => setActivity([]));
  }, [itemId]);
  useEffect(() => {
    setActivity([]);
    reload();
  }, [itemId, reload]);
  return { activity, reload };
}

// ---------------------------------------------------------------------------
// Card (one task/bug/debt in a column)
// ---------------------------------------------------------------------------

function Card({ item, onOpen, index }: { item: BacklogItem; onOpen: () => void; index: number }) {
  const blocked = item.status === 'blocked';
  const gates = itemGates(item);
  const deps = dependenciesOf(item).blockedBy;
  return (
    <div
      className={`card rise${blocked ? ' block' : ''}`}
      onClick={onOpen}
      style={{ animationDelay: `${index * 30}ms`, ...(item.status === 'done' ? { opacity: 0.62 } : {}) }}
    >
      <div className="c-top">
        <TypePill type={item.type} />
        <span className="c-id mono">{item.id}</span>
      </div>
      <div className="c-title">{item.title}</div>
      {gates.length > 0 && (
        <span className="gates">
          {gates.map((g) => (
            <span key={g.gate} className={`gate${g.state === 'passed' ? ' done' : ''}`} title={`${g.label} · ${g.state}`}>
              {g.abbr[0]}
            </span>
          ))}
        </span>
      )}
      <div className="c-foot">
        {deps.length > 0 && (
          <span className="c-meta">
            <Link2 />
            {deps.length}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Avatar handle={assigneeOf(item)} size={24} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Epic rail card (filter)
// ---------------------------------------------------------------------------

function EpicCard({
  epic,
  items,
  selected,
  onToggleFilter,
  onOpen,
  index,
}: {
  epic: BacklogItem;
  items: BacklogItem[];
  selected: boolean;
  onToggleFilter: () => void;
  onOpen: () => void;
  index: number;
}) {
  const { total, done, pct } = epicProgress(items, epic.id);
  return (
    <div
      className={`epic-card rise${selected ? ' sel' : ''}`}
      onClick={onToggleFilter}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="ec-top">
        <TypePill type="epic" />
        <span className="ec-id mono">{epic.id}</span>
        <span
          className="dr-x"
          title="Open epic detail"
          style={{ marginLeft: 6, width: 18, height: 18 }}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          <ArrowRight style={{ width: 14, height: 14 }} />
        </span>
      </div>
      <div className="ec-title">{epic.title}</div>
      <div className="prog" style={{ marginBottom: 0 }}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="ec-foot">
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
          {done}/{total}
        </span>
        <span style={{ flex: 1 }} />
        <Avatar handle={assigneeOf(epic)} size={24} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item detail drawer body + footer
// ---------------------------------------------------------------------------

function ItemDrawer({
  item,
  onClose,
  onMutated,
}: {
  item: BacklogItem;
  onClose: () => void;
  onMutated: () => void;
}) {
  const { activity, reload: reloadActivity } = useActivity(item.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  const t = TYPE_META[item.type];
  const ac = acChecklist(item.frontmatter);
  const gates = itemGates(item);
  const deps = dependenciesOf(item);
  const blocked = item.status === 'blocked';
  const blockReason = blocked ? blockReasonFromActivity(activity) : null;
  const underlying = blocked ? underlyingStatusFromActivity(activity) : null;
  const columnLabel = statusBadge((underlying ?? item.status) as BacklogItem['status']).label;

  async function toggleAc(index: number, done: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/backlog/${item.id}/ac`, { index, done });
      onMutated();
      reloadActivity();
    } catch {
      setError('Could not update criterion.');
    } finally {
      setBusy(false);
    }
  }

  async function postComment() {
    const text = comment.trim();
    if (busy || !text) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/backlog/${item.id}/comment`, { text });
      setComment('');
      reloadActivity();
    } catch {
      setError('Could not post comment.');
    } finally {
      setBusy(false);
    }
  }

  async function transition(action: BoardTransition) {
    if (busy) return;
    const reason =
      action === 'block' ? window.prompt('Reason for blocking (optional):') ?? undefined : undefined;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/backlog/${item.id}/transition`, { action, reason });
      onMutated();
      reloadActivity();
    } catch {
      setError(`Could not ${action} this item.`);
    } finally {
      setBusy(false);
    }
  }

  const moves = availableTransitions(item.status);
  const primary = moves.find((m) => m.primary);
  const secondary = moves.filter((m) => !m.primary);

  return (
    <>
      <div className="dr-head">
        <span className="ty-pill" style={{ color: t.color, background: rgba(t.color, 0.1) }}>
          <span className="d" style={{ background: t.color }} />
          {t.label}
        </span>
        <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
          {item.id}
        </span>
        <span className="dr-x" onClick={onClose}>
          <X style={{ width: 16, height: 16 }} />
        </span>
      </div>

      <div className="dr-body">
        <div className="dr-title">{item.title}</div>
        {descriptionFromBody(item.body_md) && (
          <div className="dr-desc">{descriptionFromBody(item.body_md)}</div>
        )}

        {blocked && (
          <div className="dr-block">
            <Ban />
            <span>
              Blocked
              <span className="br"> · {blockReason ?? 'reason not set'}</span>
            </span>
          </div>
        )}

        <div className="dr-meta">
          <div className="dr-mrow">
            <span className="dr-mk">Assignee</span>
            <span className="dr-mv">
              <Avatar handle={assigneeOf(item)} size={18} />
              {short(assigneeOf(item)) || '—'}
            </span>
          </div>
          <div className="dr-mrow">
            <span className="dr-mk">Status</span>
            <span className="dr-mv">
              {columnLabel}
              {blocked && <span style={{ color: 'var(--red)', fontSize: 11 }}> · blocked</span>}
            </span>
          </div>
          {item.parent_id && (
            <div className="dr-mrow">
              <span className="dr-mk">Parent epic</span>
              <span className="dr-mv mono">{item.parent_id}</span>
            </div>
          )}
        </div>

        {(deps.blockedBy.length > 0 || deps.blocks.length > 0) && (
          <div className="dr-grp">
            <div className="dr-sec">Dependencies</div>
            {deps.blockedBy.length > 0 && (
              <div className="dr-mrow">
                <span className="dr-mk">Blocked by</span>
                <span className="dr-mv" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {deps.blockedBy.map((id) => (
                    <span key={id} className="ty-pill mono" style={{ color: 'var(--red)', background: rgba('#CC6B6B', 0.1) }}>
                      <Link2 style={{ width: 11, height: 11 }} />
                      {id}
                    </span>
                  ))}
                </span>
              </div>
            )}
            {deps.blocks.length > 0 && (
              <div className="dr-mrow">
                <span className="dr-mk">Blocks</span>
                <span className="dr-mv" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {deps.blocks.map((id) => (
                    <span key={id} className="ty-pill mono" style={{ color: 'var(--fg-muted)', background: 'var(--hover)' }}>
                      <Link2 style={{ width: 11, height: 11 }} />
                      {id}
                    </span>
                  ))}
                </span>
              </div>
            )}
          </div>
        )}

        {ac.length > 0 && (
          <div className="dr-grp">
            <div className="dr-sec">Acceptance criteria</div>
            {ac.map((c, i) => (
              <div
                key={i}
                className={`ac-row${c.done ? ' done' : ''}`}
                onClick={() => toggleAc(i, !c.done)}
              >
                <span className="ac-box">
                  <Check style={{ width: 11, height: 11 }} />
                </span>
                {c.text}
              </div>
            ))}
          </div>
        )}

        {gates.length > 0 && (
          <div className="dr-grp">
            <div className="dr-sec">Gates · {gates.length} for this item</div>
            {gates.map((g) => (
              <div key={g.gate} className="gate-row">
                <span className="gn">{g.label}</span>
                <span className="gate-st">
                  {g.state === 'passed' ? (
                    <span style={{ color: 'var(--green)' }}>✓ passed</span>
                  ) : (
                    <span style={{ color: 'var(--amber)' }}>○ pending</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="dr-grp">
          <div className="dr-sec">Activity</div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              value={comment}
              placeholder="Add a comment…"
              disabled={busy}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void postComment();
              }}
              style={{
                flex: 1,
                background: 'var(--panel)',
                border: '1px solid var(--border-strong)',
                borderRadius: 7,
                color: 'var(--fg)',
                font: 'inherit',
                fontSize: 12.5,
                padding: '7px 10px',
                outline: 'none',
              }}
            />
            <button
              className="btn btn-line btn-sm"
              disabled={busy || !comment.trim()}
              onClick={() => void postComment()}
            >
              Send
            </button>
          </div>

          {activity.length === 0 ? (
            <div className="dr-desc" style={{ marginBottom: 0 }}>
              No activity yet.
            </div>
          ) : (
            activity.map((e) => (
              <div className="cm-row" key={e.id}>
                <Avatar handle={e.actor} size={20} />
                <div className="cm-bub">
                  {describeActivity(e)}
                  <span style={{ color: 'var(--fg-faint)', marginLeft: 6, fontSize: 11 }}>
                    {formatElapsed(e.created_at)} ago
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {error && <div className="dr-block">{error}</div>}
      </div>

      {moves.length > 0 && (
        <div className="dr-foot">
          {secondary.map((m) => (
            <button
              key={m.action}
              className={`btn btn-sm ${m.action === 'block' ? 'btn-stop' : 'btn-line'}`}
              style={{ flex: 1 }}
              disabled={busy}
              onClick={() => transition(m.action)}
            >
              {m.action === 'bounce' && <ArrowLeft style={{ width: 13, height: 13 }} />}
              {m.action === 'block' && <CircleStop style={{ width: 13, height: 13 }} />}
              {m.label}
            </button>
          ))}
          {primary && (
            <button
              key={primary.action}
              className={`btn btn-sm ${primary.action === 'unblock' ? 'btn-approve' : 'btn-pri'}`}
              style={{ flex: 1 }}
              disabled={busy}
              onClick={() => transition(primary.action)}
            >
              {primary.action === 'unblock' && <Check style={{ width: 13, height: 13 }} />}
              {primary.label}
              {primary.action !== 'unblock' && <ArrowRight style={{ width: 13, height: 13 }} />}
            </button>
          )}
        </div>
      )}
    </>
  );
}

function EpicDrawer({
  epic,
  items,
  onOpenItem,
  onClose,
}: {
  epic: BacklogItem;
  items: BacklogItem[];
  onOpenItem: (id: string) => void;
  onClose: () => void;
}) {
  const kids = childrenOf(items, epic.id);
  const { total, done, pct } = epicProgress(items, epic.id);
  return (
    <>
      <div className="dr-head">
        <TypePill type="epic" />
        <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
          {epic.id}
        </span>
        <span className="dr-x" onClick={onClose}>
          <X style={{ width: 16, height: 16 }} />
        </span>
      </div>
      <div className="dr-body">
        <div className="dr-title">{epic.title}</div>
        {descriptionFromBody(epic.body_md) && (
          <div className="dr-desc">{descriptionFromBody(epic.body_md)}</div>
        )}
        <div className="dr-meta">
          <div className="dr-mrow">
            <span className="dr-mk">Owner</span>
            <span className="dr-mv">
              <Avatar handle={assigneeOf(epic)} size={18} />
              {short(assigneeOf(epic)) || '—'}
            </span>
          </div>
          <div className="dr-mrow">
            <span className="dr-mk">Progress</span>
            <span className="dr-mv">
              {pct}% · {done}/{total} done
            </span>
          </div>
        </div>
        <div className="prog" style={{ marginBottom: 22 }}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="dr-grp">
          <div className="dr-sec">Items · {kids.length}</div>
          {kids.length === 0 ? (
            <div className="dr-desc">No items in this epic yet.</div>
          ) : (
            kids.map((k) => (
              <div className="ep-kid" key={k.id} onClick={() => onOpenItem(k.id)}>
                <TypePill type={k.type} />
                <span className="ep-kid-id">{k.id}</span>
                <span className="ep-kid-t">{k.title}</span>
                <span className="ep-kid-st">
                  {k.status === 'blocked' ? (
                    <span style={{ color: 'var(--red)' }}>blocked</span>
                  ) : (
                    statusBadge(k.status).label
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Version selector (Board filter · UAT §A)
// ---------------------------------------------------------------------------

/**
 * Pill-styled version filter. A native <select> keeps it keyboard-accessible;
 * `value=null` is the "All versions" sentinel. The board defaults this to the
 * smallest unfinished version, so it opens on the work in flight.
 */
function VersionSelect({
  versions,
  value,
  onChange,
}: {
  versions: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <span className="pill" style={{ paddingRight: 0, gap: 4 }} title="Filter by release version">
      <Tag style={{ width: 12, height: 12 }} />
      <select
        value={value ?? '__all__'}
        onChange={(e) => onChange(e.target.value === '__all__' ? null : e.target.value)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          font: 'inherit',
          padding: '0 8px 0 0',
          cursor: 'pointer',
          outline: 'none',
          appearance: 'none',
          WebkitAppearance: 'none',
        }}
      >
        <option value="__all__">All versions</option>
        {versions.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </span>
  );
}

/**
 * Pill-styled assignee filter — same native-<select> pattern as VersionSelect.
 * `value=null` = "All assignees". Options are the resolved handles present.
 */
function AssigneeSelect({
  assignees,
  value,
  onChange,
}: {
  assignees: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <span className="pill" style={{ paddingRight: 0, gap: 4 }} title="Filter by assignee">
      <User style={{ width: 12, height: 12 }} />
      <select
        value={value ?? '__all__'}
        onChange={(e) => onChange(e.target.value === '__all__' ? null : e.target.value)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          font: 'inherit',
          padding: '0 8px 0 0',
          cursor: 'pointer',
          outline: 'none',
          appearance: 'none',
          WebkitAppearance: 'none',
        }}
      >
        <option value="__all__">All assignees</option>
        {assignees.map((a) => (
          <option key={a} value={a}>
            {short(a)}
          </option>
        ))}
      </select>
    </span>
  );
}

// ---------------------------------------------------------------------------
// New-item form (the "New" button → in-app create, replacing window.prompt)
// ---------------------------------------------------------------------------

/** The types a human can create from the board (epics are planning-owned). */
const CREATABLE_TYPES: BacklogItem['type'][] = ['task', 'bug', 'debt', 'spike', 'hotfix'];

const fieldStyle: CSSProperties = {
  width: '100%',
  background: 'var(--panel)',
  border: '1px solid var(--border-strong)',
  borderRadius: 7,
  color: 'var(--fg)',
  font: 'inherit',
  fontSize: 13,
  padding: '8px 10px',
  outline: 'none',
};

/**
 * Create-item form rendered inside the board Drawer. Posts to /api/backlog and
 * seeds `version` from the board's active filter so the new card lands in the
 * column the user is looking at (not hidden behind a version filter).
 */
function NewItemForm({
  epics,
  versions,
  defaultVersion,
  defaultEpic,
  onCreated,
  onClose,
}: {
  epics: BacklogItem[];
  versions: string[];
  defaultVersion: string | null;
  defaultEpic: string | null;
  onCreated: () => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<BacklogItem['type']>('task');
  const [title, setTitle] = useState('');
  const [parentId, setParentId] = useState<string>(defaultEpic ?? '');
  const [version, setVersion] = useState<string>(defaultVersion ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Give the item a title.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPost('/api/backlog', {
        type,
        title: trimmed,
        parent_id: parentId || undefined,
        version: version || undefined,
      });
      onCreated();
      onClose();
    } catch {
      setError('Could not create the item.');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="dr-head">
        <span className="dr-title" style={{ fontSize: 15, margin: 0 }}>
          New item
        </span>
        <span className="dr-x" onClick={onClose} style={{ marginLeft: 'auto' }}>
          <X style={{ width: 16, height: 16 }} />
        </span>
      </div>

      <div className="dr-body">
        <label className="dr-sec" htmlFor="ni-type">
          Type
        </label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {CREATABLE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`pill${type === t ? ' is-active' : ''}`}
              style={
                type === t
                  ? { color: TYPE_META[t].color, background: rgba(TYPE_META[t].color, 0.14), borderColor: rgba(TYPE_META[t].color, 0.5) }
                  : undefined
              }
              onClick={() => setType(t)}
            >
              <span className="d" style={{ background: TYPE_META[t].color, width: 6, height: 6, borderRadius: 3 }} />
              {TYPE_META[t].label}
            </button>
          ))}
        </div>

        <label className="dr-sec" htmlFor="ni-title">
          Title
        </label>
        <input
          id="ni-title"
          autoFocus
          value={title}
          placeholder="What needs doing?"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
          style={{ ...fieldStyle, marginBottom: 16 }}
        />

        <label className="dr-sec" htmlFor="ni-epic">
          Epic <span style={{ color: 'var(--fg-faint)', textTransform: 'none' }}>· optional</span>
        </label>
        <select
          id="ni-epic"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          style={{ ...fieldStyle, marginBottom: 16, cursor: 'pointer' }}
        >
          <option value="">No epic</option>
          {epics.map((ep) => (
            <option key={ep.id} value={ep.id}>
              {ep.id} · {ep.title}
            </option>
          ))}
        </select>

        {versions.length > 0 && (
          <>
            <label className="dr-sec" htmlFor="ni-version">
              Version <span style={{ color: 'var(--fg-faint)', textTransform: 'none' }}>· optional</span>
            </label>
            <select
              id="ni-version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              style={{ ...fieldStyle, cursor: 'pointer' }}
            >
              <option value="">No version</option>
              {versions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </>
        )}

        {error && (
          <div className="dr-block" style={{ marginTop: 16 }}>
            {error}
          </div>
        )}
      </div>

      <div className="dr-foot">
        <button className="btn btn-line btn-sm" style={{ flex: 1 }} disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-pri btn-sm" style={{ flex: 1 }} disabled={busy} onClick={() => void submit()}>
          <Plus style={{ width: 13, height: 13 }} />
          Create
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Board route
// ---------------------------------------------------------------------------

type DrawerTarget = { kind: 'item' | 'epic'; id: string };

export function BoardRoute() {
  // The board needs the WHOLE set to bucket columns + roll up epics, so it asks
  // for a high limit (the default 100 would drop the oldest items — the epics,
  // created first in planning). True pagination is a separate follow-up.
  const { data, refresh } = usePolling<{ items: BacklogItem[]; total: number }>('/api/backlog?limit=2000', 5000);
  const items = useMemo(() => data?.items ?? [], [data]);

  const [filterEpic, setFilterEpic] = useState<string | null>(null);
  // `undefined` = not yet chosen → fall back to the smallest unfinished version;
  // once the user picks (a version, or `null` for "all") their choice sticks
  // across polls.
  const [versionChoice, setVersionChoice] = useState<string | null | undefined>(undefined);
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [target, setTarget] = useState<DrawerTarget | null>(null);
  const [creating, setCreating] = useState(false);

  const versions = useMemo(() => sortedVersions(items), [items]);
  const assignees = useMemo(() => assigneesOf(items), [items]);
  const activeVersion =
    versionChoice === undefined ? defaultActiveVersion(items) : versionChoice;

  const epics = useMemo(() => items.filter((it) => it.type === 'epic'), [items]);
  const columns = useMemo(() => {
    const cols = boardColumns(items);
    return cols.map((c) => ({
      ...c,
      cards: c.cards.filter(
        (card) =>
          (!filterEpic || card.parent_id === filterEpic) &&
          (!activeVersion || card.version === activeVersion) &&
          (!assigneeFilter || assigneeOf(card) === assigneeFilter),
      ),
    }));
  }, [items, filterEpic, activeVersion, assigneeFilter]);

  const visibleCount = columns.reduce((n, c) => n + c.cards.length, 0);

  // The drawer reads its target straight from the live list, so board polling
  // and post-mutation refreshes keep it in sync without a separate fetch.
  const openItem = target?.kind === 'item' ? items.find((it) => it.id === target.id) ?? null : null;
  const openEpic = target?.kind === 'epic' ? items.find((it) => it.id === target.id) ?? null : null;

  function openCreate() {
    setTarget(null);
    setCreating(true);
  }

  return (
    <section className="board-wrap">
      <div className="page-h">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="page-title">Board</span>
          <span className="page-sub">
            {data?.total != null && data.total !== items.length
              ? `${items.length} / ${data.total} gösteriliyor`
              : `${visibleCount} items`}
            {activeVersion && (
              <>
                {' · '}
                <span style={{ color: 'var(--accent-hi)' }}>{activeVersion}</span>
              </>
            )}
            {assigneeFilter && (
              <>
                {' · '}
                <span style={{ color: 'var(--accent-hi)' }}>{short(assigneeFilter)}</span>
                <span
                  className="dr-x"
                  style={{ display: 'inline-flex', marginLeft: 4, verticalAlign: 'middle' }}
                  onClick={() => setAssigneeFilter(null)}
                  title="Clear assignee filter"
                >
                  <X style={{ width: 12, height: 12 }} />
                </span>
              </>
            )}
            {filterEpic && (
              <>
                {' · filter '}
                <span style={{ color: 'var(--accent-hi)' }}>{filterEpic}</span>
                <span
                  className="dr-x"
                  style={{ display: 'inline-flex', marginLeft: 4, verticalAlign: 'middle' }}
                  onClick={() => setFilterEpic(null)}
                  title="Clear filter"
                >
                  <X style={{ width: 12, height: 12 }} />
                </span>
              </>
            )}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          {versions.length > 0 && (
            <VersionSelect
              versions={versions}
              value={activeVersion}
              onChange={(v) => setVersionChoice(v)}
            />
          )}
          {assignees.length > 0 && (
            <AssigneeSelect
              assignees={assignees}
              value={assigneeFilter}
              onChange={(v) => setAssigneeFilter(v)}
            />
          )}
          <button className="btn btn-pri btn-sm" onClick={openCreate}>
            <Plus style={{ width: 13, height: 13 }} />
            New
          </button>
        </div>
      </div>

      <div className="board-scroll">
        <div className="board-row">
          <div className="epic-rail">
            <div className="col-h">
              <span className="dot" style={{ width: 6, height: 6, borderRadius: 2, background: 'var(--accent)' }} />
              <span className="col-name">Epics</span>
              <span className="col-count">{epics.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', flex: 1 }}>
              {epics.length === 0 ? (
                <div className="col-empty">No epics</div>
              ) : (
                epics.map((epic, i) => (
                  <EpicCard
                    key={epic.id}
                    epic={epic}
                    items={items}
                    index={i}
                    selected={filterEpic === epic.id}
                    onToggleFilter={() =>
                      setFilterEpic((cur) => (cur === epic.id ? null : epic.id))
                    }
                    onOpen={() => setTarget({ kind: 'epic', id: epic.id })}
                  />
                ))
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 11 }}>
            {columns.map((col) => (
              <div className="col" key={col.key}>
                <div className="col-h">
                  <span className="dot" style={{ background: col.color }} />
                  <span className="col-name">{col.name}</span>
                  <span className="col-count">{col.cards.length}</span>
                  <span className="col-add" onClick={openCreate}>
                    <Plus style={{ width: 13, height: 13 }} />
                  </span>
                </div>
                <div className="col-list">
                  {col.cards.length === 0 && <div className="col-empty">No items</div>}
                  {col.cards.map((card, i) => (
                    <Card
                      key={card.id}
                      item={card}
                      index={i}
                      onOpen={() => setTarget({ kind: 'item', id: card.id })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Drawer
        open={!!target || creating}
        onClose={() => {
          setTarget(null);
          setCreating(false);
        }}
      >
        {creating && (
          <NewItemForm
            epics={epics}
            versions={versions}
            defaultVersion={activeVersion}
            defaultEpic={filterEpic}
            onCreated={refresh}
            onClose={() => setCreating(false)}
          />
        )}
        {!creating && openItem && (
          <ItemDrawer item={openItem} onClose={() => setTarget(null)} onMutated={refresh} />
        )}
        {!creating && openEpic && (
          <EpicDrawer
            epic={openEpic}
            items={items}
            onClose={() => setTarget(null)}
            onOpenItem={(id) => setTarget({ kind: 'item', id })}
          />
        )}
      </Drawer>
    </section>
  );
}
