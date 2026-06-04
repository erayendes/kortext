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
import { useMemo, useState } from 'react';
import { RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { usePolling, apiPost } from '../lib/api.ts';
import type {
  BacklogItem,
  DecisionIndex,
  Handover,
  PendingQuestion,
  Run,
  RunStep,
} from '../lib/api-types.ts';
import { personaPalette } from '../lib/persona-colors.ts';
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
  | { kind: 'decision'; id: string; at: number; who: string; decisionId: string; title: string; item: string | null };

/** Merge handovers + decisions into one reverse-chronological activity feed. */
export function mergeActivity(
  handovers: Handover[],
  decisions: DecisionIndex[],
  limit = 40,
): ActivityEvent[] {
  const events: ActivityEvent[] = [];
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

// ──────────────────────────────── route ──────────────────────────────────────

export function DashboardRoute() {
  // Bumping the key remounts the whole view → every poll refetches immediately
  // and the `.rise` entrance animations replay (matching the wireframe load).
  const [nonce, setNonce] = useState(0);
  return <DashboardView key={nonce} onRefresh={() => setNonce((n) => n + 1)} />;
}

function DashboardView({ onRefresh }: { onRefresh: () => void }) {
  const runsPoll = usePolling<{ runs: Run[] }>('/api/runs', 3000);
  const backlogPoll = usePolling<{ items: BacklogItem[] }>('/api/backlog', 10000);

  const runs = runsPoll.data?.runs ?? [];
  const items = backlogPoll.data?.items ?? [];
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
          <button type="button" className="btn btn-line btn-sm" onClick={onRefresh}>
            <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
          </button>
        </div>

        <StatsCards items={items} loading={backlogPoll.loading} error={backlogPoll.error} />

        <div className="sec-h">
          <span className="sec-t">Active work</span>
          <span className="sec-c">
            {active.length} agent{active.length === 1 ? '' : 's'} running
          </span>
        </div>
        <ActiveWork
          active={active}
          items={items}
          loading={runsPoll.loading && !runsPoll.data}
          error={runsPoll.error}
        />

        <ReviewQueue runs={runs} items={items} />
      </div>

      <ActivityTimeline />
    </div>
  );
}

// ──────────────────────────────── stats ──────────────────────────────────────

function StatsCards({
  items,
  loading,
  error,
}: {
  items: BacklogItem[];
  loading: boolean;
  error: string | null;
}) {
  const epics = useMemo(() => epicProgressRows(items), [items]);
  const { bars, total } = useMemo(() => itemStatusBars(items), [items]);

  if (loading && items.length === 0) {
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
  const run = q.run_id != null ? runs.find((r) => r.id === q.run_id) ?? null : null;
  const item = run?.item_id ? items.find((i) => i.id === run.item_id) ?? null : null;
  const type = item ? TYPE_PILL[item.type] : { label: 'Review', color: '#9B82CE' };
  const idLabel = item?.id ?? (q.run_id != null ? `run #${q.run_id}` : `Q-${q.id}`);
  const persona = item?.owner ?? null;

  async function answer(kind: 'approve' | 'reject') {
    if (busy) return;
    setBusy(true);
    try {
      await apiPost(`/api/questions/${q.id}/answer`, {
        answer: pickChoice(q.choices, kind),
        answered_by: '+you',
      });
      onDone();
    } catch {
      // Surface failure by re-enabling the actions; the poll will reconcile.
      setBusy(false);
    }
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
    </div>
  );
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
  const { data: hData, loading: hLoading } = usePolling<{ handovers: Handover[] }>(
    '/api/handovers?limit=30',
    5000,
  );
  const { data: dData } = usePolling<{ decisions: DecisionIndex[] }>('/api/decisions?limit=30', 8000);

  const events = useMemo(
    () => mergeActivity(hData?.handovers ?? [], dData?.decisions ?? []),
    [hData, dData],
  );

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
  return (
    <>
      recorded <span className="mono">{event.decisionId}</span> · {event.title}
    </>
  );
}
