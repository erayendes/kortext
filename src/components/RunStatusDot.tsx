import type { RunStatus } from '../lib/api-types.ts';

type Props = { status: RunStatus };

const MAP: Record<RunStatus, { dot: string; label: string; pulse: boolean }> = {
  queued: { dot: 'dot-muted', label: 'queued', pulse: false },
  running: { dot: 'dot-signal', label: 'running', pulse: true },
  awaiting_approval: { dot: 'dot-warning', label: 'awaiting approval', pulse: false },
  succeeded: { dot: 'dot-success', label: 'succeeded', pulse: false },
  failed: { dot: 'dot-danger', label: 'failed', pulse: false },
  cancelled: { dot: 'dot-muted', label: 'cancelled', pulse: false },
};

export function RunStatusDot({ status }: Props) {
  const v = MAP[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`dot ${v.dot}${v.pulse ? ' dot-pulse' : ''}`} />
      <span className="text-[12px] text-tx-2">{v.label}</span>
    </span>
  );
}
