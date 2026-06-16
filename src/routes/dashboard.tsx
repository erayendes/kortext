/**
 * Dashboard (v6) — the project home screen.
 *
 * Layout mirrors wireframe-v6-hifi.html's `.dash`: a scrollable main column
 * (stats → active work → review queue) plus a fixed-width Activity timeline on
 * the right. Every section is wired to a real endpoint — the wireframe's baked
 * `EPICS`/`WORK`/`TL` arrays are replaced by `/api/backlog`, `/api/runs`,
 * `/api/questions`, `/api/handovers` and `/api/decisions`.
 *
 * Pure derivations (epic progress, status counts, run→pill, activity merge) are
 * exported so `tests/dashboard.web.test.tsx` can pin them without rendering.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { RefreshCw, Play, LockKeyhole, LockKeyholeOpen, X, Check, ListChecks, LayoutList, SquareArrowOutUpRight } from 'lucide-react';
import { usePolling, apiGet, apiPost } from '../lib/api.ts';
import type {
  ActivityEntry,
  BacklogAggregate,
  BacklogItem,
  DecisionIndex,
  Handover,
  Run,
} from '../lib/api-types.ts';
import { personaPalette } from '../lib/persona-colors.ts';
import {
  acChecklist,
  assigneeOf,
  descriptionFromBody,
  itemGates,
  statusBadge,
} from '../lib/board-drawer.ts';

// ───────────────────────── pure derivations (tested) ─────────────────────────

/** Runs that count as "active work" — same set the v3 RunsTable used. */
export const ACTIVE_RUN_STATUSES: Run['status'][] = [
  'queued',
  'running',
  'awaiting_approval',
];

/** Item-status bars — the wireframe's 5 canonical segments, in board order. */
export const STATUS_SEGMENTS: { status: BacklogItem['status']; label: string; color: string }[] = [
  { status: 'to_do', label: 'To do', color: '#7B7F87' },
  { status: 'in_progress', label: 'In progress', color: 'var(--amber)' },
  { status: 'test', label: 'Test', color: 'var(--blue)' },
  { status: 'review', label: 'Review', color: 'var(--violet)' },
  { status: 'done', label: 'Done', color: 'var(--green)' },
];

export type StatusBar = {
  label: string;
  color: string;
  n: number;
  /** Share of total, 0–100 (for the right-hand % readout). */
  pct: number;
  /** Width relative to the busiest segment, 0–100 (for the bar fill). */
  barPct: number;
};

/** Count items into the 5 canonical status bars. Unknown statuses are ignored. */
export function itemStatusBars(items: BacklogItem[]): { bars: StatusBar[]; total: number } {
  const counts = new Map<BacklogItem['status'], number>();
  for (const it of items) counts.set(it.status, (counts.get(it.status) ?? 0) + 1);
  const raw = STATUS_SEGMENTS.map((s) => ({ ...s, n: counts.get(s.status) ?? 0 }));
  const total = raw.reduce((a, s) => a + s.n, 0);
  const maxN = Math.max(1, ...raw.map((s) => s.n));
  const bars = raw.map((s) => ({
    label: s.label,
    color: s.color,
    n: s.n,
    pct: total === 0 ? 0 : Math.round((s.n / total) * 100),
    barPct: Math.round((s.n / maxN) * 100),
  }));
  return { bars, total };
}

export type EpicRow = { id: string; title: string; pct: number };

/**
 * Epic progress from child completion: pct = done children / total children.
 * Childless epics fall back to their own status (done → 100, else 0).
 */
export function epicProgressRows(items: BacklogItem[]): EpicRow[] {
  const epics = items.filter((i) => i.type === 'epic');
  return epics.map((epic) => {
    const children = items.filter((i) => i.parent_id === epic.id);
    let pct: number;
    if (children.length > 0) {
      const done = children.filter((c) => c.status === 'done').length;
      pct = Math.round((done / children.length) * 100);
    } else {
      pct = epic.status === 'done' ? 100 : 0;
    }
    return { id: epic.id, title: epic.title, pct };
  });
}

export type RunPill = { label: string; cls: string };

/** Map a run status to the wireframe's Live / Queued / Review / Blocked pill. */
export function runPill(status: Run['status']): RunPill {
  switch (status) {
    case 'running':
      return { label: 'Live', cls: 'tag-live' };
    case 'queued':
      return { label: 'Queued', cls: 'tag-warn' };
    case 'awaiting_approval':
      return { label: 'Review', cls: 'tag-warn' };
    case 'failed':
      return { label: 'Blocked', cls: 'tag-block' };
    default:
      return { label: status, cls: 'tag-warn' };
  }
}

export type ActivityEvent =
  | { kind: 'handover'; id: string; at: number; who: string; toPersona: string; item: string | null }
  | { kind: 'decision'; id: string; at: number; who: string; decisionId: string; title: string; item: string | null }
  | { kind: 'audit'; id: string; at: number; who: string; text: string; item: string | null };

/**
 * Render one audit-log row as a human activity phrase (the actor is shown
 * separately as the avatar, so this omits it). Covers the pipeline/gate/patch
 * lifecycle the engine emits plus item transitions; unknown actions degrade to
 * a humanised form of the action key.
 */
/** "product-analysis.1" → "product-analysis step 1" (leaves dot-less keys as-is). */
function humanizeStepKey(key: string): string {
  const m = key.match(/^(.*)\.(\d+)$/);
  return m ? `${m[1]} step ${m[2]}` : key;
}

/** "+compliance-expert" → "compliance-expert"; null/empty stays null. */
function cleanPersona(persona: string | null): string | null {
  return persona ? persona.replace(/^\+/, '') : null;
}

export function describeAuditEvent(entry: {
  action: string;
  payload: Record<string, unknown>;
  actor?: string;
}): string {
  const p = entry.payload ?? {};
  const str = (k: string): string | null => (typeof p[k] === 'string' ? (p[k] as string) : null);
  switch (entry.action) {
    case 'pipeline.chained':
      return str('to_workflow') ? `advanced to ${str('to_workflow')}` : 'advanced to the next workflow';
    case 'pipeline.succeeded':
      return str('workflow_id') ? `completed ${str('workflow_id')}` : 'completed a workflow';
    case 'pipeline.failed':
      return str('workflow_id') ? `${str('workflow_id')} failed` : 'a workflow failed';
    case 'pipeline.step.started': {
      const step = str('step_key');
      if (!step) return 'started a step';
      const who = cleanPersona(str('persona'));
      return who ? `${who} started ${humanizeStepKey(step)}` : `started ${humanizeStepKey(step)}`;
    }
    case 'pipeline.step.succeeded': {
      const step = str('step_key');
      if (!step) return 'finished a step';
      const who = cleanPersona(str('persona'));
      return who ? `${who} finished ${humanizeStepKey(step)}` : `finished ${humanizeStepKey(step)}`;
    }
    case 'pipeline.step.failed': {
      const step = str('step_key');
      if (!step) return 'a step failed';
      const who = cleanPersona(str('persona'));
      return who ? `${who}'s ${humanizeStepKey(step)} failed` : `${humanizeStepKey(step)} failed`;
    }
    case 'gate.awaiting-approval':
      return 'paused for your approval';
    case 'gate.answered':
      return 'gate answered';
    case 'gate.paused':
      return 'paused at a gate';
    case 'gate.resumed':
      return 'resumed after a gate';
    case 'backlog.patch.summary': {
      const n = typeof p.count === 'number' ? p.count : null;
      return n === null ? 'patched the backlog' : `patched ${n} item${n === 1 ? '' : 's'}`;
    }
    case 'item_transition': {
      const from = str('from');
      const to = str('to');
      if (from && to)
        return `moved ${statusBadge(from as BacklogItem['status']).label} → ${statusBadge(to as BacklogItem['status']).label}`;
      return 'updated an item';
    }
    case 'item_ac_toggle': {
      const text = str('text');
      if (text) return `${p.done ? 'checked' : 'unchecked'} "${text}"`;
      return 'updated acceptance criteria';
    }
    case 'item_comment': {
      const text = str('text');
      if (text) return `commented: "${text}"`;
      return 'commented';
    }
    // UAT #10 — "agy kota-uyarısı": quota fallover reads as a warning.
    case 'executor.fallover': {
      const from = str('from');
      const to = str('to');
      if (from && to) return `⚠ ${from} hit a quota/rate limit — fell over to ${to}`;
      return '⚠ executor quota/rate limit — fell over';
    }
    default:
      return entry.action.replace(/[._]/g, ' ');
  }
}

/** Merge handovers + decisions into one reverse-chronological activity feed. */
export function mergeActivity(
  handovers: Handover[],
  decisions: DecisionIndex[],
  limit = 40,
): ActivityEvent[] {
  return buildActivityFeed([], handovers, decisions, limit);
}

/**
 * The Dashboard timeline feed: the curated audit log (the project-wide "what
 * just happened") merged with handovers and decisions, newest-first. Audit rows
 * carry a board-item link only when their resource is a backlog item.
 */
export function buildActivityFeed(
  audit: ActivityEntry[],
  handovers: Handover[],
  decisions: DecisionIndex[],
  limit = 40,
): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  for (const e of audit) {
    events.push({
      kind: 'audit',
      id: `a-${e.id}`,
      at: e.created_at,
      who: e.actor,
      text: describeAuditEvent(e),
      item: e.resource_type === 'backlog_item' ? e.resource_id : null,
    });
  }
  for (const h of handovers) {
    events.push({
      kind: 'handover',
      id: `h-${h.id}`,
      at: h.created_at,
      who: h.from_persona,
      toPersona: h.to_persona,
      item: h.item_id,
    });
  }
  for (const d of decisions) {
    events.push({
      kind: 'decision',
      id: `d-${d.id}`,
      at: d.decided_at ?? d.created_at,
      who: '+prime',
      decisionId: d.decision_id,
      title: d.title,
      item: d.item_id,
    });
  }
  events.sort((a, b) => b.at - a.at);
  return events.slice(0, limit);
}

/** Compact "now / 4m / 2h / 3d" age, mirroring the wireframe's terse stamps. */
export function formatAge(fromMs: number, nowMs: number = Date.now()): string {
  const sec = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  if (sec < 60) return 'now';
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ───────────────────────────── small helpers ─────────────────────────────────

const short = (h: string | null | undefined): string => (h ?? '?').replace(/^\+/, '');

// ────────────────────────── autonomous drive control ─────────────────────────

type DriveStatus = {
  armed: boolean;
  /** Whether the env var alone would arm it (informational). */
  armedByEnv?: boolean;
  inFlight: boolean;
  scheduler: { running: boolean; intervalSec: number | null };
  lastPass: { at: number; ok: boolean; error?: string } | null;
};

/** Format an apiPost rejection (ApiPostError-shaped) for a terse inline note. */
function driveErr(e: unknown): string {
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; error?: unknown };
    if (typeof o.message === 'string' && o.message) return o.message;
    if (typeof o.error === 'string') return o.error;
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * The autonomous-driver control surfaced in the dashboard header (§5.16 +
 * autonomy). Off by default behind the master env lock: when unarmed it shows a
 * "locked" hint; when armed it offers "Run once" (one pass) + an "Auto" toggle
 * (60s scheduler). Status polls GET /api/drive.
 */
function DriveControl() {
  const { data, refresh } = usePolling<DriveStatus>('/api/drive', 4000);
  const armed = data?.armed ?? false;
  const inFlight = data?.inFlight ?? false;
  const autoOn = data?.scheduler?.running ?? false;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setErr(driveErr(e));
    } finally {
      setBusy(false);
    }
  }

  // The master switch is armable from here (POST /api/drive/arm). Status badge +
  // lock toggle + Run once are ALWAYS shown; only their state changes. The lock
  // icon is the toggle: closed = locked, open = armed.
  const locked = !armed;
  const arm = (next: boolean) => act(() => apiPost('/api/drive/arm', { armed: next }));
  const lockNote = 'The autonomous driver is locked — agents pick up no work until you arm it.';
  const statusLabel = locked
    ? 'Driver locked'
    : err
      ? 'Error'
      : inFlight
        ? 'Driving…'
        : autoOn
          ? 'Auto on'
          : 'Idle';
  const flavour = locked ? 's-neutral' : err ? 's-red' : inFlight || autoOn ? 's-green' : 's-neutral';
  const lastPassNote = data?.lastPass
    ? `Last pass ${formatAge(data.lastPass.at)} ago — ${data.lastPass.ok ? 'ok' : data.lastPass.error ?? 'failed'}`
    : undefined;

  return (
    <>
      <span className={`badge ${flavour}`} title={locked ? lockNote : (err ?? lastPassNote)}>
        <span className={`dot${inFlight ? ' dot-live' : ''}`} />
        {statusLabel}
      </span>
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        disabled={busy}
        onClick={() => arm(locked)}
        title={locked ? 'Arm the driver so agents can pick up work' : 'Lock the driver — stops auto-drive and blocks new passes'}
      >
        {locked ? (
          <LockKeyhole style={{ width: 13, height: 13 }} />
        ) : (
          <LockKeyholeOpen style={{ width: 13, height: 13 }} />
        )}
      </button>
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        disabled={locked || busy || inFlight}
        onClick={() => act(() => apiPost('/api/drive', {}))}
      >
        <Play style={{ width: 13, height: 13 }} /> Run once
      </button>
      <label
        title={locked ? lockNote : `Auto-drive every ${data?.scheduler.intervalSec ?? 60}s`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 12,
          color: 'var(--fg-secondary)',
          cursor: locked || busy ? 'default' : 'pointer',
          opacity: locked ? 0.55 : 1,
        }}
      >
        <span
          className={`switch ${autoOn ? 'on' : ''}`}
          style={locked ? { pointerEvents: 'none' } : undefined}
          onClick={() => {
            if (locked) return;
            act(() => apiPost('/api/drive/scheduler', { enabled: !autoOn, intervalSec: 60 }));
          }}
        />
        Auto
      </label>
    </>
  );
}

// ──────────────────────────────── route ──────────────────────────────────────

export function DashboardRoute() {
  // Bumping the key remounts the whole view → every poll refetches immediately
  // and the `.rise` entrance animations replay (matching the wireframe load).
  const [nonce, setNonce] = useState(0);
  return <DashboardView key={nonce} onRefresh={() => setNonce((n) => n + 1)} />;
}

/** "HH:MM" clock stamp for an activity row (local time) — handoff `e.t`. */
function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Monospace agent token — coloured identity dot + handle (handoff `agentInline`). */
function AgentToken({ handle }: { handle: string | null }) {
  const h = short(handle);
  if (!handle || h === 'system') {
    return (
      <span className="badge badge-square s-neutral" style={{ fontWeight: 500 }}>
        system
      </span>
    );
  }
  if (h === 'prime' || h === 'you') {
    return (
      <span className="mono" style={{ color: 'var(--fg)', fontWeight: 500 }}>
        +{h}
      </span>
    );
  }
  const { color } = personaPalette(handle);
  return (
    <span className="agent" title={`+${h}`}>
      <span className="adot" style={{ background: color, color }} />
      <span className="truncate">+{h}</span>
    </span>
  );
}

/** One activity-stream row: time · who · text · age (handoff `renderActivity`).
 *  Rows that carry a board item are clickable → open the item in the right drawer. */
function ActivityRow({ event, onOpenItem }: { event: ActivityEvent; onOpenItem: (id: string) => void }) {
  const clickable = !!event.item;
  return (
    <div
      className={`act-row${clickable ? ' act-link' : ''}`}
      onClick={clickable ? () => onOpenItem(event.item!) : undefined}
    >
      <span className="mono act-t">{formatClock(event.at)}</span>
      <div className="act-who">
        <AgentToken handle={event.who} />
      </div>
      <div className="act-main">
        <div className="act-text">
          <EventText event={event} />
          {event.item ? (
            <span className="mono" style={{ color: 'var(--fg-faint)' }}>
              {' '}
              {event.item}
            </span>
          ) : null}
        </div>
      </div>
      <div className="act-meta">
        <span className="mono act-dur">{formatAge(event.at)}</span>
      </div>
    </div>
  );
}

type VersionRow = { id: string; items: number; pct: number };

/** Per-version rollup from the loaded card page (handoff Version-status card). */
function versionRows(items: BacklogItem[], order: string[]): VersionRow[] {
  const byVer = new Map<string, { total: number; done: number }>();
  for (const it of items) {
    if (it.type === 'epic' || !it.version) continue;
    const v = byVer.get(it.version) ?? { total: 0, done: 0 };
    v.total += 1;
    if (it.status === 'done') v.done += 1;
    byVer.set(it.version, v);
  }
  const keys = order.length ? order : [...byVer.keys()].sort();
  return keys
    .filter((k) => byVer.has(k))
    .map((id) => {
      const v = byVer.get(id)!;
      return { id, items: v.total, pct: v.total === 0 ? 0 : Math.round((v.done / v.total) * 100) };
    });
}

/** Item-status flavour → handoff status colour class (dot + label). */
const ITEM_FLAVOUR: Record<BacklogItem['status'], string> = {
  to_do: 'neutral',
  in_progress: 'amber',
  test: 'blue',
  review: 'violet',
  done: 'green',
  cancelled: 'neutral',
};

/** Rail status card — title panel-head + body (handoff `card()`). */
function StatusCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <div className="panel-head">
        <div className="panel-title">{title}</div>
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}

const TYPE_PILL_FLAVOUR: Record<BacklogItem['type'], string> = {
  epic: 'violet', task: 'blue', bug: 'red', debt: 'amber', spike: 'blue', hotfix: 'red',
};
const TYPE_PILL_LABEL: Record<BacklogItem['type'], string> = {
  epic: 'Epic', task: 'Task', bug: 'Bug', debt: 'Debt', spike: 'Spike', hotfix: 'Hotfix',
};
const STATUS_FLAVOUR: Record<BacklogItem['status'], string> = {
  to_do: 'neutral', in_progress: 'amber', test: 'blue', review: 'violet', done: 'green', cancelled: 'neutral',
};

/**
 * Item detail drawer (handoff `.detail`) — slides in from the right when an
 * activity row carrying a board item is clicked. Read-only summary: type · id ·
 * title · status · assignee · version · acceptance criteria · gates.
 */
function DetailDrawer({ item, onClose }: { item: BacklogItem | null; onClose: () => void }) {
  const open = !!item;
  const ac = item ? acChecklist(item.frontmatter) : [];
  const gates = item ? itemGates(item) : [];
  const desc = item ? descriptionFromBody(item.body_md) : '';
  const assignee = item ? assigneeOf(item) : null;
  return (
    <>
      <div className={`scrim${open ? ' show' : ''}`} onClick={onClose} />
      <aside className={`detail${open ? ' show' : ''}`} aria-hidden={!open}>
        {item && (
          <>
            <div className="detail-head">
              <span className={`kc-type s-${TYPE_PILL_FLAVOUR[item.type]}`}>
                {TYPE_PILL_LABEL[item.type]}
              </span>
              <span
                className="mono"
                style={{ fontSize: 12, color: 'var(--fg-muted)', marginRight: 'auto' }}
              >
                {item.id}
              </span>
              <button className="detail-x" onClick={onClose} aria-label="Close">
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>
            <div className="detail-body kx-scroll">
              <div className="dt-hero">
                <h2 className="dt-title">{item.title}</h2>
              </div>
              {desc && (
                <p className="dt-desc" style={{ marginBottom: 4 }}>
                  {desc}
                </p>
              )}
              <div className="dt-meta">
                <div className="dt-row">
                  <span className="dt-k">Status</span>
                  <span className="dt-v">
                    <span className={`badge s-${STATUS_FLAVOUR[item.status]}`}>
                      <span className="dot" />
                      {statusBadge(item.status).label}
                    </span>
                  </span>
                </div>
                <div className="dt-row">
                  <span className="dt-k">Assignee</span>
                  <span className="dt-v">
                    {assignee ? <AgentToken handle={assignee} /> : '—'}
                  </span>
                </div>
                {item.version && (
                  <div className="dt-row">
                    <span className="dt-k">Version</span>
                    <span className="dt-v">
                      <span className="badge badge-square mono" style={{ fontSize: 11 }}>
                        {item.version}
                      </span>
                    </span>
                  </div>
                )}
                {item.parent_id && (
                  <div className="dt-row">
                    <span className="dt-k">Epic</span>
                    <span className="dt-v mono">{item.parent_id}</span>
                  </div>
                )}
              </div>

              {item.preview_url && (
                <div className="dt-sec">
                  <div className="dt-sec-h">
                    <SquareArrowOutUpRight className="ic" />
                    Preview
                  </div>
                  <a
                    className="dt-mlink"
                    href={item.preview_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <SquareArrowOutUpRight className="ic" />
                    {item.preview_url}
                  </a>
                </div>
              )}

              {ac.length > 0 && (
                <div className="dt-sec">
                  <div className="dt-sec-h">
                    <ListChecks className="ic" />
                    Acceptance criteria
                  </div>
                  <ul className="dt-ac">
                    {ac.map((c, i) => (
                      <li key={i} className={c.done ? 'done' : ''}>
                        <span className="dt-check">{c.done && <Check className="ic" />}</span>
                        {c.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {gates.length > 0 && (
                <div className="dt-sec">
                  <div className="dt-sec-h">
                    <LayoutList className="ic" />
                    Gates
                  </div>
                  <div className="dt-gates">
                    {gates.map((g) => (
                      <div className="dt-gate" key={g.gate}>
                        <span className="dt-gate-l">{g.label}</span>
                        <span className={`dt-gate-s ${g.state === 'passed' ? 'pass' : ''}`}>
                          {g.state === 'passed' ? '✓ passed' : '○ pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

/**
 * Dashboard (design_handoff_kortext `V.dashboard()`): header + a two-column
 * `.dash` grid — the Activity stream (left) and a rail of Version / Epic / Item
 * status cards (right). Every value is bound to a live endpoint; the prototype's
 * baked `KX.*` arrays become `/api/activity` + `/api/backlog/aggregate`.
 *
 * Parked (no slot in the handoff dashboard — see MIGRATION-GAPS): the autonomous
 * Driver control, the Active-work list, and the +prime Review queue. Their
 * components remain below, unused, pending a placement decision.
 */
function DashboardView({ onRefresh }: { onRefresh: () => void }) {
  const aggPoll = usePolling<BacklogAggregate>('/api/backlog/aggregate', 10000);
  const [cards, setCards] = useState<BacklogItem[]>([]);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  // Activity feed paginates 50 at a time (never an unbounded list).
  const [actLimit, setActLimit] = useState(50);
  useEffect(() => {
    void apiGet<{ items: BacklogItem[] }>('/api/backlog?limit=500')
      .then((r) => setCards(r.items))
      .catch(() => {});
  }, []);
  const itemsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const { data: aData, loading: aLoading } = usePolling<{ activity: ActivityEntry[] }>(
    `/api/activity?limit=${actLimit}`,
    5000,
  );
  const { data: hData } = usePolling<{ handovers: Handover[] }>(
    `/api/handovers?limit=${actLimit}`,
    8000,
  );
  const { data: dData } = usePolling<{ decisions: DecisionIndex[] }>(
    `/api/decisions?limit=${actLimit}`,
    8000,
  );
  const events = useMemo(
    () => buildActivityFeed(aData?.activity ?? [], hData?.handovers ?? [], dData?.decisions ?? [], actLimit),
    [aData, hData, dData, actLimit],
  );
  // a full page implies there may be more to fetch
  const canLoadMore = events.length >= actLimit;

  const agg = aggPoll.data;

  // header subtitle counts — real agent runtime from /api/runs (same lens as the
  // footer + Terminal), NOT backlog item statuses.
  const runsPoll = usePolling<{ runs: Run[] }>('/api/runs', 5000);
  const runList = runsPoll.data?.runs ?? [];
  const running = runList.filter((r) => r.status === 'running').length;
  const queued = runList.filter((r) => r.status === 'queued').length;
  const awaiting = runList.filter((r) => r.status === 'awaiting_approval').length;

  const versions = versionRows(cards, agg?.versions ?? []);
  const epics = useMemo<{ id: string; items: number; pct: number }[]>(() => {
    if (!agg) return [];
    return agg.epics.map((epic) => {
      const prog = agg.epicProgress[epic.id];
      const total = prog?.total ?? 0;
      const pct =
        prog && prog.total > 0
          ? Math.round((prog.done / prog.total) * 100)
          : epic.status === 'done'
            ? 100
            : 0;
      return { id: epic.id, items: total, pct };
    });
  }, [agg]);
  const itemTotal = agg
    ? STATUS_SEGMENTS.reduce((a, s) => a + (agg.statusCounts[s.status] ?? 0), 0)
    : 0;
  const itemBars = agg
    ? STATUS_SEGMENTS.map((s) => {
        const n = agg.statusCounts[s.status] ?? 0;
        return {
          status: s.status,
          label: s.label,
          n,
          pct: itemTotal === 0 ? 0 : Math.round((n / itemTotal) * 100),
        };
      })
    : [];

  return (
    <div className="dash-page">
      <header className="pg-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <h1 className="pg-title">Dashboard</h1>
            <button className="icon-btn" onClick={onRefresh} title="Refresh">
              <RefreshCw className="ic" />
            </button>
          </div>
          <p className="pg-sub">
            Live across the house · {running} running · {queued} queued · {awaiting} awaiting
          </p>
        </div>
      </header>

      <div className="dash" data-dash>
          <section className="card dash-activity">
            <div className="panel-head">
              <div className="panel-title">Activity</div>
              <div className="flex items-center gap">
                <DriveControl />
              </div>
            </div>
            <div className="act-list kx-scroll">
              {events.length === 0 ? (
                <div
                  className="act-row"
                  style={{ display: 'block', color: 'var(--fg-faint)', fontSize: 13 }}
                >
                  {aLoading ? 'Loading activity…' : 'No activity yet.'}
                </div>
              ) : (
                <>
                  {events.map((e) => (
                    <ActivityRow key={e.id} event={e} onOpenItem={(id) => setDrawerId(id)} />
                  ))}
                  {canLoadMore && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}
                      onClick={() => setActLimit((l) => l + 50)}
                    >
                      Load more
                    </button>
                  )}
                </>
              )}
            </div>
          </section>

          <aside className="dash-rail">
            <StatusCard title="Version status">
              {versions.length === 0 ? (
                <div className="srow" style={{ color: 'var(--fg-faint)', fontSize: 12 }}>
                  No versions yet.
                </div>
              ) : (
                versions.map((v) => (
                  <div className="srow" key={v.id}>
                    <span className="mono srow-k">{v.id}</span>
                    <span className="badge-count">{v.items}</span>
                    <div className="progress grow">
                      <span style={{ width: `${v.pct}%` }} />
                    </div>
                    <span className="mono srow-v">{v.pct}%</span>
                  </div>
                ))
              )}
            </StatusCard>

            <StatusCard title="Epic status">
              {epics.length === 0 ? (
                <div className="srow" style={{ color: 'var(--fg-faint)', fontSize: 12 }}>
                  No epics yet.
                </div>
              ) : (
                epics.map((e) => (
                  <div className="srow" key={e.id} title={e.id}>
                    <span className="mono srow-k">{e.id}</span>
                    <span className="badge-count">{e.items}</span>
                    <div className="progress grow">
                      <span style={{ width: `${e.pct}%` }} />
                    </div>
                    <span className="mono srow-v">{e.pct}%</span>
                  </div>
                ))
              )}
            </StatusCard>

            <StatusCard title="Item status">
              {itemBars.length === 0 ? (
                <div className="srow" style={{ color: 'var(--fg-faint)', fontSize: 12 }}>
                  No items yet.
                </div>
              ) : (
                itemBars.map((b) => (
                  <div className="srow" key={b.status}>
                    <span
                      className={`badge s-${ITEM_FLAVOUR[b.status]}`}
                      style={{
                        border: 0,
                        background: 'transparent',
                        padding: 0,
                        gap: 7,
                        fontWeight: 500,
                        width: 104,
                        justifyContent: 'flex-start',
                      }}
                    >
                      <span className="dot" />
                      {b.label}
                    </span>
                    <span className="badge-count">{b.n}</span>
                    <div className="progress grow">
                      <span style={{ width: `${b.pct}%` }} />
                    </div>
                    <span className="mono srow-v">{b.pct}%</span>
                  </div>
                ))
              )}
            </StatusCard>
          </aside>
        </div>

      <DetailDrawer item={drawerId ? itemsById.get(drawerId) ?? null : null} onClose={() => setDrawerId(null)} />
    </div>
  );
}

/**
 * Compose the answer string for a gate-escalation question (UAT #10). The
 * consumer (gate-escalation.ts) treats `approve`/`drop` as exact and anything
 * else as a `revise` whose text (after an optional `revise:` prefix) is the
 * directive handed to the next directed dev turn.
 *
 * The +prime Review queue that consumed this was parked out of the handoff
 * dashboard, but the helper stays exported — it is pinned by tests and reused
 * when the escalation decision finds its new home.
 */
export function buildEscalationAnswer(
  kind: 'approve' | 'revise' | 'drop',
  directive?: string,
): string {
  if (kind === 'approve') return 'approve';
  if (kind === 'drop') return 'drop';
  const trimmed = (directive ?? '').trim();
  return trimmed ? `revise: ${trimmed}` : 'revise';
}

/** Render one activity event's phrase (handover/decision/audit) — used by ActivityRow. */
function EventText({ event }: { event: ActivityEvent }) {
  if (event.kind === 'handover') {
    return (
      <>
        handover → <span className="ac mono">{short(event.toPersona)}</span>
      </>
    );
  }
  if (event.kind === 'decision') {
    return (
      <>
        recorded <span className="mono">{event.decisionId}</span> · {event.title}
      </>
    );
  }
  return <>{event.text}</>;
}
