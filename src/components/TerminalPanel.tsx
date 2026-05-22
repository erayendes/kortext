import { useEffect, useState } from 'react';
import { apiGet, formatElapsed } from '../lib/api.ts';
import { useShell } from '../lib/shell-store.tsx';
import type { BlueprintStatusResponse, Run, RunStep } from '../lib/api-types.ts';
import { ChevronDown, Minus, X } from 'lucide-react';

/**
 * Bottom-right floating panel — `kortext@<project-code>` log feed.
 * Polls /api/runs and unfolds each running run's step list inline.
 * Minimized: 220×30 tab in the bottom-right corner. Expanded: 480×320 panel.
 */
export function TerminalPanel() {
  const { terminalOpen, closeTerminal } = useShell();
  const [expanded, setExpanded] = useState(true);
  const [runs, setRuns] = useState<Run[]>([]);
  const [steps, setSteps] = useState<Record<number, RunStep[]>>({});
  const [projectCode, setProjectCode] = useState<string>('kortext');

  useEffect(() => {
    if (!terminalOpen) return;
    apiGet<BlueprintStatusResponse>('/api/blueprint/status')
      .then((res) => {
        if (res.project) setProjectCode(res.project.code.toLowerCase());
      })
      .catch(() => {
        /* fall back to "kortext" */
      });
  }, [terminalOpen]);

  useEffect(() => {
    if (!terminalOpen || !expanded) return;
    let alive = true;
    const run = async () => {
      try {
        const r = await apiGet<{ runs: Run[] }>('/api/runs?limit=20');
        if (!alive) return;
        setRuns(r.runs);
        const running = r.runs.filter(
          (x) => x.status === 'running' || x.status === 'awaiting_approval',
        );
        const next: Record<number, RunStep[]> = {};
        await Promise.all(
          running.map(async (rn) => {
            try {
              const d = await apiGet<{ steps: RunStep[] }>(`/api/runs/${rn.id}`);
              next[rn.id] = d.steps;
            } catch {
              /* per-run swallow */
            }
          }),
        );
        if (alive) setSteps(next);
      } catch {
        /* polling errors surface as stale data */
      }
    };
    void run();
    const id = setInterval(run, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [terminalOpen, expanded]);

  if (!terminalOpen) return null;

  return (
    <div
      className="fixed z-30 flex flex-col rounded-md overflow-hidden"
      style={{
        right: '16px',
        bottom: 'calc(var(--footer-h) + 12px)',
        width: expanded ? '480px' : '220px',
        height: expanded ? '320px' : '30px',
        background: 'var(--bg-1)',
        border: '1px solid var(--border-default)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        transition: 'width 180ms ease-out, height 180ms ease-out',
      }}
    >
      {/* Title bar — looks like a terminal tab */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between px-3 h-[30px] flex-shrink-0 cursor-pointer w-full"
        style={{
          background: 'var(--bg-2)',
          borderBottom: expanded ? '1px solid var(--border-subtle)' : 'none',
        }}
      >
        <div className="flex items-center gap-2 mono text-[11px] text-tx-2">
          <span style={{ color: 'var(--accent)' }}>{'>_'}</span>
          <span>
            kortext@{projectCode}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {expanded ? (
            <Minus
              size={12}
              className="text-tx-3 hover:text-tx-1"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(false);
              }}
            />
          ) : (
            <ChevronDown
              size={12}
              className="text-tx-3 hover:text-tx-1"
              style={{ transform: 'rotate(180deg)' }}
            />
          )}
          <X
            size={12}
            className="text-tx-3 hover:text-tx-1 ml-1"
            onClick={(e) => {
              e.stopPropagation();
              closeTerminal();
            }}
          />
        </div>
      </button>

      {expanded ? (
        <div
          className="flex-1 overflow-y-auto mono text-[11px] leading-[1.55] px-3 py-2 space-y-1"
          style={{ color: 'var(--tx-2)' }}
        >
          {runs.length === 0 ? (
            <div className="text-tx-3">No runs yet.</div>
          ) : (
            runs.map((r) => (
              <div key={r.id}>
                <div>
                  <span className="text-tx-3">#{r.id}</span>{' '}
                  <span style={{ color: runStatusColor(r.status) }}>{r.status}</span>{' '}
                  <span style={{ color: 'var(--accent-soft)' }}>{r.workflow_id}</span>
                  {r.item_id ? (
                    <span className="text-tx-3"> · {r.item_id}</span>
                  ) : null}
                  <span className="text-tx-disabled"> · {formatElapsed(r.created_at)} ago</span>
                </div>
                {(steps[r.id] ?? []).map((s) => (
                  <div key={s.id} className="text-tx-3 pl-4">
                    <span style={{ color: stepStatusColor(s.status) }}>›</span>{' '}
                    <span style={{ color: stepStatusColor(s.status) }}>{s.status}</span>{' '}
                    <span className="text-tx-2">{s.step_name}</span>
                    {s.persona ? (
                      <span style={{ color: 'var(--accent-soft)' }}> {s.persona}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function runStatusColor(s: Run['status']): string {
  switch (s) {
    case 'running':
      return 'var(--signal)';
    case 'failed':
      return 'var(--danger)';
    case 'succeeded':
      return 'var(--success)';
    case 'awaiting_approval':
      return 'var(--warning)';
    default:
      return 'var(--tx-3)';
  }
}

function stepStatusColor(s: RunStep['status']): string {
  switch (s) {
    case 'running':
      return 'var(--signal)';
    case 'failed':
      return 'var(--danger)';
    case 'succeeded':
      return 'var(--success)';
    case 'skipped':
      return 'var(--tx-disabled)';
    default:
      return 'var(--tx-3)';
  }
}
