import { useMemo } from 'react';
import { usePolling, formatElapsed } from '../lib/api.ts';
import { useShell } from '../lib/shell-store.tsx';
import type { Handover, Run } from '../lib/api-types.ts';
import { Activity, X, ArrowRight } from 'lucide-react';

type Event =
  | {
      kind: 'run';
      id: string;
      at: number;
      run: Run;
    }
  | {
      kind: 'handover';
      id: string;
      at: number;
      handover: Handover;
    };

/**
 * Right-side drawer — recent activity. Mixes handovers + runs into a single
 * reverse-chronological stream. Refreshes via two independent polls (5s).
 */
export function TimelinePanel() {
  const { timelineOpen, closeTimeline } = useShell();
  const { data: runsData } = usePolling<{ runs: Run[] }>('/api/runs?limit=20', 5000);
  const { data: hData } = usePolling<{ handovers: Handover[] }>('/api/handovers?limit=20', 5000);

  const events = useMemo<Event[]>(() => {
    if (!timelineOpen) return [];
    const list: Event[] = [];
    for (const r of runsData?.runs ?? []) {
      list.push({
        kind: 'run',
        id: `r-${r.id}`,
        at: r.started_at ?? r.created_at,
        run: r,
      });
    }
    for (const h of hData?.handovers ?? []) {
      list.push({ kind: 'handover', id: `h-${h.id}`, at: h.created_at, handover: h });
    }
    list.sort((a, b) => b.at - a.at);
    return list.slice(0, 30);
  }, [timelineOpen, runsData, hData]);

  if (!timelineOpen) return null;

  return (
    <aside
      className="fixed top-[var(--header-h)] bottom-[var(--footer-h)] right-0 w-[340px] bg-bg-1 border-l border-border-default z-30 flex flex-col"
      style={{ boxShadow: '-8px 0 24px rgba(0,0,0,0.35)' }}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
        <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.10em] text-tx-2">
          <Activity size={13} className="text-accent" />
          Timeline
        </div>
        <button
          type="button"
          onClick={closeTimeline}
          className="text-tx-3 hover:text-tx-1 transition-colors duration-200"
          aria-label="Close timeline"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {events.length === 0 ? (
          <div className="px-2 py-4 text-[13px] text-tx-3">No recent events.</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((e) => (
              <li key={e.id} className="grid items-start gap-2"
                  style={{ gridTemplateColumns: '54px 14px 1fr' }}>
                <span className="mono text-[11px] text-tx-3 mt-0.5">{formatElapsed(e.at)}</span>
                <span className="mt-1">
                  {e.kind === 'run' ? (
                    <span className={`dot ${runDot(e.run.status)}${e.run.status === 'running' ? ' dot-pulse' : ''}`} />
                  ) : (
                    <ArrowRight size={11} className="text-accent-soft" />
                  )}
                </span>
                <div className="text-[12px] text-tx-2 leading-snug">
                  {e.kind === 'run' ? <RunEvent run={e.run} /> : <HandoverEvent h={e.handover} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function RunEvent({ run }: { run: Run }) {
  return (
    <span>
      <span className="text-tx-3">run </span>
      <span className="mono">#{run.id}</span>
      <span className="text-tx-disabled mx-1">·</span>
      <span className={runText(run.status)}>{run.status}</span>
      <span className="text-tx-disabled mx-1">·</span>
      <span className="mono text-accent-soft">{run.workflow_id}</span>
      {run.item_id && (
        <>
          <span className="text-tx-disabled mx-1">·</span>
          <span className="mono text-tx-3">{run.item_id}</span>
        </>
      )}
    </span>
  );
}

function HandoverEvent({ h }: { h: Handover }) {
  return (
    <span>
      <span className="mono text-accent-soft">{h.from_persona}</span>
      <span className="text-tx-3 mx-1">→</span>
      <span className="mono text-signal-soft">{h.to_persona}</span>
      {h.item_id && (
        <>
          <span className="text-tx-disabled mx-1">·</span>
          <span className="mono text-tx-3">{h.item_id}</span>
        </>
      )}
      {h.reason && (
        <>
          <span className="text-tx-disabled mx-1">—</span>
          <span className="text-tx-2">{h.reason}</span>
        </>
      )}
    </span>
  );
}

function runDot(s: Run['status']): string {
  switch (s) {
    case 'running': return 'dot-signal';
    case 'failed': return 'dot-danger';
    case 'succeeded': return 'dot-success';
    case 'awaiting_approval': return 'dot-warning';
    default: return 'dot-muted';
  }
}

function runText(s: Run['status']): string {
  switch (s) {
    case 'running': return 'text-signal';
    case 'failed': return 'text-danger';
    case 'succeeded': return 'text-success';
    case 'awaiting_approval': return 'text-warning';
    default: return 'text-tx-3';
  }
}
