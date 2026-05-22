import { useEffect, useState } from 'react';
import { apiGet, formatElapsed } from '../lib/api.ts';
import { useShell } from '../lib/shell-store.tsx';
import type { Run, RunStep } from '../lib/api-types.ts';
import { Terminal, X, ChevronRight } from 'lucide-react';

/**
 * Bottom drawer — "what's running right now" log feed. Polls /api/runs and
 * unfolds each running run's step list inline. Faz 8 will swap this for a
 * real stdout tail; today it's a structured event log.
 */
export function TerminalPanel() {
  const { terminalOpen, closeTerminal } = useShell();
  const [runs, setRuns] = useState<Run[]>([]);
  const [steps, setSteps] = useState<Record<number, RunStep[]>>({});

  useEffect(() => {
    if (!terminalOpen) return;
    let alive = true;
    const run = async () => {
      try {
        const r = await apiGet<{ runs: Run[] }>('/api/runs?limit=20');
        if (!alive) return;
        setRuns(r.runs);
        // Lazy-load steps for running runs only.
        const running = r.runs.filter((x) => x.status === 'running' || x.status === 'awaiting_approval');
        const next: Record<number, RunStep[]> = {};
        await Promise.all(
          running.map(async (rn) => {
            try {
              const d = await apiGet<{ steps: RunStep[] }>(`/api/runs/${rn.id}`);
              next[rn.id] = d.steps;
            } catch {
              /* swallow per-run errors */
            }
          }),
        );
        if (alive) setSteps(next);
      } catch {
        /* polling errors silently surface as stale data */
      }
    };
    void run();
    const id = setInterval(run, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [terminalOpen]);

  if (!terminalOpen) return null;

  return (
    <div
      className="fixed left-[var(--sidebar-w)] right-0 bottom-[var(--footer-h)] h-[280px] bg-bg-1 border-t border-border-default z-30 flex flex-col"
      style={{ boxShadow: '0 -8px 24px rgba(0,0,0,0.35)' }}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
        <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.10em] text-tx-2">
          <Terminal size={13} className="text-accent" />
          Live runs
        </div>
        <button
          type="button"
          onClick={closeTerminal}
          className="text-tx-3 hover:text-tx-1 transition-colors duration-200"
          aria-label="Close terminal"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto mono text-[12px] leading-[1.55] px-4 py-3 space-y-1.5">
        {runs.length === 0 ? (
          <div className="text-tx-3">No runs yet.</div>
        ) : (
          runs.map((r) => (
            <div key={r.id}>
              <div className="text-tx-2">
                <span className="text-tx-3">#{r.id}</span>{' '}
                <span className={runStatusColor(r.status)}>{r.status}</span>{' '}
                <span className="text-accent-soft">{r.workflow_id}</span>
                {r.item_id && <span className="text-tx-3"> · {r.item_id}</span>}
                <span className="text-tx-disabled"> · {formatElapsed(r.created_at)} ago</span>
              </div>
              {(steps[r.id] ?? []).map((s) => (
                <div key={s.id} className="text-tx-3 pl-5 flex items-center gap-1">
                  <ChevronRight size={10} className="opacity-60" />
                  <span className={stepStatusColor(s.status)}>{s.status}</span>
                  <span>·</span>
                  <span className="text-tx-2">{s.step_name}</span>
                  {s.persona && <span className="text-accent-soft">{s.persona}</span>}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function runStatusColor(s: Run['status']): string {
  switch (s) {
    case 'running': return 'text-signal';
    case 'failed': return 'text-danger';
    case 'succeeded': return 'text-success';
    case 'awaiting_approval': return 'text-warning';
    default: return 'text-tx-3';
  }
}

function stepStatusColor(s: RunStep['status']): string {
  switch (s) {
    case 'running': return 'text-signal';
    case 'failed': return 'text-danger';
    case 'succeeded': return 'text-success';
    case 'skipped': return 'text-tx-disabled';
    default: return 'text-tx-3';
  }
}
