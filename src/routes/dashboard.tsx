import { PanelRight, RefreshCw } from 'lucide-react';
import { usePolling } from '../lib/api.ts';
import type { Run } from '../lib/api-types.ts';
import { RunsTable } from '../components/RunsTable.tsx';
import { TimelineSidebar } from '../components/TimelineSidebar.tsx';

export function DashboardRoute() {
  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0 overflow-y-auto px-8 py-6">
        <DashboardHeader />
        <RunsTable />
      </div>
      <TimelineSidebar />
    </div>
  );
}

function DashboardHeader() {
  const { data, refresh } = usePolling<{ runs: Run[] }>('/api/runs', 3000);
  const runs = data?.runs ?? [];
  const active = runs.find(
    (r) => r.status === 'running' || r.status === 'awaiting_approval',
  );
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold text-tx-1">Dashboard</h1>
        <p className="mt-1 text-[13px] text-tx-3">
          {active ? (
            <>
              <span className="mono">{active.workflow_id}</span>
              <span> · </span>
              <span>run #{active.id}</span>
            </>
          ) : (
            <span>idle — no workflow currently running</span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-xs"
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
