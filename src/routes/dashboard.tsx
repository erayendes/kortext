import { Activity } from 'lucide-react';
import { usePolling } from '../lib/api.ts';
import type { Run } from '../lib/api-types.ts';
import { RunsTable } from '../components/RunsTable.tsx';
import { PendingQuestionsCard } from '../components/PendingQuestionsCard.tsx';
import { DoctorBadge } from '../components/DoctorBadge.tsx';
import { useShell } from '../lib/shell-store.tsx';

export function DashboardRoute() {
  const { toggleTimeline } = useShell();
  return (
    <>
      <DashboardHeader onTimeline={toggleTimeline} />
      <div
        className="px-6 py-5 grid gap-5"
        style={{ gridTemplateColumns: '1fr 360px' }}
      >
        <RunsTable />
        <PendingQuestionsCard />
      </div>
    </>
  );
}

function DashboardHeader({ onTimeline }: { onTimeline: () => void }) {
  const { data } = usePolling<{ runs: Run[] }>('/api/runs', 3000);
  const runs = data?.runs ?? [];
  const active = runs.find(
    (r) => r.status === 'running' || r.status === 'awaiting_approval',
  );
  return (
    <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-border-subtle">
      <div className="min-w-0">
        <h1 className="text-[20px] font-semibold tracking-tight text-tx-1">Dashboard</h1>
        <div className="mt-1 flex items-center gap-2 text-[12px] text-tx-3">
          {active ? (
            <>
              <span className="mono" style={{ color: 'var(--accent)' }}>
                {active.workflow_id}
              </span>
              <span>·</span>
              <span>run #{active.id}</span>
              <span>·</span>
              <span>{active.status}</span>
            </>
          ) : (
            <span>idle — no workflow currently running</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <DoctorBadge />
        <button
          type="button"
          onClick={onTimeline}
          className="flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-md text-tx-2 hover:text-tx-1 hover:bg-bg-2 transition-colors"
          style={{ border: '1px solid var(--border-default)' }}
        >
          <Activity size={13} />
          Timeline
        </button>
      </div>
    </div>
  );
}
