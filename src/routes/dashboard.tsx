import { PanelRight, RefreshCw } from 'lucide-react';
import { usePolling } from '../lib/api.ts';
import type { Run, RunStep } from '../lib/api-types.ts';
import { stepProgress } from '../lib/active-run.ts';
import { RunsTable } from '../components/RunsTable.tsx';
import { TimelineSidebar } from '../components/TimelineSidebar.tsx';
import { useShell } from '../lib/shell-store.tsx';

export function DashboardRoute() {
  const { timelineOpen } = useShell();
  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0 overflow-y-auto px-8 py-6">
        <DashboardHeader />
        <RunsTable />
      </div>
      {timelineOpen && <TimelineSidebar />}
    </div>
  );
}

function DashboardHeader() {
  const { data, refresh } = usePolling<{ runs: Run[] }>('/api/runs', 3000);
  const { timelineOpen, toggleTimeline } = useShell();
  const runs = data?.runs ?? [];
  const active = runs.find(
    (r) => r.status === 'running' || r.status === 'awaiting_approval',
  );
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold text-tx-1">Dashboard</h1>
        {active ? (
          <ActiveSubtitle run={active} />
        ) : (
          <p className="mt-1 text-[13px] text-tx-3">
            idle — no workflow currently running
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTimeline}
          className={timelineOpen ? 'btn btn-outline btn-xs' : 'btn btn-ghost btn-xs'}
          style={timelineOpen ? { color: 'var(--accent)' } : undefined}
        >
          <PanelRight size={12} /> Timeline
        </button>
        <button
          type="button"
          onClick={() => refresh()}
          className="btn btn-outline btn-xs"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
    </div>
  );
}

function ActiveSubtitle({ run }: { run: Run }) {
  const { data } = usePolling<{ run: Run; steps: RunStep[] }>(
    `/api/runs/${run.id}`,
    3000,
  );
  const step = stepProgress(data?.steps ?? []);
  return (
    <p className="mt-1 text-[13px] text-tx-3">
      <span className="mono">{run.workflow_id}</span>
      <span> · </span>
      {step ? (
        <span>
          step {step.current}/{step.total}
        </span>
      ) : (
        <span>run #{run.id}</span>
      )}
    </p>
  );
}
