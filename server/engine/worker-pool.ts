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
  /**
   * Aborts when the run is cancelled (e.g. a sibling gate was rejected). A
   * controller that waits on a human (DB poll) should forward this so a
   * pending approval stops waiting instead of hanging the run.
   */
  signal?: AbortSignal;
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
  /**
   * Per-output post-step backlog ingester. When a step writes the canonical
   * backlog file, this turns it into real backlog rows (see backlog-ingest.ts).
   * Same best-effort contract as outputIndexer — it logs/audits its own results
   * (created vs skipped), so a partial/empty backlog is reported, not silent.
   */
  backlogIngester?: OutputIndexer;
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
  /**
   * UAT #10 Faz 2 — "akıllı retry". When a bounced item is re-coded, runItem
   * passes the item's recorded revision_directive here; every step that has no
   * per-step revise reason inherits it as ExecutorContext.reviseFeedback, so the
   * dev-cycle prompt tells the agent which gate findings to address rather than
   * re-coding blind. One-shot: runItem clears the directive after the run.
   */
  reviseDirective?: string;
  /**
   * UAT #10L — the backlog item this run implements, pre-rendered as a prompt
   * block (id/title/description/acceptance criteria). Inherited by every step's
   * ExecutorContext so the implementation agent knows WHAT to build.
   */
  itemContext?: string;
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

  // Best-effort backlog ingester. Turns a step's canonical backlog file into
  // real rows. Never fail the run (the agent's work is done); the ingester
  // reports its own created/skipped counts via log + audit.
  if (safety.backlogIngester && outputFiles.length > 0) {
    for (const absolutePath of outputFiles) {
      try {
        safety.backlogIngester({ absolutePath, step, runId });
      } catch {
        // swallow — ingestion failures are surfaced by the ingester's own log
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

  // Per-step gates. A gate is attached to the step whose completion should
  // pause for +prime approval. Unlike the old index-barrier model — which
  // froze EVERY later step into a single linear phase boundary — a gate now
  // blocks only that step's dependents. Independent siblings (e.g. LEGAL ∥
  // GROWTH) run and await approval in parallel; a consumer (PRD) becomes
  // ready only once every gated dependency it lists is done AND approved.
  const gateByStepKey = new Map<string, ApprovalGate>();
  {
    const keyByIndex = new Map<number, string>();
    for (const node of orderedNodes) keyByIndex.set(node.step.index, node.step.key);
    for (const gate of options.gates ?? []) {
      const key = keyByIndex.get(gate.afterStepIndex);
      if (key) gateByStepKey.set(key, gate);
    }
  }
  const gateApproved = new Set<string>(); // step keys whose gate is approved
  const gateResolving = new Map<string, Promise<void>>(); // in-flight approvals
  const firedGates = new Set<string>(); // gates already enqueued (fire once)
  const gatesToFire: string[] = []; // step keys whose gate is ready to enqueue
  // §14.2 — "revize tek başına döner". When a gate is rejected we do NOT abort
  // the run; we regenerate only that step. The reject reason is parked here and
  // handed to the step's re-execution (ExecutorContext.reviseFeedback), then
  // consumed (one-shot) when the step re-launches.
  const reviseReasonByKey = new Map<string, string>();

  // Resumed runs (Orchestrator.retryRun): a pre-completed step that carries a
  // gate is re-surfaced for approval, so a retry-from-rejected still asks the
  // human before its dependents proceed. Dependents stay blocked until the
  // re-fired gate is approved — same contract as a fresh run.
  for (const node of orderedNodes) {
    if (preCompleted.has(node.step.key) && gateByStepKey.has(node.step.key)) {
      firedGates.add(node.step.key);
      gatesToFire.push(node.step.key);
    }
  }

  const done = new Set<string>(preCompleted);
  const running = new Map<string, Promise<void>>();
  const aborter = new AbortController();
  // Register this run's controller so an external block can cancel it by item.
  options.registry?.register(run.id, options.itemId ?? null, aborter);
  let failedStepKey: string | null = null;
  let firstError: string | null = null;

  const ctxFor = (runStepId: number, stepKey: string): ExecutorContext => ({
    workflowId: graph.workflowId,
    runId: run.id,
    runStepId,
    worktreePath: options.worktreePath ?? process.cwd(),
    signal: aborter.signal,
    // Per-step revise reason (mid-run gate rejection) wins; otherwise the item's
    // bounce directive (Faz 2) applies to the whole dev-cycle re-code.
    reviseFeedback: reviseReasonByKey.get(stepKey) ?? options.reviseDirective,
    // UAT #10L — the item being implemented (dev-cycle runs only).
    itemContext: options.itemContext,
  });

  const launch = (stepKey: string): void => {
    const node = graph.nodes.get(stepKey);
    if (!node) return;
    const runStepId = stepRowByKey.get(stepKey)!;
    // Build the context (folding in any pending revise feedback) BEFORE we clear
    // the one-shot reason, so a regeneration carries the feedback exactly once.
    const ctx = ctxFor(runStepId, stepKey);
    reviseReasonByKey.delete(stepKey);
    repos.runs.transitionStep(runStepId, 'running');
    repos.auditLog.append({
      actor: executor.name,
      action: 'pipeline.step.started',
      resource_type: 'run_step',
      resource_id: String(runStepId),
      payload: { run_id: run.id, step_key: stepKey, persona: node.step.persona },
    });

    const promise = executor
      .execute(node.step, ctx)
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
              usage_metadata: result.usage ?? null,
            });
            repos.auditLog.append({
              actor: 'safety',
              action: 'pipeline.step.failed',
              resource_type: 'run_step',
              resource_id: String(runStepId),
              payload: { run_id: run.id, step_key: stepKey, persona: node.step.persona, error: safetyError },
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
            usage_metadata: result.usage ?? null,
          });
          repos.auditLog.append({
            actor: executor.name,
            action: 'pipeline.step.succeeded',
            resource_type: 'run_step',
            resource_id: String(runStepId),
            payload: { run_id: run.id, step_key: stepKey, persona: node.step.persona },
          });
          done.add(stepKey);
          // A gated step, on completion, queues its approval. The scheduler
          // loop enqueues a non-blocking gate resolution — so sibling steps
          // and sibling gates keep making progress in parallel.
          if (gateByStepKey.has(stepKey) && !firedGates.has(stepKey)) {
            firedGates.add(stepKey);
            gatesToFire.push(stepKey);
          }
        } else {
          repos.runs.transitionStep(runStepId, 'failed', {
            output_summary: result.outputSummary ?? null,
            error_message: result.errorMessage ?? 'unknown failure',
            log_path: result.logPath ?? null,
            usage_metadata: result.usage ?? null,
          });
          repos.auditLog.append({
            actor: executor.name,
            action: 'pipeline.step.failed',
            resource_type: 'run_step',
            resource_id: String(runStepId),
            payload: { run_id: run.id, step_key: stepKey, persona: node.step.persona, error: result.errorMessage },
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

  // Scheduler loop. Steps and gate approvals settle concurrently; the loop
  // wakes whenever either a step finishes or a gate is decided.
  while (true) {
    // Enqueue any gates whose step has completed. Each resolution runs in the
    // background — it blocks neither sibling steps nor sibling gates, so two
    // independent artifacts can sit awaiting +prime at the same time.
    while (gatesToFire.length > 0) {
      const gateKey = gatesToFire.shift()!;
      const gate = gateByStepKey.get(gateKey)!;
      if (!options.gateController) {
        // Exceptional exit — drop the run from the registry before throwing so
        // a misconfigured run never leaks a stale cancellable entry.
        options.registry?.unregister(run.id);
        throw new Error(
          `gate encountered but no gateController provided (phase: ${gate.phase})`,
        );
      }
      repos.auditLog.append({
        actor: 'orchestrator',
        action: 'gate.paused',
        resource_type: 'run',
        resource_id: String(run.id),
        payload: { phase: gate.phase, after_step_index: gate.afterStepIndex },
      });
      const resolution = options.gateController
        .pauseAtGate({
          gate,
          runId: run.id,
          workflowId: graph.workflowId,
          signal: aborter.signal,
        })
        .then((decision) => {
          if (decision.decision === 'approve') {
            gateApproved.add(gateKey);
            repos.auditLog.append({
              actor: 'orchestrator',
              action: 'gate.resumed',
              resource_type: 'run',
              resource_id: String(run.id),
              payload: { phase: gate.phase, decision: 'approve' },
            });
          } else {
            // §14.2 "revize tek başına döner": a rejected gate regenerates ONLY
            // this step — it does NOT abort the run. Drop the step from `done`
            // and clear its fire-marker so the scheduler re-launches it; when it
            // completes again its gate re-fires for another approval round. The
            // revise reason rides into the re-execution via reviseFeedback.
            // Approved sibling gates stay in `gateApproved` and hold.
            done.delete(gateKey);
            firedGates.delete(gateKey);
            gateApproved.delete(gateKey);
            reviseReasonByKey.set(gateKey, decision.reason);
            repos.auditLog.append({
              actor: 'orchestrator',
              action: 'gate.rejected',
              resource_type: 'run',
              resource_id: String(run.id),
              payload: {
                phase: gate.phase,
                reason: decision.reason,
                regenerate_step: gateKey,
              },
            });
          }
        })
        .catch(() => {
          // Aborted while awaiting (the run was cancelled — a step failed, or an
          // external block fired). The run already carries its terminal reason —
          // settle quietly. (Gate rejections no longer abort: see else-branch.)
        })
        .finally(() => {
          gateResolving.delete(gateKey);
        });
      gateResolving.set(gateKey, resolution);
    }

    // Schedule ready steps: every dependency must be done AND, when that
    // dependency carries a gate, approved.
    if (!failedStepKey) {
      const ready = graph.readyKeys(done).filter((k) => {
        if (running.has(k)) return false;
        const node = graph.nodes.get(k);
        if (!node) return false;
        return node.depKeys.every(
          (d) => !gateByStepKey.has(d) || gateApproved.has(d),
        );
      });
      while (ready.length > 0 && running.size < concurrency) {
        launch(ready.shift()!);
      }
    }

    // Done when nothing is running, no gate is resolving, and none are queued.
    if (running.size === 0 && gateResolving.size === 0 && gatesToFire.length === 0) {
      break;
    }

    const waiters = [...running.values(), ...gateResolving.values()];
    if (waiters.length > 0) {
      await Promise.race(waiters);
    }
  }

  // Mark any un-started steps as skipped (only happens after a step failure —
  // gate rejections no longer terminate the run, they regenerate one step).
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

  let finalStatus: 'succeeded' | 'failed';
  let finalError: string | null;
  if (failedStepKey) {
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
    },
  });

  // Normal exit — the run finished (succeeded/failed/cancelled) and is no longer
  // live, so forget it WITHOUT aborting (the DB row is the durable record).
  options.registry?.unregister(run.id);

  return { run: finalRun, failedStepKey };
}
