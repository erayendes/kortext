import type { WorkflowGraph } from './dag.ts';
import type { Executor, ExecutorContext } from './executor.ts';
import type { Repositories } from '../db/repositories/index.ts';
import type { Run } from '../db/schemas.ts';

/**
 * Worker pool that drives a single workflow run against the DB.
 *
 * Scheduling:
 *   - Maintain a Set<string> of completed step keys.
 *   - On each "tick" pull `graph.readyKeys(done)` and start as many as concurrency allows.
 *   - When a step settles, mark done (success) or trigger cancellation (failure).
 *
 * DB lifecycle:
 *   - Run row is moved to 'running' on start, 'succeeded'/'failed' on finish.
 *   - Each step has a row pre-created in 'pending'; updated to 'running'/'succeeded'/'failed'/'skipped'.
 *   - Audit log gets append-only entries for run+step transitions.
 *
 * Failure semantics:
 *   - First failure cancels in-flight via AbortController.
 *   - Remaining un-started steps are marked 'skipped'.
 *   - Run ends as 'failed' with the first error_message.
 */

export type RunWorkflowOptions = {
  concurrency?: number;
  triggeredBy?: string;
  itemId?: string | null;
  worktreePath?: string;
};

export type RunWorkflowResult = {
  run: Run;
  failedStepKey: string | null;
};

export async function runWorkflow(
  graph: WorkflowGraph,
  executor: Executor,
  repos: Repositories,
  options: RunWorkflowOptions = {},
): Promise<RunWorkflowResult> {
  const concurrency = Math.max(1, options.concurrency ?? 3);
  const triggeredBy = options.triggeredBy ?? 'system';

  const run = repos.runs.createRun({
    workflow_id: graph.workflowId,
    item_id: options.itemId ?? null,
    status: 'queued',
    worktree_path: options.worktreePath ?? null,
    triggered_by: triggeredBy,
  });
  repos.runs.transitionRun(run.id, 'running');
  repos.auditLog.append({
    actor: 'system',
    action: 'pipeline.started',
    resource_type: 'run',
    resource_id: String(run.id),
    payload: { workflow_id: graph.workflowId, concurrency },
  });

  // Pre-create step rows so the dashboard can render the full plan immediately.
  const stepRowByKey = new Map<string, number>();
  const orderedNodes = [...graph.nodes.values()].sort((a, b) => a.step.index - b.step.index);
  for (const node of orderedNodes) {
    const row = repos.runs.addStep({
      run_id: run.id,
      step_index: node.step.index,
      step_name: `${node.step.phase} — ${node.step.persona ?? '(no persona)'}: ${node.step.description.slice(0, 80)}`,
      persona: node.step.persona,
      status: 'pending',
    });
    stepRowByKey.set(node.step.key, row.id);
  }

  const done = new Set<string>();
  const running = new Map<string, Promise<void>>();
  const aborter = new AbortController();
  let failedStepKey: string | null = null;
  let firstError: string | null = null;

  const ctxFor = (runStepId: number): ExecutorContext => ({
    workflowId: graph.workflowId,
    runId: run.id,
    runStepId,
    worktreePath: options.worktreePath ?? process.cwd(),
    signal: aborter.signal,
  });

  const launch = (stepKey: string): void => {
    const node = graph.nodes.get(stepKey);
    if (!node) return;
    const runStepId = stepRowByKey.get(stepKey)!;
    repos.runs.transitionStep(runStepId, 'running');
    repos.auditLog.append({
      actor: executor.name,
      action: 'pipeline.step.started',
      resource_type: 'run_step',
      resource_id: String(runStepId),
      payload: { run_id: run.id, step_key: stepKey, persona: node.step.persona },
    });

    const promise = executor
      .execute(node.step, ctxFor(runStepId))
      .then((result) => {
        if (result.ok) {
          repos.runs.transitionStep(runStepId, 'succeeded', {
            output_summary: result.outputSummary ?? null,
            log_path: result.logPath ?? null,
          });
          repos.auditLog.append({
            actor: executor.name,
            action: 'pipeline.step.succeeded',
            resource_type: 'run_step',
            resource_id: String(runStepId),
            payload: { run_id: run.id, step_key: stepKey },
          });
          done.add(stepKey);
        } else {
          repos.runs.transitionStep(runStepId, 'failed', {
            output_summary: result.outputSummary ?? null,
            error_message: result.errorMessage ?? 'unknown failure',
            log_path: result.logPath ?? null,
          });
          repos.auditLog.append({
            actor: executor.name,
            action: 'pipeline.step.failed',
            resource_type: 'run_step',
            resource_id: String(runStepId),
            payload: { run_id: run.id, step_key: stepKey, error: result.errorMessage },
          });
          if (!failedStepKey) {
            failedStepKey = stepKey;
            firstError = result.errorMessage ?? null;
            aborter.abort();
          }
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        repos.runs.transitionStep(runStepId, 'failed', { error_message: msg });
        if (!failedStepKey) {
          failedStepKey = stepKey;
          firstError = msg;
          aborter.abort();
        }
      })
      .finally(() => {
        running.delete(stepKey);
      });

    running.set(stepKey, promise);
  };

  // Scheduler loop.
  while (done.size + (failedStepKey ? 1 : 0) < graph.size || running.size > 0) {
    if (!failedStepKey) {
      const ready = graph.readyKeys(done).filter((k) => !running.has(k));
      while (ready.length > 0 && running.size < concurrency) {
        const next = ready.shift()!;
        launch(next);
      }
    }

    if (running.size === 0) break;
    await Promise.race(running.values());
  }

  // Mark any un-started steps as skipped (only happens after a failure).
  if (failedStepKey) {
    for (const [key, rowId] of stepRowByKey) {
      if (done.has(key)) continue;
      if (key === failedStepKey) continue;
      const row = repos.runs.getStep(rowId);
      if (row && row.status === 'pending') {
        repos.runs.transitionStep(rowId, 'skipped');
      }
    }
  }

  const finalStatus = failedStepKey ? 'failed' : 'succeeded';
  const finalRun = repos.runs.transitionRun(run.id, finalStatus, {
    error_message: firstError,
  });
  repos.auditLog.append({
    actor: 'system',
    action: `pipeline.${finalStatus}`,
    resource_type: 'run',
    resource_id: String(run.id),
    payload: {
      workflow_id: graph.workflowId,
      failed_step: failedStepKey,
      step_count: graph.size,
    },
  });

  return { run: finalRun, failedStepKey };
}
