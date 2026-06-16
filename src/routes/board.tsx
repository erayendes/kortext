/**
 * Board (Session 3) — the v6 kanban board + item/epic detail drawer.
 *
 * Layout maps 1:1 to `wireframe-v6-hifi.html` → `.board-scroll`:
 *   [ epic-rail (filter) ] [ To do | In progress | 🔒 Blocked | Test | Review | Done ]
 *
 * Epics are NOT a status — they live in the left rail and act as a filter over
 * the columns. `blocked` has its OWN dedicated red column (UAT #10) so locked
 * items never read as "In progress"; the card keeps its red flag + dep count.
 * The column list is driven by BOARD_COLUMNS / columnKeyForStatus (board-drawer).
 * All data is real
 * (GET /api/backlog); mutations (AC toggle, status transitions) hit the live
 * endpoints and refresh both the board and the open drawer.
 *
 * The pure logic (column bucketing, gate derivation, blocked introspection)
 * lives in src/lib/board-drawer.ts and is unit-tested; this file is the wiring.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bot,
  Box,
  Check,
  Currency,
  ChevronDown,
  ListTree,
  SquareArrowOutUpRight,
  TextAlignStart,
  LaptopMinimalCheck,
  Link2,
  ListChecks,
  LockKeyhole,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  LayoutList,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Drawer } from '../components/v6/Drawer.tsx';
import { emitShell } from '../app/shell-events.ts';
import { apiGet, apiPost, formatElapsed, usePolling } from '../lib/api.ts';
import type { ActivityEntry, BacklogAggregate, BacklogItem, ItemUsage } from '../lib/api-types.ts';
import { personaPalette } from '../lib/persona-colors.ts';
import {
  acChecklist,
  assigneeOf,
  availableTransitions,
  boardColumns,
  childrenOf,
  compareVersions,
  defaultActiveVersionFromCounts,
  dependenciesOf,
  describeActivity,
  descriptionFromBody,
  epicProgress,
  isLocked,
  itemGates,
  previewLinkOf,
  statusBadge,
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

// Usage hook — fetch an item's token/cost rollup on demand (UAT #10 Faz 1).
function useItemUsage(itemId: string | null) {
  const [usage, setUsage] = useState<ItemUsage | null>(null);
  useEffect(() => {
    setUsage(null);
    if (!itemId) return;
    void apiGet<ItemUsage>(`/api/backlog/${itemId}/usage`)
      .then(setUsage)
      .catch(() => setUsage(null));
  }, [itemId]);
  return usage;
}

/** Compact token count: 12453 → "12.5K", 2_100_000 → "2.1M". */
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}
/** Dollar cost: <$0.01 keeps 4 decimals so tiny spends are visible. */
function fmtCost(usd: number): string {
  if (usd <= 0) return '—';
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Card (one task/bug/debt in a column)
// ---------------------------------------------------------------------------

/** "+backend-developer" → "bd" — two-letter avatar initials. */
function initialsOf(handle: string | null): string {
  const h = short(handle);
  const p = h.split('-');
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? p[0]?.[1] ?? '')).toLowerCase() || '?';
}

/** Item type → handoff status-flavour class (kc-type pill). */
const TYPE_FLAVOUR: Record<BacklogItem['type'], string> = {
  epic: 'violet',
  task: 'blue',
  bug: 'red',
  debt: 'amber',
  spike: 'blue',
  hotfix: 'red',
};

function KcType({ type }: { type: BacklogItem['type'] }) {
  return <span className={`kc-type s-${TYPE_FLAVOUR[type]}`}>{TYPE_META[type].label}</span>;
}

/** Status → board-column flavour (matches the dashboard "Item status" colours). */
const STATUS_FLAVOUR: Record<BacklogItem['status'], string> = {
  to_do: 'neutral',
  in_progress: 'amber',
  test: 'blue',
  review: 'violet',
  done: 'green',
  cancelled: 'neutral',
};

/** Handoff status pill — dot + label, coloured by column flavour. */
function StatusBadge({ status, style }: { status: BacklogItem['status']; style?: CSSProperties }) {
  return (
    <span className={`badge s-${STATUS_FLAVOUR[status]}`} style={style}>
      <span className="dot" />
      {statusBadge(status).label}
    </span>
  );
}

/** Project IDs carry a prefix on epics (NOT-E01); tasks/bugs don't. Strip it. */
const shortId = (id: string): string => id.replace(/^[A-Z]+-/, '');

/** A handoff `.dt-sec` block — uppercase icon header + body. */
function DtSec({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="dt-sec">
      <div className="dt-sec-h">
        <Icon className="ic" />
        {title}
      </div>
      {children}
    </div>
  );
}

/** A handoff `.dt-meta` row — label (dt-k) + value (dt-v), grid `display:contents`. */
function DtRow({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="dt-row">
      <span className="dt-k">{k}</span>
      <span className="dt-v">{children}</span>
    </div>
  );
}

/** Test-URL value — a link, or a faint placeholder so the row shows even empty. */
function TestUrlValue({ url }: { url: string | null }) {
  return url ? (
    <a className="dt-mlink truncate" href={url} target="_blank" rel="noopener noreferrer" title={url}>
      <SquareArrowOutUpRight className="ic" />
      <span className="truncate">{url}</span>
    </a>
  ) : (
    <span className="dt-mlink" style={{ color: 'var(--fg-faint)' }}>
      <SquareArrowOutUpRight className="ic" />
      No test URL
    </span>
  );
}

/** A clickable child / dependency row (handoff `dtItemRow`). */
function DtItem({ item, onOpen }: { item: BacklogItem; onOpen: (id: string) => void }) {
  return (
    <button className="dt-item" onClick={() => onOpen(item.id)}>
      <span className="dt-item-id mono faint">{shortId(item.id)}</span>
      <span className="dt-item-t truncate">{item.title}</span>
      <StatusBadge status={item.status} style={{ marginLeft: 'auto', flex: 'none' }} />
    </button>
  );
}

/**
 * Tabbed Activity / Comments feed (handoff `dtFeed`). Activity is the real audit
 * trail; the comment box posts a real `+prime` comment. A dot marks the Comments
 * tab when the item already has comments in the activity stream.
 */
function DtFeed({
  activity,
  comment,
  setComment,
  onSend,
  busy,
}: {
  activity: ActivityEntry[];
  comment: string;
  setComment: (v: string) => void;
  onSend: () => void;
  busy: boolean;
}) {
  const [tab, setTab] = useState<'activity' | 'comments'>('activity');
  const isComment = (e: ActivityEntry) => e.action === 'item_comment';
  const commentText = (e: ActivityEntry) =>
    typeof e.payload.text === 'string' ? e.payload.text : describeActivity(e);
  const comments = activity.filter(isComment);
  const acts = activity.filter((e) => !isComment(e));
  return (
    <div className="dt-feed">
      <div className="dt-tabs" role="tablist">
        <button className={`dt-tab${tab === 'activity' ? ' on' : ''}`} onClick={() => setTab('activity')}>
          <Activity className="ic" />
          Activity
        </button>
        <button className={`dt-tab${tab === 'comments' ? ' on' : ''}`} onClick={() => setTab('comments')}>
          <MessageCircle className="ic" />
          Comments
          {comments.length > 0 && <span className="dt-tab-dot" />}
        </button>
      </div>

      {tab === 'activity' ? (
        acts.length === 0 ? (
          <div className="dt-empty">No activity yet.</div>
        ) : (
          <div className="dt-acts">
            {acts.map((e) => (
              <div className="dt-act" key={e.id}>
                <span className="dt-act-dot" />
                <div className="dt-act-main">
                  {describeActivity(e)}
                  <div className="dt-act-t mono">{formatElapsed(e.created_at)} ago</div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="dt-comments">
            {comments.length === 0 ? (
              <div className="dt-empty">No comments yet.</div>
            ) : (
              comments.map((e) => (
                <div className="dt-cmt" key={e.id}>
                  <Avatar handle={e.actor} size={24} />
                  <div className="dt-cmt-main">
                    <div className="dt-cmt-h">
                      <span className="mono dt-cmt-who">{e.actor ? `+${short(e.actor)}` : '+prime'}</span>
                      <span className="dt-cmt-t mono">{formatElapsed(e.created_at)} ago</span>
                    </div>
                    <div className="dt-cmt-tx">{commentText(e)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="dt-cmt-input">
            <textarea
              rows={1}
              value={comment}
              placeholder="Comment as +prime…"
              disabled={busy}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
            />
            <button className="btn btn-icon btn-sm btn-primary" disabled={busy || !comment.trim()} onClick={onSend}>
              <Send style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Monospace agent token with a square initials avatar (handoff `agentToken`).
 *  Falls back to a muted "unassigned" chip when an item has no owner. */
function CardAgent({ handle }: { handle: string | null }) {
  if (!handle) {
    return (
      <span className="agent" style={{ color: 'var(--fg-faint)' }}>
        <span className="kc-ava">·</span>
        unassigned
      </span>
    );
  }
  const { color } = personaPalette(handle);
  return (
    <span className="agent">
      <span className="kc-ava" style={{ ['--ava']: color } as CSSProperties}>
        {initialsOf(handle)}
      </span>
      +{short(handle)}
    </span>
  );
}

/** The card's quality-gate row — the item's real gates as handoff gate badges. */
function GateBadges({ item }: { item: BacklogItem }) {
  const gates = itemGates(item);
  if (gates.length === 0) return null;
  return (
    <span className="gates">
      {gates.map((g) => (
        <span
          key={g.gate}
          className={`gate ${g.state === 'passed' ? 'g-pass' : 'g-todo'}`}
          title={`${g.label} · ${g.state}`}
        >
          {g.abbr}
        </span>
      ))}
    </span>
  );
}

function Card({
  item,
  byId,
  onOpen,
}: {
  item: BacklogItem;
  byId: Map<string, BacklogItem>;
  onOpen: () => void;
}) {
  // UAT #10: a dependency lock is DERIVED — the card stays in its status column
  // with a 🔒 overlay + dimmed style (the handoff has no Blocked column).
  const locked = isLocked(item, byId);
  const deps = dependenciesOf(item).blockedBy;
  const gates = itemGates(item);
  const showFoot = deps.length > 0 || gates.length > 0;
  return (
    <div
      className="kcard"
      data-item={item.id}
      data-type={item.type}
      onClick={onOpen}
      style={{
        ...(item.status === 'done' ? { opacity: 0.62 } : {}),
        ...(locked ? { opacity: 0.6 } : {}),
      }}
    >
      <div
        className="kc-top flex items-center"
        style={{ justifyContent: 'space-between', marginBottom: 7 }}
      >
        <KcType type={item.type} />
        <span className="flex items-center" style={{ gap: 6 }}>
          {locked && (
            <LockKeyhole
              style={{ width: 13, height: 13, color: 'var(--amber)' }}
              aria-label="Locked — waiting on a dependency"
            />
          )}
          <span className="badge badge-square kc-id mono" style={{ fontSize: 11 }}>
            {item.id}
          </span>
        </span>
      </div>
      <div className="kc-title">{item.title}</div>
      <div className="kc-bot flex items-center" style={{ marginTop: 10 }}>
        <CardAgent handle={assigneeOf(item)} />
      </div>
      {showFoot && (
        <div className="kc-foot">
          {deps.length > 0 && (
            <span className="kc-deps" title={`${deps.length} dependencies`}>
              <Link2 className="ic" />
              {deps.length}
            </span>
          )}
          <GateBadges item={item} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Epic rail card (filter)
// ---------------------------------------------------------------------------

function EpicCard({
  epic,
  progress,
  onOpen,
}: {
  epic: BacklogItem;
  /** Pre-computed progress from the aggregate (total/done/pct). */
  progress: { total: number; done: number; pct: number };
  onOpen: () => void;
}) {
  const { total, done, pct } = progress;
  // Epics carry the project prefix (e.g. NOT-E01); tasks/bugs don't. Strip it so
  // the badge reads "E01" — consistent with the bare "T10" task badges.
  const shortId = epic.id.replace(/^[A-Z]+-/, '');
  return (
    <div className="kcard ecard" data-item={epic.id} data-type="epic" onClick={onOpen}>
      <div
        className="kc-top flex items-center"
        style={{ justifyContent: 'space-between', marginBottom: 9 }}
      >
        <KcType type="epic" />
        <span className="badge badge-square kc-id mono" style={{ fontSize: 11 }}>
          {shortId}
        </span>
      </div>
      <div className="kc-title">{epic.title}</div>
      {/* Persona directly under the title, matching the task cards' layout. */}
      <div className="kc-bot flex items-center" style={{ marginTop: 10 }}>
        <CardAgent handle={assigneeOf(epic)} />
      </div>
      <div className="progress thin" style={{ marginTop: 10 }}>
        <span style={{ width: `${pct}%` }} />
      </div>
      {/* Counts row: done/total left, percent right, on the same line. */}
      <div
        className="flex items-center"
        style={{ justifyContent: 'space-between', marginTop: 8 }}
      >
        <span className="mono faint" style={{ fontSize: 11 }}>
          {done}/{total}
        </span>
        <span className="mono faint" style={{ fontSize: 11 }}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item detail drawer body + footer
// ---------------------------------------------------------------------------

export function ItemDrawer({
  item,
  byId,
  onClose,
  onMutated,
  onOpenItem,
}: {
  item: BacklogItem;
  byId: Map<string, BacklogItem>;
  onClose: () => void;
  onMutated: () => void;
  /** Open another item (a dependency) in the same drawer. Falls back to the
   *  global open-item event when the host doesn't provide one. */
  onOpenItem?: (id: string) => void;
}) {
  const { activity, reload: reloadActivity } = useActivity(item.id);
  const usage = useItemUsage(item.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  const ac = acChecklist(item.frontmatter);
  const gates = itemGates(item);
  const deps = dependenciesOf(item);
  // UAT #10: the lock is DERIVED — the item keeps its real status; we overlay a
  // lock banner listing the still-open blockers.
  const locked = isLocked(item, byId);
  const previewUrl = previewLinkOf(item);

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
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/backlog/${item.id}/transition`, { action });
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

  const desc = descriptionFromBody(item.body_md);
  const parentEpic = item.parent_id ? byId.get(item.parent_id) : undefined;
  const blockedItems = deps.blockedBy
    .map((id) => byId.get(id))
    .filter((x): x is BacklogItem => Boolean(x));
  // Open a dependency inside whichever drawer is hosting us; fall back to the
  // global open-item event when no host handler is supplied.
  const openDep = onOpenItem ?? ((id: string) => emitShell('open-item', { id }));

  return (
    <>
      <div className="dr-body">
        <div className="dt-titlerow">
          <span className="badge badge-square mono" style={{ fontSize: 11 }}>
            {item.id}
          </span>
          <h2 className="dt-title">{item.title}</h2>
          <span className="dr-x" style={{ marginLeft: 'auto' }} onClick={onClose}>
            <X style={{ width: 16, height: 16 }} />
          </span>
        </div>

        <div className="dt-meta">
          <DtRow k="Type">
            <KcType type={item.type} />
          </DtRow>
          <DtRow k="Status">
            <StatusBadge status={item.status} />
            {locked && (
              <span
                style={{ color: 'var(--amber)', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
              >
                <LockKeyhole style={{ width: 11, height: 11 }} /> locked
              </span>
            )}
          </DtRow>
          <DtRow k="Assignee">
            <CardAgent handle={assigneeOf(item)} />
          </DtRow>
          {item.parent_id && (
            <DtRow k="Epic">
              <button className="dt-link truncate" onClick={() => openDep(item.parent_id!)}>
                {shortId(item.parent_id)}
                {parentEpic ? ` · ${parentEpic.title}` : ''}
              </button>
            </DtRow>
          )}
          {item.version && (
            <DtRow k="Version">
              <span className="badge badge-square mono" style={{ fontSize: 11 }}>
                {item.version}
              </span>
            </DtRow>
          )}
          <DtRow k="Test URL">
            <TestUrlValue url={previewUrl} />
          </DtRow>
        </div>

        {desc && (
          <DtSec title="Description" icon={TextAlignStart}>
            <p className="dt-desc">{desc}</p>
          </DtSec>
        )}

        <DtSec title="Dependencies" icon={Link2}>
          {blockedItems.length > 0 ? (
            <div className="dt-items">
              {blockedItems.map((d) => (
                <DtItem key={d.id} item={d} onOpen={openDep} />
              ))}
            </div>
          ) : (
            <div className="dt-empty">No dependencies</div>
          )}
        </DtSec>

        {ac.length > 0 && (
          <DtSec title="Acceptance criteria" icon={ListChecks}>
            <ul className="dt-ac">
              {ac.map((c, i) => (
                <li
                  key={i}
                  className={c.done ? 'done' : ''}
                  style={{ cursor: 'pointer' }}
                  onClick={() => toggleAc(i, !c.done)}
                >
                  <span className="dt-check">{c.done && <Check className="ic" />}</span>
                  {c.text}
                </li>
              ))}
            </ul>
          </DtSec>
        )}

        {gates.length > 0 && (
          <DtSec title="Gates" icon={LayoutList}>
            <div className="dt-gates">
              {gates.map((g) => {
                const passed = g.state === 'passed';
                return (
                  <div className="dt-gate" key={g.gate}>
                    <span className={`gate g-${passed ? 'pass' : 'todo'}`}>{g.abbr}</span>
                    <span className="dt-gate-l">{g.label}</span>
                    <span className={`dt-gate-s${passed ? ' pass' : ''}`}>{passed ? 'passed' : 'pending'}</span>
                  </div>
                );
              })}
            </div>
          </DtSec>
        )}

        {usage && usage.total.input_tokens + usage.total.output_tokens > 0 && (
          <DtSec title="Token / maliyet" icon={Currency}>
            <div className="dt-gate" style={{ marginBottom: 8 }}>
              <span className="dt-gate-l">
                Toplam · {fmtTokens(usage.total.input_tokens + usage.total.output_tokens)} tok
              </span>
              <span className="dt-gate-s">{fmtCost(usage.total.total_cost_usd)}</span>
            </div>
            <div className="dt-gate" style={{ marginBottom: 8 }}>
              <span className="dt-gate-l">Kodlama (dev-cycle)</span>
              <span className="dt-gate-s">
                {fmtTokens(usage.coding.input_tokens + usage.coding.output_tokens)} tok ·{' '}
                {fmtCost(usage.coding.total_cost_usd)}
              </span>
            </div>
            {usage.gates.map((g, i) => (
              <div className="dt-gate" style={{ marginBottom: 8 }} key={`${g.gate}-${g.attempt}-${i}`}>
                <span className="dt-gate-l">
                  {g.gate.replace(/_/g, ' ')} · deneme {g.attempt}
                </span>
                <span className="dt-gate-s">
                  {g.usage
                    ? `${fmtTokens((g.usage.input_tokens ?? 0) + (g.usage.output_tokens ?? 0))} tok · ${fmtCost(g.usage.total_cost_usd ?? 0)}`
                    : '—'}
                </span>
              </div>
            ))}
            {usage.total.cache_read_input_tokens > 0 && (
              <p className="dt-desc" style={{ marginTop: 6, fontSize: 11 }}>
                Cache okuma: {fmtTokens(usage.total.cache_read_input_tokens)} tok — prompt-cache
                tasarrufu (tam fiyat ödenmedi)
              </p>
            )}
          </DtSec>
        )}

        <DtFeed
          activity={activity}
          comment={comment}
          setComment={setComment}
          onSend={() => void postComment()}
          busy={busy}
        />

        {error && <div className="dr-block">{error}</div>}
      </div>

      {moves.length > 0 && (
        <div className="dr-foot">
          {secondary.map((m) => (
            <button
              key={m.action}
              className="btn btn-sm btn-secondary"
              style={{ flex: 1 }}
              disabled={busy}
              onClick={() => transition(m.action)}
            >
              {m.action === 'bounce' && <ArrowLeft style={{ width: 13, height: 13 }} />}
              {m.label}
            </button>
          ))}
          {primary && (
            <button
              key={primary.action}
              className="btn btn-sm btn-primary"
              style={{ flex: 1 }}
              disabled={busy}
              onClick={() => transition(primary.action)}
            >
              {primary.label}
              <ArrowRight style={{ width: 13, height: 13 }} />
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
  progress,
  onOpenItem,
  onClose,
}: {
  epic: BacklogItem;
  items: BacklogItem[];
  /** Total/done/pct from the aggregate roll-up — matches the rail EpicCard
   *  (which also reads the aggregate), not the paginated `items` list. */
  progress: { total: number; done: number; pct: number };
  onOpenItem: (id: string) => void;
  onClose: () => void;
}) {
  // Children LIST stays from the loaded cards (bounded; resolves on load-more);
  // only the progress total/done/pct come from the aggregate so the percentage
  // agrees with the rail card.
  const kids = childrenOf(items, epic.id);
  const { total, done, pct } = progress;
  const desc = descriptionFromBody(epic.body_md);
  const previewUrl = previewLinkOf(epic);
  // Epics carry the same audit feed (activity + comments) as items.
  const { activity, reload: reloadActivity } = useActivity(epic.id);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');

  async function postComment() {
    const text = comment.trim();
    if (busy || !text) return;
    setBusy(true);
    try {
      await apiPost(`/api/backlog/${epic.id}/comment`, { text });
      setComment('');
      reloadActivity();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="dr-body">
        <div className="dt-titlerow">
          <span className="badge badge-square mono" style={{ fontSize: 11 }}>
            {shortId(epic.id)}
          </span>
          <h2 className="dt-title">{epic.title}</h2>
          <span className="dr-x" style={{ marginLeft: 'auto' }} onClick={onClose}>
            <X style={{ width: 16, height: 16 }} />
          </span>
        </div>

        <div className="dt-meta">
          <DtRow k="Type">
            <KcType type="epic" />
          </DtRow>
          <DtRow k="Status">
            <StatusBadge status={epic.status} />
          </DtRow>
          <DtRow k="Assignee">
            <CardAgent handle={assigneeOf(epic)} />
          </DtRow>
          {epic.version && (
            <DtRow k="Version">
              <span className="badge badge-square mono" style={{ fontSize: 11 }}>
                {epic.version}
              </span>
            </DtRow>
          )}
          <DtRow k="Test URL">
            <TestUrlValue url={previewUrl} />
          </DtRow>
        </div>

        <div className="dt-prog">
          <div className="progress">
            <span style={{ width: `${pct}%` }} />
          </div>
          <span className="mono faint" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
            {done} / {total} · {pct}%
          </span>
        </div>

        {desc && (
          <DtSec title="Description" icon={TextAlignStart}>
            <p className="dt-desc">{desc}</p>
          </DtSec>
        )}

        <DtSec title="Child items" icon={ListTree}>
          {kids.length === 0 ? (
            <div className="dt-empty">No items</div>
          ) : (
            <div className="dt-items">
              {kids.map((k) => (
                <DtItem key={k.id} item={k} onOpen={onOpenItem} />
              ))}
            </div>
          )}
        </DtSec>

        <DtFeed
          activity={activity}
          comment={comment}
          setComment={setComment}
          onSend={() => void postComment()}
          busy={busy}
        />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Version selector (Board filter · UAT §A)
// ---------------------------------------------------------------------------

/**
 * Board filter — a native <select> styled as the handoff `.fbtn` button (icon +
 * label + value + chevron). `value=null` = "all". Keeps keyboard accessibility.
 */
function Fbtn({
  icon: Icon,
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
  allLabel: string;
  options: { value: string; label: string }[];
  onChange: (v: string | null) => void;
}) {
  return (
    <span className={`fbtn${value !== null ? ' active' : ''}`}>
      <Icon className="ic" />
      <span className="fbtn-k">{label}</span>
      <select
        value={value ?? '__all__'}
        onChange={(e) => onChange(e.target.value === '__all__' ? null : e.target.value)}
        title={`Filter by ${label.toLowerCase()}`}
      >
        <option value="__all__">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="ic chev" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// New-item form (the "New" button → in-app create, replacing window.prompt)
// ---------------------------------------------------------------------------

/** The types a human can create from the board (task / bug / debt only —
 * epic/spike/hotfix are not user-facing item types). */
const CREATABLE_TYPES: BacklogItem['type'][] = ['task', 'bug', 'debt'];

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
        <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled={busy} onClick={() => void submit()}>
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

/** Page size for the paginated card list. */
const CARD_PAGE_SIZE = 100;

export function BoardRoute() {
  // ── Aggregate poll: epics, epicProgress, versions, assignees, total ─────────
  // Replaces the old ?limit=2000 full-fetch for all whole-set consumers.
  const { data: aggData, refresh: refreshAgg } = usePolling<BacklogAggregate>(
    '/api/backlog/aggregate',
    5000,
  );

  // ── Paginated card list ──────────────────────────────────────────────────────
  // "items" is a growing window of non-epic cards. We start with one page and
  // append via "Daha fazla yükle". On any refresh (mutation / poll) we re-fetch
  // the same window size so existing cards update in place.
  const [cardOffset, setCardOffset] = useState(0);
  const [cards, setCards] = useState<BacklogItem[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);

  // Build the card-fetch URL (no type filter — server omits epics if we send
  // type=task; simplest approach: fetch all non-epic types by loading without
  // a type filter and bucketing on the client, same as before, just paginated).
  const cardUrl = useMemo(
    () => `/api/backlog?limit=${cardOffset + CARD_PAGE_SIZE}&offset=0`,
    [cardOffset],
  );

  // Initial load + refresh after mutations
  const fetchCards = useCallback(async () => {
    setCardsLoading(true);
    try {
      const res = await apiGet<{ items: BacklogItem[]; total: number }>(cardUrl);
      setCards(res.items);
    } catch {
      // keep stale cards on error
    } finally {
      setCardsLoading(false);
    }
  }, [cardUrl]);

  // Fetch on mount and whenever cardUrl changes (load-more bumps cardOffset)
  useEffect(() => {
    void fetchCards();
  }, [fetchCards]);

  function refresh() {
    void fetchCards();
    refreshAgg();
  }

  function loadMore() {
    setCardOffset((prev) => prev + CARD_PAGE_SIZE);
  }

  // ── Derived data from aggregate ─────────────────────────────────────────────
  const epics = useMemo(() => aggData?.epics ?? [], [aggData]);
  // Versions from server are already distinct; re-sort with the numeric comparator.
  const versions = useMemo(
    () => [...(aggData?.versions ?? [])].sort(compareVersions),
    [aggData],
  );
  const assignees = useMemo(() => aggData?.assignees ?? [], [aggData]);
  const total = aggData?.total ?? 0;

  // EpicCard progress: derive pct from aggregate, fall back to epicProgress()
  // on loaded cards when a child's epic_id is not yet in the aggregate map.
  const epicProgressMap = useMemo(() => aggData?.epicProgress ?? {}, [aggData]);

  function epicProgressFor(epicId: string): { total: number; done: number; pct: number } {
    const agg = epicProgressMap[epicId];
    if (agg) {
      const pct = agg.total > 0 ? Math.round((agg.done / agg.total) * 100) : 0;
      return { ...agg, pct };
    }
    // Fallback for epics not yet in the aggregate (e.g. brand new / childless)
    return epicProgress(cards, epicId);
  }

  // ── Filter state ─────────────────────────────────────────────────────────────
  // Epics are a board COLUMN now (handoff), not a rail filter — so there is no
  // filter-by-epic; Type / Agent / Version are the three filters.
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  // `undefined` = not yet chosen → fall back to first version with open work
  // (derived from the loaded cards; bounded: picks first unfinished version
  // from the aggregate list on initial load, which matches the old behaviour
  // once a page of cards is loaded).
  const [versionChoice, setVersionChoice] = useState<string | null | undefined>(undefined);
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [target, setTarget] = useState<DrawerTarget | null>(null);
  const [creating, setCreating] = useState(false);

  // Default active version: smallest version with open (non-done/cancelled)
  // non-epic work, derived from the AGGREGATE's per-version counts — correct on
  // the first aggregate load, before any cards arrive (removes the flicker).
  // The user's explicit `versionChoice` (incl. the "All versions" null) wins.
  const openByVersion = useMemo(() => aggData?.openByVersion ?? {}, [aggData]);
  const activeVersion = useMemo(() => {
    if (versionChoice !== undefined) return versionChoice;
    return defaultActiveVersionFromCounts(openByVersion);
  }, [versionChoice, openByVersion]);

  // Lookup over all loaded cards — feeds the derived dependency-lock (UAT #10)
  // so cards/drawers can tell whether an item is waiting on an open blocker.
  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  // ── Column bucketing from loaded cards ───────────────────────────────────────
  const columns = useMemo(() => {
    const cols = boardColumns(cards);
    return cols.map((c) => ({
      ...c,
      cards: c.cards.filter(
        (card) =>
          (!typeFilter || card.type === typeFilter) &&
          (!activeVersion || card.version === activeVersion) &&
          (!assigneeFilter || assigneeOf(card) === assigneeFilter),
      ),
    }));
  }, [cards, typeFilter, activeVersion, assigneeFilter]);

  // Epics are their own column; the Type filter (non-epic) and Version filter
  // narrow it too (Agent filter is owner-scoped and doesn't gate epics).
  const shownEpics = useMemo(
    () =>
      epics.filter(
        (e) =>
          (!typeFilter || typeFilter === 'epic') &&
          // epics are version-spanning: a null-version epic always shows; a
          // versioned epic only under its version (or "All versions").
          (!activeVersion || !e.version || e.version === activeVersion),
      ),
    [epics, typeFilter, activeVersion],
  );

  // `anyFilter` drives the Clear button — true whenever the user has made an
  // explicit choice they can reset (incl. picking "All versions", which differs
  // from the default version scope).
  const anyFilter = typeFilter !== null || assigneeFilter !== null || versionChoice !== undefined;
  // The Epics column renders `shownEpics`, so it must count toward what's
  // "shown" — otherwise the numerator excludes epics while `total` includes
  // them (the 12-of-14 mismatch).
  const visibleCount = columns.reduce((n, c) => n + c.cards.length, 0) + shownEpics.length;
  // "filtered" is shown only when the view is genuinely a subset: a specific
  // version is active (default or explicit) or a type/agent filter is on.
  // "All versions" with no other filter is NOT filtered.
  const isNarrowed = typeFilter !== null || assigneeFilter !== null || activeVersion != null;
  const loadedCount = cardOffset + CARD_PAGE_SIZE;
  const hasMore = loadedCount < total;

  // Drawer targets from loaded cards
  const openItem = target?.kind === 'item' ? cards.find((it) => it.id === target.id) ?? null : null;
  const openEpic = target?.kind === 'epic' ? epics.find((it) => it.id === target.id) ?? null : null;

  function openCreate() {
    setTarget(null);
    setCreating(true);
  }

  const colFlav = (k: string): string =>
    ({ to_do: 'neutral', in_progress: 'amber', test: 'blue', review: 'violet', done: 'green' })[k] ??
    'neutral';
  const headBadge: CSSProperties = {
    border: 0,
    background: 'transparent',
    padding: 0,
    gap: 7,
    fontWeight: 600,
  };

  return (
    <div className="full">
      <header className="pg-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <h1 className="pg-title">Board</h1>
            <button className="icon-btn" onClick={refresh} title="Refresh">
              <RefreshCw className="ic" />
            </button>
          </div>
          <p className="pg-sub">
            {total > 0 ? `${visibleCount} of ${total} items shown` : `${visibleCount} items`}
            {activeVersion && (
              <>
                {' · '}
                <span style={{ color: 'var(--accent)' }}>{activeVersion}</span>
              </>
            )}
            {isNarrowed ? ' · filtered' : ''}
          </p>
        </div>
      </header>

      <div className="board-actions">
        <Fbtn
          icon={LaptopMinimalCheck}
          label="Type"
          allLabel="All types"
          value={typeFilter}
          options={[
            { value: 'task', label: 'Task' },
            { value: 'bug', label: 'Bug' },
            { value: 'debt', label: 'Debt' },
          ]}
          onChange={setTypeFilter}
        />
        <Fbtn
          icon={Bot}
          label="Agent"
          allLabel="All agents"
          value={assigneeFilter}
          options={assignees.map((a) => ({ value: a, label: short(a) }))}
          onChange={setAssigneeFilter}
        />
        <Fbtn
          icon={Box}
          label="Version"
          allLabel="All versions"
          value={activeVersion}
          options={versions.map((v) => ({ value: v, label: v }))}
          onChange={(v) => setVersionChoice(v)}
        />
        {anyFilter && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setTypeFilter(null);
              setAssigneeFilter(null);
              setVersionChoice(null);
            }}
          >
            <X style={{ width: 13, height: 13 }} />
            Clear
          </button>
        )}
        <button
          className="btn btn-sm btn-primary"
          style={{ marginLeft: 'auto' }}
          onClick={openCreate}
        >
          <Plus style={{ width: 13, height: 13 }} />
          New
        </button>
      </div>

      <div className="board kx-scroll" data-kcard="default">
        {/* Epics column */}
        <div className="kcol">
          <div className="kcol-head">
            <span className="badge s-neutral" style={headBadge}>
              <span className="dot" />
              Epics
            </span>
            <span className="kcol-count mono">{shownEpics.length}</span>
          </div>
          <div className="kcol-body kx-scroll">
            {shownEpics.length === 0 ? (
              <div className="kcol-empty">No items</div>
            ) : (
              shownEpics.map((epic) => (
                <EpicCard
                  key={epic.id}
                  epic={epic}
                  progress={epicProgressFor(epic.id)}
                  onOpen={() => setTarget({ kind: 'epic', id: epic.id })}
                />
              ))
            )}
          </div>
        </div>

        {/* Status columns */}
        {columns.map((col) => (
          <div className="kcol" key={col.key}>
            <div className="kcol-head">
              <span className={`badge s-${colFlav(col.key)}`} style={headBadge}>
                <span className="dot" />
                {col.name}
              </span>
              <span className="kcol-count mono">{col.cards.length}</span>
            </div>
            <div className="kcol-body kx-scroll">
              {col.cards.length === 0 ? (
                <div className="kcol-empty">No items</div>
              ) : (
                col.cards.map((card) => (
                  <Card
                    key={card.id}
                    item={card}
                    byId={cardsById}
                    onOpen={() => setTarget({ kind: 'item', id: card.id })}
                  />
                ))
              )}
              {hasMore && col.key === 'done' && (
                <button
                  className="btn btn-sm btn-secondary"
                  style={{ marginTop: 4, justifyContent: 'center' }}
                  disabled={cardsLoading}
                  onClick={loadMore}
                >
                  {cardsLoading ? 'Loading…' : 'Load more'}
                </button>
              )}
            </div>
          </div>
        ))}
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
            defaultEpic={null}
            onCreated={refresh}
            onClose={() => setCreating(false)}
          />
        )}
        {!creating && openItem && (
          <ItemDrawer
            item={openItem}
            byId={cardsById}
            onClose={() => setTarget(null)}
            onMutated={refresh}
            onOpenItem={(id) => setTarget({ kind: 'item', id })}
          />
        )}
        {!creating && openEpic && (
          <EpicDrawer
            epic={openEpic}
            items={cards}
            progress={epicProgressFor(openEpic.id)}
            onClose={() => setTarget(null)}
            onOpenItem={(id) => setTarget({ kind: 'item', id })}
          />
        )}
      </Drawer>
    </div>
  );
}
