import { usePolling, formatElapsed } from '../lib/api.ts';
import type { Run } from '../lib/api-types.ts';
import { RunStatusDot } from './RunStatusDot.tsx';

const ACTIVE: Run['status'][] = ['queued', 'running', 'awaiting_approval'];

export function RunsTable() {
  const { data, error, loading, tick } = usePolling<{ runs: Run[] }>(
    '/api/runs',
    3000,
  );

  if (loading && !data) {
    return <Skeleton label="loading runs…" />;
  }
  if (error) {
    return <Skeleton label={`error: ${error}`} tone="danger" />;
  }
  const runs = data?.runs ?? [];
  const active = runs.filter((r) => ACTIVE.includes(r.status));
  const recent = runs
    .filter((r) => !ACTIVE.includes(r.status))
    .slice(0, 5);

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-1">
      <SectionHeader title="Active work" sub={`${active.length} running / queued`} tick={tick} />
      {active.length === 0 ? (
        <EmptyRow text="No active runs. Start one with " code="kortext start <workflow-id>" />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {active.map((r) => (
            <RunRow key={r.id} run={r} />
          ))}
        </ul>
      )}

      {recent.length > 0 && (
        <>
          <SectionHeader title="Recent" sub={`${recent.length} of ${runs.length - active.length} finished`} />
          <ul className="divide-y divide-border-subtle">
            {recent.map((r) => (
              <RunRow key={r.id} run={r} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function RunRow({ run }: { run: Run }) {
  const elapsedFrom = run.started_at ?? run.created_at;
  return (
    <li
      className="grid items-center gap-3 px-4 py-3 hover:bg-bg-2 transition-colors duration-200"
      style={{ gridTemplateColumns: '18px 90px 1fr 140px 80px' }}
    >
      <RunStatusDotInline status={run.status} />
      <span className="mono text-[12px] text-tx-3">#{run.id}</span>
      <span className="text-[13px] text-tx-1 truncate">
        <span className="mono text-accent-soft">{run.workflow_id}</span>
        {run.item_id && (
          <>
            <span className="text-tx-disabled mx-2">·</span>
            <span className="mono text-tx-3">{run.item_id}</span>
          </>
        )}
      </span>
      <RunStatusDot status={run.status} />
      <span className="mono text-[12px] text-tx-3 text-right">
        {formatElapsed(elapsedFrom)}
      </span>
    </li>
  );
}

function RunStatusDotInline({ status }: { status: Run['status'] }) {
  const cls =
    status === 'running'
      ? 'dot dot-signal dot-pulse'
      : status === 'failed'
        ? 'dot dot-danger'
        : status === 'awaiting_approval'
          ? 'dot dot-warning'
          : status === 'succeeded'
            ? 'dot dot-success'
            : 'dot dot-muted';
  return <span className={cls} />;
}

function SectionHeader({ title, sub, tick }: { title: string; sub: string; tick?: number }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-bg-1">
      <div>
        <div className="text-[12px] uppercase tracking-[0.10em] text-tx-2">{title}</div>
        <div className="text-[11px] text-tx-3 mt-0.5">{sub}</div>
      </div>
      {tick !== undefined && (
        <span className="text-[10px] text-tx-disabled mono">tick {tick}</span>
      )}
    </div>
  );
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
    <div className="rounded-lg border border-border-subtle bg-bg-1 px-4 py-6 text-[12px]">
      <span className={tone === 'danger' ? 'text-danger' : 'text-tx-3'}>{label}</span>
    </div>
  );
}
