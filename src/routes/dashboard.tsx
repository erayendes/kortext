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
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, SlidersHorizontal, Play, Lock } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { usePolling, apiGet, apiPost } from '../lib/api.ts';
import type {
  ActivityEntry,
  BacklogAggregate,
  BacklogItem,
  DecisionIndex,
  Handover,
  PendingQuestion,
  Run,
  RunStep,
} from '../lib/api-types.ts';
import { personaPalette } from '../lib/persona-colors.ts';
import { assigneeOf, statusBadge } from '../lib/board-drawer.ts';
import { resolveActiveRun } from '../lib/active-run.ts';
import { primaryPersonaFor } from '../lib/workflow-primary-persona.ts';

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

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Coloured persona circle with its Lucide glyph — the wireframe's `pAvatar`. */
function Avatar({ handle, size = 18 }: { handle: string | null; size?: number }) {
  const { color, icon: Icon } = personaPalette(handle);
  const bw = size <= 16 ? 1 : 1.5;
  return (
    <span
      className="avatar"
      title={handle ?? undefined}
      style={{
        width: size,
        height: size,
        background: rgba(color, 0.1),
        border: `${bw}px solid ${rgba(color, 0.65)}`,
        color,
      }}
    >
      <Icon size={Math.round(size * 0.54)} strokeWidth={size <= 16 ? 1.8 : 2} />
    </span>
  );
}

// ────────────────────────── autonomous drive control ─────────────────────────

type DriveStatus = {
  armed: boolean;
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

  if (!armed) {
    return (
      <span
        className="pill"
        style={{ cursor: 'default' }}
        title="The autonomous driver is locked. Set KORTEXT_DRIVE_ENABLED=1 to arm it."
      >
        <Lock style={{ width: 12, height: 12 }} /> Driver locked
      </span>
    );
  }

  const statusLabel = inFlight ? 'Driving…' : autoOn ? 'Auto on' : 'Idle';
  const dotCls = inFlight ? 'dot-success live' : autoOn ? 'dot-success' : 'dot-muted';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        className="sec-c"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        title={
          err
            ? err
            : data?.lastPass
              ? `Last pass ${formatAge(data.lastPass.at)} ago — ${data.lastPass.ok ? 'ok' : data.lastPass.error ?? 'failed'}`
              : undefined
        }
      >
        <span className={`dot ${dotCls}`} style={{ color: err ? 'var(--red)' : undefined }} />
        {err ? 'Error' : statusLabel}
      </span>
      <button
        type="button"
        className="btn btn-line btn-sm"
        disabled={busy || inFlight}
        onClick={() => act(() => apiPost('/api/drive', {}))}
      >
        <Play style={{ width: 13, height: 13 }} /> Run once
      </button>
      <span
        className="agct"
        title={`Auto-drive every ${data?.scheduler.intervalSec ?? 60}s`}
        style={{ cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}
        onClick={() =>
          act(() => apiPost('/api/drive/scheduler', { enabled: !autoOn, intervalSec: 60 }))
        }
      >
        <span className={`switch ${autoOn ? 'on' : ''}`} />
        <span className="sec-c">Auto</span>
      </span>
    </div>
  );
}

// ──────────────────────────────── route ──────────────────────────────────────

export function DashboardRoute() {
  // Bumping the key remounts the whole view → every poll refetches immediately
  // and the `.rise` entrance animations replay (matching the wireframe load).
  const [nonce, setNonce] = useState(0);
  return <DashboardView key={nonce} onRefresh={() => setNonce((n) => n + 1)} />;
}

function DashboardView({ onRefresh }: { onRefresh: () => void }) {
  const runsPoll = usePolling<{ runs: Run[] }>('/api/runs', 3000);
  // Aggregate: replaces the old ?limit=2000 full-fetch for whole-set consumers
  // (epic progress, status bars). No row payload — server-side GROUP BY.
  const aggPoll = usePolling<BacklogAggregate>('/api/backlog/aggregate', 10000);

  // Paginated card list for ActiveWork / ReviewQueue item lookups.
  // A single page is enough: active runs reference recent items which are
  // in the first 100 by created_at DESC.
  const [cards, setCards] = useState<BacklogItem[]>([]);
  useEffect(() => {
    void apiGet<{ items: BacklogItem[] }>('/api/backlog?limit=100')
      .then((r) => setCards(r.items))
      .catch(() => {});
  }, []);

  const runs = runsPoll.data?.runs ?? [];
  const agg = aggPoll.data;
  const active = runs.filter((r) => ACTIVE_RUN_STATUSES.includes(r.status));

  return (
    <div className="dash">
      <div className="dash-main">
        <div
          className="sec-h"
          style={{ marginBottom: 18, alignItems: 'center', justifyContent: 'space-between' }}
        >
          <div className="page-title" style={{ fontSize: 18 }}>
            Dashboard
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <DriveControl />
            <button type="button" className="btn btn-line btn-sm" onClick={onRefresh}>
              <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
            </button>
          </div>
        </div>

        <StatsCards agg={agg} loading={aggPoll.loading} error={aggPoll.error} />

        <div className="sec-h">
          <span className="sec-t">Active work</span>
          <span className="sec-c">
            {active.length} agent{active.length === 1 ? '' : 's'} running
          </span>
        </div>
        <ActiveWork
          active={active}
          items={cards}
          loading={runsPoll.loading && !runsPoll.data}
          error={runsPoll.error}
        />

        <ReviewQueue runs={runs} items={cards} />
      </div>

      <ActivityTimeline />
    </div>
  );
}

// ──────────────────────────────── stats ──────────────────────────────────────

function StatsCards({
  agg,
  loading,
  error,
}: {
  agg: BacklogAggregate | null | undefined;
  loading: boolean;
  error: string | null;
}) {
  // Derive epic progress rows from aggregate data
  const epics = useMemo<EpicRow[]>(() => {
    if (!agg) return [];
    return agg.epics.map((epic) => {
      const prog = agg.epicProgress[epic.id];
      let pct: number;
      if (prog && prog.total > 0) {
        pct = Math.round((prog.done / prog.total) * 100);
      } else {
        pct = epic.status === 'done' ? 100 : 0;
      }
      return { id: epic.id, title: epic.title, pct };
    });
  }, [agg]);

  // Derive status bars from aggregate statusCounts
  const { bars, total } = useMemo(() => {
    if (!agg) return { bars: [], total: 0 };
    const raw = STATUS_SEGMENTS.map((s) => ({
      ...s,
      n: agg.statusCounts[s.status] ?? 0,
    }));
    const totalN = raw.reduce((a, s) => a + s.n, 0);
    const maxN = Math.max(1, ...raw.map((s) => s.n));
    const bars = raw.map((s) => ({
      label: s.label,
      color: s.color,
      n: s.n,
      pct: totalN === 0 ? 0 : Math.round((s.n / totalN) * 100),
      barPct: Math.round((s.n / maxN) * 100),
    }));
    return { bars, total: agg.total };
  }, [agg]);

  if (loading && !agg) {
    return <div className="stats">{statCardSkeleton('Epic progress')}{statCardSkeleton('Item status')}</div>;
  }

  return (
    <div className="stats">
      <div className="stat-card rise" style={{ animationDelay: '0ms' }}>
        <div className="stat-lbl">Epic progress · {epics.length} epic{epics.length === 1 ? '' : 's'}</div>
        {epics.length === 0 ? (
          <div className="metric-sub" style={{ marginTop: 4 }}>
            {error ? `Couldn't load backlog — ${error}` : 'No epics yet.'}
          </div>
        ) : (
          <div className="epic-sum-rows" style={{ marginTop: 4 }}>
            {epics.map((e) => (
              <div className="epic-sum-row" key={e.id}>
                <span className="epic-sum-id">{e.id}</span>
                <span className="epic-sum-name" title={e.title}>
                  {e.title}
                </span>
                <div className="epic-sum-bar">
                  <div className="epic-sum-fill" style={{ width: `${e.pct}%` }} />
                </div>
                <span className="epic-sum-pct">{e.pct}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="stat-card rise" style={{ animationDelay: '35ms' }}>
        <div className="stat-lbl">Item status · {total} total</div>
        {bars.map((b) => (
          <div className="sbar-row" key={b.label}>
            <span className="sbar-name">{b.label}</span>
            <div className="sbar-track">
              <div className="sbar-fill" style={{ width: `${b.barPct}%`, background: b.color }} />
            </div>
            <span className="sbar-n">{b.n}</span>
            <span className="sbar-pct">{b.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function statCardSkeleton(label: string) {
  return (
    <div className="stat-card" key={label}>
      <div className="stat-lbl">{label}</div>
      <div className="metric-sub" style={{ marginTop: 6 }}>
        Loading…
      </div>
    </div>
  );
}

// ──────────────────────────── active work ────────────────────────────────────

function ActiveWork({
  active,
  items,
  loading,
  error,
}: {
  active: Run[];
  items: BacklogItem[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return <div className="work"><EmptyWorkRow text="Loading runs…" /></div>;
  }
  if (error) {
    return <div className="work"><EmptyWorkRow text={`Error: ${error}`} /></div>;
  }
  if (active.length === 0) {
    return (
      <div className="work">
        <EmptyWorkRow text="No agents running — start a workflow to see live work here." />
      </div>
    );
  }
  return (
    <div className="work">
      {active.map((run, i) => (
        <WorkRow key={run.id} run={run} items={items} index={i} />
      ))}
    </div>
  );
}

function WorkRow({ run, items, index }: { run: Run; items: BacklogItem[]; index: number }) {
  // The list row carries no step detail; enrich it with the run's ordered steps
  // so the avatar + progress reflect the persona actually working right now.
  const { data: detail } = usePolling<{ run: Run; steps: RunStep[] }>(`/api/runs/${run.id}`, 3000);
  const view = resolveActiveRun(run, detail?.steps ?? [], items);
  const persona = view.persona ?? primaryPersonaFor(run.workflow_id);
  const pill = runPill(run.status);
  const desc = view.taskTitle ?? run.workflow_id;

  return (
    <div className="work-row rise" style={{ animationDelay: `${index * 30}ms` }}>
      <div className="w-left">
        <span className={`tag ${pill.cls}`}>{pill.label}</span>
        {run.item_id ? <span className="w-id mono">{run.item_id}</span> : null}
        <span className="w-desc">{desc}</span>
        {view.step ? (
          <span className="w-step">
            {view.step.current}/{view.step.total}
          </span>
        ) : null}
      </div>
      <div className="w-right">
        <Avatar handle={persona} size={18} />
        <span className="w-name">{short(persona)}</span>
      </div>
    </div>
  );
}

function EmptyWorkRow({ text }: { text: string }) {
  return (
    <div
      className="work-row"
      style={{ cursor: 'default', color: 'var(--fg-faint)', fontSize: 12.5 }}
    >
      {text}
    </div>
  );
}

// ──────────────────────────── review queue ───────────────────────────────────

const TYPE_PILL: Record<BacklogItem['type'], { label: string; color: string }> = {
  task: { label: 'Task', color: '#5E84D2' },
  bug: { label: 'Bug', color: '#CC6B6B' },
  debt: { label: 'Debt', color: '#D2A24C' },
  epic: { label: 'Epic', color: '#9B82CE' },
  spike: { label: 'Spike', color: '#67E8F9' },
  hotfix: { label: 'Hotfix', color: '#F87171' },
};

function ReviewQueue({ runs, items }: { runs: Run[]; items: BacklogItem[] }) {
  const { data, error, loading, refresh } = usePolling<{ questions: PendingQuestion[] }>(
    '/api/questions',
    4000,
  );
  const questions = data?.questions ?? [];

  return (
    <>
      <div className="sec-h" style={{ marginTop: 22 }}>
        <span className="sec-t">For review</span>
        <span className="sec-c" style={{ color: 'var(--accent)' }}>
          +prime · {questions.length} item{questions.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="prime-q">
        {loading && !data ? (
          <EmptyPrimeRow text="Loading review queue…" />
        ) : error ? (
          <EmptyPrimeRow text={`Error: ${error}`} />
        ) : questions.length === 0 ? (
          <EmptyPrimeRow text="Nothing waiting on +prime — the queue is clear." />
        ) : (
          questions.map((q, i) => (
            <PrimeRow key={q.id} q={q} runs={runs} items={items} index={i} onDone={refresh} />
          ))
        )}
      </div>
    </>
  );
}

function PrimeRow({
  q,
  runs,
  items,
  index,
  onDone,
}: {
  q: PendingQuestion;
  runs: Run[];
  items: BacklogItem[];
  index: number;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [directive, setDirective] = useState('');
  // UAT #10: a gate-escalation question (a gate that failed 3×) is decided by
  // +prime with three choices — Approve (override-pass) / Revise (one directed
  // retry) / Drop (cancel) — instead of the binary approve/request-changes.
  const isEscalation = q.phase === 'gate-escalation';
  const itemIdFromMeta =
    isEscalation && q.metadata && typeof (q.metadata as { itemId?: unknown }).itemId === 'string'
      ? ((q.metadata as { itemId: string }).itemId)
      : null;
  const run = q.run_id != null ? runs.find((r) => r.id === q.run_id) ?? null : null;
  const item =
    (itemIdFromMeta ? items.find((i) => i.id === itemIdFromMeta) ?? null : null) ??
    (run?.item_id ? items.find((i) => i.id === run.item_id) ?? null : null);
  const type = item ? TYPE_PILL[item.type] : { label: 'Review', color: '#9B82CE' };
  const idLabel = item?.id ?? (q.run_id != null ? `run #${q.run_id}` : `Q-${q.id}`);
  const persona = item ? assigneeOf(item) : null;

  async function post(answerStr: string) {
    if (busy) return;
    setBusy(true);
    try {
      await apiPost(`/api/questions/${q.id}/answer`, {
        answer: answerStr,
        answered_by: '+you',
      });
      onDone();
    } catch {
      // Surface failure by re-enabling the actions; the poll will reconcile.
      setBusy(false);
    }
  }

  async function answer(kind: 'approve' | 'reject') {
    await post(pickChoice(q.choices, kind));
  }

  return (
    <div className="prime-row rise" style={{ animationDelay: `${index * 25}ms` }}>
      <span
        className="ty-pill"
        style={{ color: type.color, background: rgba(type.color, 0.1), flexShrink: 0 }}
      >
        <span className="d" style={{ background: type.color }} />
        {type.label}
      </span>
      <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', flexShrink: 0 }}>
        {idLabel}
      </span>
      <span className="prime-title" title={q.question}>
        {q.question}
      </span>
      {persona ? <Avatar handle={persona} size={18} /> : null}
      {persona ? <span className="w-name">{short(persona)}</span> : null}
      <span className="prime-age">{formatAge(q.created_at)}</span>
      {isEscalation ? (
        <div className="prime-acts" style={{ gap: 6 }}>
          <input
            value={directive}
            placeholder="Revise instruction (optional)…"
            disabled={busy}
            onChange={(e) => setDirective(e.target.value)}
            style={{
              flex: 1,
              minWidth: 140,
              background: 'var(--panel)',
              border: '1px solid var(--border-strong)',
              borderRadius: 7,
              color: 'var(--fg)',
              font: 'inherit',
              fontSize: 12,
              padding: '6px 9px',
              outline: 'none',
            }}
          />
          <button
            type="button"
            className="btn btn-sm btn-approve"
            disabled={busy}
            title="Override the gate and ship this item"
            onClick={() => post(buildEscalationAnswer('approve'))}
          >
            Approve
          </button>
          <button
            type="button"
            className="btn btn-sm btn-pri"
            disabled={busy}
            title="Send back for one directed retry with your instruction"
            onClick={() => post(buildEscalationAnswer('revise', directive))}
          >
            Revise
          </button>
          <button
            type="button"
            className="btn btn-line btn-sm"
            disabled={busy}
            title="Cancel this item so it does not block its epic"
            onClick={() => post(buildEscalationAnswer('drop'))}
          >
            Drop
          </button>
        </div>
      ) : (
        <div className="prime-acts">
          <button
            type="button"
            className="btn btn-sm btn-approve"
            disabled={busy}
            onClick={() => answer('approve')}
          >
            Approve
          </button>
          <button
            type="button"
            className="btn btn-line btn-sm"
            disabled={busy}
            onClick={() => answer('reject')}
          >
            Request changes
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Compose the answer string for a gate-escalation question (UAT #10). The
 * consumer (gate-escalation.ts) treats `approve`/`drop` as exact and anything
 * else as a `revise` whose text (after an optional `revise:` prefix) is the
 * directive handed to the next directed dev turn.
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

/** Pick the choice that best matches the intent; fall back to a sane default. */
function pickChoice(choices: string[], kind: 'approve' | 'reject'): string {
  const re = kind === 'approve' ? /approv|yes|accept|ship|merge|ok/i : /reject|no|chang|block|deny/i;
  const hit = choices.find((c) => re.test(c));
  if (hit) return hit;
  const fallback = kind === 'approve' ? choices[0] : choices[choices.length - 1];
  if (fallback) return fallback;
  return kind === 'approve' ? 'approve' : 'request_changes';
}

function EmptyPrimeRow({ text }: { text: string }) {
  return (
    <div className="prime-row" style={{ color: 'var(--fg-faint)', fontSize: 12.5 }}>
      {text}
    </div>
  );
}

// ─────────────────────────── activity timeline ───────────────────────────────

function ActivityTimeline() {
  const navigate = useNavigate();
  const { data: aData, loading: aLoading } = usePolling<{ activity: ActivityEntry[] }>(
    '/api/activity?limit=40',
    5000,
  );
  const { data: hData } = usePolling<{ handovers: Handover[] }>('/api/handovers?limit=30', 8000);
  const { data: dData } = usePolling<{ decisions: DecisionIndex[] }>('/api/decisions?limit=30', 8000);

  const events = useMemo(
    () => buildActivityFeed(aData?.activity ?? [], hData?.handovers ?? [], dData?.decisions ?? []),
    [aData, hData, dData],
  );
  const hLoading = aLoading;

  return (
    <aside className="tl">
      <div className="tl-h">
        <span className="tl-t">Activity</span>
        <span className="pill btn-sm" style={{ height: 23 }}>
          <SlidersHorizontal style={{ width: 12, height: 12 }} /> All
        </span>
      </div>
      <div className="tl-list">
        {hLoading && events.length === 0 ? (
          <div className="tl-ev" style={{ cursor: 'default', color: 'var(--fg-faint)' }}>
            <div className="tl-tx">Loading activity…</div>
          </div>
        ) : events.length === 0 ? (
          <div className="tl-ev" style={{ cursor: 'default', color: 'var(--fg-faint)' }}>
            <div className="tl-tx">No activity yet.</div>
          </div>
        ) : (
          events.map((e) => (
            <div
              key={e.id}
              className="tl-ev"
              onClick={e.item ? () => navigate({ to: '/board' }) : undefined}
              style={e.item ? undefined : { cursor: 'default' }}
            >
              <Avatar handle={e.who} size={20} />
              <div className="tl-tx">
                <span className="ac mono">{short(e.who)}</span> <EventText event={e} />
                {e.item ? <span className="mono tl-item"> {e.item}</span> : null}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

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
