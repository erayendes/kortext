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
  // Group open gate questions by their run, so we can close the ones belonging
  // to runs we're about to orphan. Without this, a cancelled run leaves its
  // +prime questions 'open' — and when analysis re-triggers, the NEW run shows
  // the OLD run's gates as still pending (stale "review" on every step).
  const openByRun = new Map<number, number[]>();
  for (const q of repos.pendingQuestions.listOpen()) {
    if (q.run_id == null) continue;
    const list = openByRun.get(q.run_id) ?? [];
    list.push(q.id);
    openByRun.set(q.run_id, list);
  }
  for (const run of running) {
    repos.runs.transitionRun(run.id, 'cancelled', { error_message: ORPHANED_MESSAGE });
    const staleQuestions = openByRun.get(run.id) ?? [];
    for (const qid of staleQuestions) repos.pendingQuestions.transition(qid, 'cancelled');
    repos.auditLog.append({
      actor: 'system',
      action: 'run.orphaned-recovered',
      resource_type: 'run',
      resource_id: String(run.id),
      payload: {
        previous_status: 'running',
        workflow_id: run.workflow_id,
        worktree_path: run.worktree_path,
        cancelled_questions: staleQuestions.length,
      },
    });
    recovered.push(run.id);
  }
  return { recovered };
}
