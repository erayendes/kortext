import { PageHeader } from '../components/PageHeader.tsx';
import { RunsTable } from '../components/RunsTable.tsx';
import { PendingQuestionsCard } from '../components/PendingQuestionsCard.tsx';
import { DoctorBadge } from '../components/DoctorBadge.tsx';

export function DashboardRoute() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Active runs, queue, pending approvals — operations at a glance."
        actions={<DoctorBadge />}
      />
      <div className="px-6 py-5 grid gap-5" style={{ gridTemplateColumns: '1fr 360px' }}>
        <RunsTable />
        <PendingQuestionsCard />
      </div>
    </>
  );
}
