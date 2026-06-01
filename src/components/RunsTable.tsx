import { usePolling, formatElapsed } from '../lib/api.ts';
import type { BacklogItem, Run, RunStep } from '../lib/api-types.ts';
import { personaColor } from '../lib/persona-colors.ts';
import { primaryPersonaFor } from '../lib/workflow-primary-persona.ts';
import { resolveActiveRun } from '../lib/active-run.ts';

const ACTIVE: Run['status'][] = ['queued', 'running', 'awaiting_approval'];

export function RunsTable() {
  const { data, error, loading } = usePolling<{ runs: Run[] }>('/api/runs', 3000);
  const { data: backlog } = usePolling<{ items: BacklogItem[] }>('/api/backlog', 10000);

  if (loading && !data) {
    return <Skeleton label="loading runs…" />;
  }
  if (error) {
    return <Skeleton label={`error: ${error}`} tone="danger" />;
  }
  const runs = data?.runs ?? [];
  const items = backlog?.items ?? [];
  const active = runs.filter((r) => ACTIVE.includes(r.status));

  return (
    <section className="mb-7">
      <h2 className="text-[14px] font-semibold text-tx-1 mb-0.5">Active work</h2>
      <p className="text-[12px] text-tx-3 mb-3.5">
        {active.length === 0
          ? 'No agents running'
          : `${active.length} agent${active.length === 1 ? '' : 's'} currently running tasks`}
      </p>

      {active.length === 0 ? (
        <EmptyRow text="No active runs. Start one with " code="kortext start <workflow-id>" />
      ) : (
        <div>
          <RowHeader />
          {active.map((r) => (
            <RunRow key={r.id} run={r} items={items} />
          ))}
        </div>
      )}
    </section>
  );
}

function RowHeader() {
  return (
    <div
      className="grid items-center gap-3 px-4 py-[9px] text-[10px] font-semibold uppercase tracking-[0.08em] text-tx-3 border-b"
      style={{
        gridTemplateColumns: '18px 1fr 60px 70px',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      }}
    >
      <span />
      <span>Persona · Task</span>
      <span>Step</span>
      <span>Elapsed</span>
    </div>
  );
}

function RunRow({ run, items }: { run: Run; items: BacklogItem[] }) {
  // Enrich the lean list row with its ordered steps so we can show the real
  // current actor + step progress (the list endpoint carries neither).
  const { data: detail } = usePolling<{ run: Run; steps: RunStep[] }>(
    `/api/runs/${run.id}`,
    3000,
  );
  const view = resolveActiveRun(run, detail?.steps ?? [], items);

  const persona = view.persona ?? primaryPersonaFor(run.workflow_id);
  const color = personaColor(persona);
  const taskLabel = view.taskTitle ?? describeRun(run);
  const stepLabel = view.step ? `${view.step.current}/${view.step.total}` : '–';
  const elapsedFrom = run.started_at ?? run.created_at;
  const dot = dotForStatus(run.status);
  const tail = tailForStatus(run.status);

  return (
    <div
      className="grid items-center gap-3 px-4 py-3 text-[13px] cursor-pointer border-b hover:bg-bg-1 transition-colors"
      style={{
        gridTemplateColumns: '18px 1fr 60px 70px',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      }}
    >
      <span className={`dot ${dot}`} />
      <div className="min-w-0 truncate">
        <span className="mono" style={{ color }}>
          {persona}
        </span>{' '}
        <span className="text-tx-2">{taskLabel}</span>{' '}
        {run.item_id ? (
          <span className="mono text-[12px] text-tx-3">{run.item_id}</span>
        ) : null}
      </div>
      <span className="mono text-[12px] text-tx-2">{stepLabel}</span>
      {tail ? (
        <span className="text-[12px]" style={{ color: tail.color }}>
          {tail.text}
        </span>
      ) : (
        <span className="mono text-[12px] text-tx-3">{formatElapsed(elapsedFrom)}</span>
      )}
    </div>
  );
}

function dotForStatus(status: Run['status']): string {
  switch (status) {
    case 'running':
      return 'dot-success';
    case 'queued':
      return 'dot-warning';
    case 'awaiting_approval':
      return 'dot-danger';
    default:
      return 'dot-muted';
  }
}

function describeRun(run: Run): string {
  switch (run.status) {
    case 'running':
      return `running ${run.workflow_id}`;
    case 'queued':
      return `queued for ${run.workflow_id}`;
    case 'awaiting_approval':
      return `awaiting approval — ${run.workflow_id}`;
    default:
      return run.workflow_id;
  }
}

function tailForStatus(status: Run['status']): { text: string; color: string } | null {
  switch (status) {
    case 'queued':
      return { text: 'queued', color: 'var(--warning)' };
    case 'awaiting_approval':
      return { text: 'blocked', color: 'var(--danger)' };
    default:
      return null;
  }
}

function EmptyRow({ text, code }: { text: string; code?: string }) {
  return (
    <div className="px-4 py-6 text-[13px] text-tx-3">
      {text}
      {code && <code className="mono bg-bg-2 px-1.5 py-0.5 rounded text-tx-2">{code}</code>}
    </div>
  );
}

function Skeleton({ label, tone }: { label: string; tone?: 'danger' }) {
  return (
    <div className="px-4 py-6 text-[12px]">
      <span className={tone === 'danger' ? 'text-danger' : 'text-tx-3'}>{label}</span>
    </div>
  );
}
