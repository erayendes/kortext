import { usePolling } from '../lib/api.ts';
import type { DoctorReport } from '../lib/api-types.ts';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

/**
 * Compact health rosette at the top of the dashboard.
 * Polls /api/doctor every 10s — the report is cheap (registry+repos snapshot).
 */
export function DoctorBadge() {
  const { data, error } = usePolling<DoctorReport>('/api/doctor', 10_000);

  if (error) {
    return (
      <span className="inline-flex items-center gap-2 text-[12px] text-danger">
        <XCircle size={13} /> health check failed
      </span>
    );
  }
  if (!data) {
    return <span className="text-[12px] text-tx-3">checking health…</span>;
  }

  const errors = data.findings.filter((f) => f.severity === 'error').length;
  const warns = data.findings.filter((f) => f.severity === 'warn').length;
  const { workflowsLoaded, personasLoaded } = data.summary;

  if (errors > 0) {
    return (
      <span className="inline-flex items-center gap-2 text-[12px] text-danger">
        <XCircle size={13} /> {errors} health error{errors === 1 ? '' : 's'}
      </span>
    );
  }
  if (warns > 0) {
    return (
      <span className="inline-flex items-center gap-2 text-[12px] text-warning">
        <AlertTriangle size={13} /> {warns} warning{warns === 1 ? '' : 's'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-[12px] text-success">
      <CheckCircle2 size={13} /> healthy
      <span className="mono text-tx-3 text-[11px]">
        · {workflowsLoaded} wf · {personasLoaded} personas
      </span>
    </span>
  );
}
