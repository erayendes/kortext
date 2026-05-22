import type { Repositories } from '../db/repositories/index.ts';

/**
 * Resume / orphan-recovery on server boot.
 *
 * A 'running' run in the DB after restart is a zombie — the worker-pool that
 * was driving it is gone. We flip these to 'cancelled' with a distinguishable
 * error_message prefix so:
 *
 *   - the dashboard can render them as "interrupted" rather than "failed"
 *   - `Orchestrator.retryRun()` can re-pick them up alongside rejected runs
 *
 * We deliberately do NOT auto-restart: the user must explicitly retry so they
 * can inspect / fix the worktree first.
 */

export const ORPHANED_PREFIX = 'orphaned:';
export const ORPHANED_MESSAGE = `${ORPHANED_PREFIX} server restarted`;

export type ResumeSummary = {
  recovered: number[];
};

export function resumeOrphanedRuns(repos: Repositories): ResumeSummary {
  const running = repos.runs.listRuns({ status: 'running', limit: 1000 });
  const recovered: number[] = [];
  for (const run of running) {
    repos.runs.transitionRun(run.id, 'cancelled', { error_message: ORPHANED_MESSAGE });
    repos.auditLog.append({
      actor: 'system',
      action: 'run.orphaned-recovered',
      resource_type: 'run',
      resource_id: String(run.id),
      payload: {
        previous_status: 'running',
        workflow_id: run.workflow_id,
        worktree_path: run.worktree_path,
      },
    });
    recovered.push(run.id);
  }
  return { recovered };
}
