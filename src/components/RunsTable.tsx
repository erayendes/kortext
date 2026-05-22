import { usePolling, formatElapsed } from '../lib/api.ts';
import type { Run } from '../lib/api-types.ts';
import { personaPalette } from '../lib/persona-colors.ts';
import { primaryPersonaFor } from '../lib/workflow-primary-persona.ts';

const ACTIVE: Run['status'][] = ['queued', 'running', 'awaiting_approval'];

export function RunsTable() {
  const { data, error, loading } = usePolling<{ runs: Run[] }>(
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
    <div
      className="rounded-lg border border-border-subtle"
      style={{ background: 'var(--bg-1)' }}
    >
      <Section
        title="Active work"
        sub={
          active.length === 0
            ? 'No agents running'
            : `${active.length} agent${active.length === 1 ? '' : 's'} currently running tasks`
        }
      />
      {active.length === 0 ? (
        <EmptyRow text="No active runs. Start one with " code="kortext start <workflow-id>" />
      ) : (
        <>
          <ColumnHeader />
          <ul>
            {active.map((r) => (
              <RunRow key={r.id} run={r} />
            ))}
          </ul>
        </>
      )}

      {recent.length > 0 && (
        <>
          <Section
            title="Recent"
            sub={`${recent.length} of ${runs.length - active.length} finished`}
          />
          <ColumnHeader />
          <ul>
            {recent.map((r) => (
              <RunRow key={r.id} run={r} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ColumnHeader() {
  return (
    <div
      className="grid items-center gap-3 px-4 py-2 border-b text-[10px] uppercase tracking-[0.10em] text-tx-3"
      style={{
        gridTemplateColumns: '32px 180px 1fr 60px 90px',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <span />
      <span>Persona</span>
      <span>Task</span>
      <span className="text-right">Step</span>
      <span className="text-right">Elapsed</span>
    </div>
  );
}

function RunRow({ run }: { run: Run }) {
  const persona = primaryPersonaFor(run.workflow_id);
  const palette = personaPalette(persona);
  const elapsedFrom = run.started_at ?? run.created_at;
  const taskLabel = run.item_id
    ? `${run.workflow_id} · ${run.item_id}`
    : run.workflow_id;
  return (
    <li
      className="grid items-center gap-3 px-4 py-3 border-b hover:bg-bg-2 transition-colors duration-200"
      style={{
        gridTemplateColumns: '32px 180px 1fr 60px 90px',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <Avatar palette={palette} />
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="mono text-[12px] font-medium truncate"
          style={{ color: palette.color }}
        >
          {persona.replace(/^\+/, '+')}
        </span>
      </div>
      <span className="text-[13px] text-tx-2 truncate">
        <span className="mono">#{run.id}</span>
        <span className="text-tx-disabled mx-2">·</span>
        <span className="mono text-tx-3">{taskLabel}</span>
      </span>
      <span className="mono text-[11px] text-tx-3 text-right">
        {run.status === 'running' ? '…' : statusGlyph(run.status)}
      </span>
      <span className="mono text-[11px] text-tx-3 text-right">
        {formatElapsed(elapsedFrom)}
      </span>
    </li>
  );
}

function Avatar({ palette }: { palette: { color: string; initials: string } }) {
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold mono flex-shrink-0"
      style={{
        background: palette.color,
        color: needsDarkText(palette.color) ? '#0A0814' : '#fff',
      }}
    >
      {palette.initials}
    </div>
  );
}

function needsDarkText(hex: string): boolean {
  // Pick dark text for light / mid-tone backgrounds (cyan, teal, yellow,
  // amber). Quick luma estimate; not perceptually perfect but matches the
  // mockup picks where dark text reads cleanly on warmer hues.
  const v = hex.replace('#', '');
  if (v.length !== 6) return false;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.55;
}

function statusGlyph(status: Run['status']): string {
  switch (status) {
    case 'succeeded':
      return '✓';
    case 'failed':
      return '✗';
    case 'cancelled':
      return '—';
    case 'awaiting_approval':
      return 'gate';
    case 'queued':
      return 'queue';
    default:
      return '—';
  }
}

function Section({ title, sub }: { title: string; sub: string }) {
  return (
    <div
      className="px-4 py-2.5 border-b"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div className="text-[10px] uppercase tracking-[0.10em] text-tx-3">{title}</div>
      <div className="text-[12px] text-tx-2 mt-0.5">{sub}</div>
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
    <div
      className="rounded-lg border px-4 py-6 text-[12px]"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-1)' }}
    >
      <span className={tone === 'danger' ? 'text-danger' : 'text-tx-3'}>{label}</span>
    </div>
  );
}
