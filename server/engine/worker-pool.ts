import { readFileSync } from 'node:fs';
import type { WorkflowGraph } from './dag.ts';
import type { Executor, ExecutorContext } from './executor.ts';
import type { Repositories } from '../db/repositories/index.ts';
import type { Run } from '../db/schemas.ts';
import type { SecretScanner } from '../safety/secret-scanner.ts';
import type { HarmfulOutputFilter } from '../safety/harmful-output-filter.ts';
import type { ApprovalGate } from './workflow-parser.ts';
import type { RunRegistry } from './run-registry.ts';
import { findActualOutputFiles } from './output-resolver.ts';

export type GatePauseContext = {
  gate: ApprovalGate;
  runId: number;
  workflowId: string;
};

export type GateDecision =
  | { decision: 'approve' }
  | { decision: 'reject'; reason: string };

export type GateController = {
  pauseAtGate(ctx: GatePauseContext): Promise<GateDecision>;
};

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

/**
 * Callback invoked once per declared output file after a step succeeds.
 *
 * v3.1 Faz 12.5 uses this to back-fill `reports_index` for outputs that the
 * executor wrote into `.kortext/reports/` with a per-file naming pattern.
 *
 * Implementations must be best-effort: failures are swallowed so engine flow
 * is never blocked by index bookkeeping. Returning a value is not required.
 */
export type OutputIndexer = (input: {
  absolutePath: string;
  step: import('./workflow-parser.ts').WorkflowStep;
  runId: number;
}) => void;

export type SafetyGuards = {
  /** Secret scanner — runs on each successful step's declared outputs + log. */
  secretScanner?: SecretScanner;
  /** Harmful-output filter — runs on each successful step's output file bodies + log. */
  harmfulFilter?: HarmfulOutputFilter;
  /** Per-output post-step indexer (e.g. `reports_index`). Errors are swallowed. */
  outputIndexer?: OutputIndexer;
};

export type RunWorkflowOptions = {
  concurrency?: number;
  triggeredBy?: string;
  itemId?: string | null;
  worktreePath?: string;
  /** Optional safety guards. When set, each step's outputs are scanned and a finding fails the step. */
  safety?: SafetyGuards;
  /** Mid-run gates parsed from the workflow markdown. Each fires once after its `afterStepIndex`. */
  gates?: ApprovalGate[];
  /** Required when gates are non-empty — invoked to decide approve/reject. */
  gateController?: GateController;
  /**
   * Step keys whose work was already done in a previous run (retry-from-rejected).
   * These are pre-marked as 'skipped' with summary 'resumed-from-previous-run'
   * and added to the `done` set, so the scheduler picks up from the next layer.
   */
  preCompletedStepKeys?: ReadonlySet<string>;
  /**
   * Live cancellation registry (§5.9 #9). When set, the run registers its
   * AbortController on start so `block` can cancel it by item, and unregisters
   * on every exit path so a finished run leaves no stale cancellable entry.
   */
  registry?: RunRegistry;
  /**
   * Reuse an already-created run instead of creating a new one. The capstone's
   * runItem pre-creates the item's run so its worktree (and the resolution
   * ledger) key off the run id (§5.14); it hands that run here to execute the
   * dev-cycle steps against, keeping one run row per item (no orphan).
   */
  existingRun?: Run;
};

export type RunWorkflowResult = {
  run: Run;
  failedStepKey: string | null;
};

async function runSafetyGuards(
  step: import('./workflow-parser.ts').WorkflowStep,
  logPath: string | null,
  safety: SafetyGuards | undefined,
  worktreePath: string,
  runId: number,
): Promise<string | null> {
  if (!safety) return null;
  // Resolve declared outputs to actual file paths. Static declared paths
  // produce 0 or 1 absolute path (existence check); patterned declared paths
  // (e.g. `.kortext/reports/foo_<slug>_<ts>.md`) expand to every matching
  // file in the target directory at this point in time.
  const outputFiles = step.outputs.flatMap((rel) =>
    findActualOutputFiles(rel, worktreePath),
  );
  const filesToScan = logPath ? [...outputFiles, logPath] : outputFiles;

  if (safety.secretScanner && filesToScan.length > 0) {
    const report = await safety.secretScanner.scanForStep(runId, filesToScan);
    if (report.shouldFailRun) {
      const f = report.findings[0];
      return `secret/token detected in step output: ${f?.finding_type} at ${f?.scanned_path}:${f?.line_number}`;
    }
  }

  if (safety.harmfulFilter && filesToScan.length > 0) {
    for (const file of filesToScan) {
      let body: string;
      try {
        body = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const report = safety.harmfulFilter.scanText(body);
      if (report.shouldFailRun) {
        const f = report.findings[0];
        return `banned/harmful phrase detected in ${file}:${f?.line_number} — ${f?.message}`;
      }
    }
  }

  // Best-effort output indexer (e.g. reports_index). Never fail the run.
  if (safety.outputIndexer && outputFiles.length > 0) {
    for (const absolutePath of outputFiles) {
      try {
        safety.outputIndexer({ absolutePath, step, runId });
      } catch {
        // swallow — bookkeeping must not break the pipeline
      }
    }
  }

  return null;
}

export async function runWorkflow(
  graph: WorkflowGraph,
  executor: Executor,
  repos: Repositories,
  options: RunWorkflowOptions = {},
): Promise<RunWorkflowResult> {
  const concurrency = Math.max(1, options.concurrency ?? 3);
  const triggeredBy = options.triggeredBy ?? 'system';

  const run =
    options.existingRun ??
    repos.runs.createRun({
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
  const preCompleted = options.preCompletedStepKeys ?? new Set<string>();
  for (const node of orderedNodes) {
    const isResumed = preCompleted.has(node.step.key);
    const row = repos.runs.addStep({
      run_id: run.id,
      step_index: node.step.index,
      step_name: `${node.step.phase} — ${node.step.persona ?? '(no persona)'}: ${node.step.description.slice(0, 80)}`,
      persona: node.step.persona,
      status: 'pending',
    });
    stepRowByKey.set(node.step.key, row.id);
    if (isResumed) {
      repos.runs.transitionStep(row.id, 'skipped', {
        output_summary: 'resumed-from-previous-run',
      });
    }
  }

  const gateByStepIndex = new Map<number, ApprovalGate>();
  for (const gate of options.gates ?? []) {
    if (gate.afterStepIndex >= 0) gateByStepIndex.set(gate.afterStepIndex, gate);
  }
  const firedGateIndices = new Set<number>();
  let pendingGate: ApprovalGate | null = null;
  let rejectionReason: string | null = null;

  // Resumed runs (Orchestrator.retryRun) replay the lowest gate that sat
  // *after* one of the resumed steps. Without this, the scheduler's barrier
  // would block forever — the gate would never fire because the step that
  // would have fired it was pre-marked as skipped.
  for (const node of orderedNodes) {
    if (!preCompleted.has(node.step.key)) continue;
    const gate = gateByStepIndex.get(node.step.index);
    if (gate && !pendingGate) {
      pendingGate = gate;
      firedGateIndices.add(gate.afterStepIndex);
      repos.auditLog.append({
        actor: 'orchestrator',
        action: 'gate.paused',
        resource_type: 'run',
        resource_id: String(run.id),
        payload: {
          phase: gate.phase,
          after_step_index: gate.afterStepIndex,
          reason: 'resumed',
        },
      });
    }
  }

  const done = new Set<string>(preCompleted);
  const running = new Map<string, Promise<void>>();
  const aborter = new AbortController();
  // Register this run's controller so an external block can cancel it by item.
  options.registry?.register(run.id, options.itemId ?? null, aborter);
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
      .then(async (result) => {
        if (result.ok) {
          // Apply safety guards before we mark the step as succeeded.
          const safetyError = await runSafetyGuards(
            node.step,
            result.logPath ?? null,
            options.safety,
            options.worktreePath ?? process.cwd(),
            run.id,
          );
          if (safetyError) {
            repos.runs.transitionStep(runStepId, 'failed', {
              output_summary: result.outputSummary ?? null,
              error_message: safetyError,
              log_path: result.logPath ?? null,
            });
            repos.auditLog.append({
              actor: 'safety',
              action: 'pipeline.step.failed',
              resource_type: 'run_step',
              resource_id: String(runStepId),
              payload: { run_id: run.id, step_key: stepKey, error: safetyError },
            });
            if (!failedStepKey) {
              failedStepKey = stepKey;
              firstError = safetyError;
              aborter.abort();
            }
            return;
          }
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
          // Gate trigger: a gate fires once after the step at its afterStepIndex completes.
          const gate = gateByStepIndex.get(node.step.index);
          if (gate && !firedGateIndices.has(gate.afterStepIndex)) {
            firedGateIndices.add(gate.afterStepIndex);
            pendingGate = gate;
            repos.auditLog.append({
              actor: 'orchestrator',
              action: 'gate.paused',
              resource_type: 'run',
              resource_id: String(run.id),
              payload: { phase: gate.phase, after_step_index: gate.afterStepIndex },
            });
          }
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
  while (
    done.size + (failedStepKey ? 1 : 0) < graph.size ||
    running.size > 0 ||
    pendingGate !== null
  ) {
    // Gate barrier: when a gate is pending we drain in-flight work first,
    // then ask the controller for approve/reject before scheduling more steps.
    const gateToProcess: ApprovalGate | null = pendingGate;
    if (gateToProcess && running.size === 0 && !failedStepKey && !rejectionReason) {
      if (!options.gateController) {
        // Exceptional exit — drop the run from the registry before throwing so
        // a misconfigured run never leaks a stale cancellable entry.
        options.registry?.unregister(run.id);
        throw new Error(
          `gate encountered but no gateController provided (phase: ${(gateToProcess as ApprovalGate).phase})`,
        );
      }
      pendingGate = null;
      const decision = await options.gateController.pauseAtGate({
        gate: gateToProcess,
        runId: run.id,
        workflowId: graph.workflowId,
      });
      if (decision.decision === 'approve') {
        repos.auditLog.append({
          actor: 'orchestrator',
          action: 'gate.resumed',
          resource_type: 'run',
          resource_id: String(run.id),
          payload: { phase: (gateToProcess as ApprovalGate).phase, decision: 'approve' },
        });
      } else {
        rejectionReason = decision.reason;
        repos.auditLog.append({
          actor: 'orchestrator',
          action: 'gate.rejected',
          resource_type: 'run',
          resource_id: String(run.id),
          payload: { phase: (gateToProcess as ApprovalGate).phase, reason: decision.reason },
        });
        aborter.abort();
      }
    }

    if (!failedStepKey && !rejectionReason && !pendingGate) {
      // Gate barrier: do not start any step whose index lies past an un-fired gate.
      // This makes gates semantically equivalent to a phase boundary even when the
      // pure data-flow DAG sees later steps as already runnable in parallel.
      let barrier = Number.POSITIVE_INFINITY;
      for (const idx of gateByStepIndex.keys()) {
        if (!firedGateIndices.has(idx) && idx < barrier) barrier = idx;
      }
      const ready = graph.readyKeys(done).filter((k) => {
        if (running.has(k)) return false;
        const node = graph.nodes.get(k);
        if (node && node.step.index > barrier) return false;
        return true;
      });
      while (ready.length > 0 && running.size < concurrency) {
        const next = ready.shift()!;
        launch(next);
      }
    }

    if (running.size === 0 && !pendingGate) break;
    if (running.size > 0) {
      await Promise.race(running.values());
    }
  }

  // Mark any un-started steps as skipped (only happens after failure or rejection).
  if (failedStepKey || rejectionReason) {
    for (const [key, rowId] of stepRowByKey) {
      if (done.has(key)) continue;
      if (key === failedStepKey) continue;
      const row = repos.runs.getStep(rowId);
      if (row && row.status === 'pending') {
        repos.runs.transitionStep(rowId, 'skipped');
      }
    }
  }

  let finalStatus: 'succeeded' | 'failed' | 'cancelled';
  let finalError: string | null;
  if (rejectionReason) {
    finalStatus = 'cancelled';
    finalError = `rejected: ${rejectionReason}`;
  } else if (failedStepKey) {
    finalStatus = 'failed';
    finalError = firstError;
  } else {
    finalStatus = 'succeeded';
    finalError = null;
  }
  const finalRun = repos.runs.transitionRun(run.id, finalStatus, {
    error_message: finalError,
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
      rejection_reason: rejectionReason,
    },
  });

  // Normal exit — the run finished (succeeded/failed/cancelled) and is no longer
  // live, so forget it WITHOUT aborting (the DB row is the durable record).
  options.registry?.unregister(run.id);

  return { run: finalRun, failedStepKey };
}
