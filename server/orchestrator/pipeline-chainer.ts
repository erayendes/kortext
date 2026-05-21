import type { Executor } from '../engine/executor.ts';
import type { Repositories } from '../db/repositories/index.ts';
import type { Run } from '../db/schemas.ts';
import type { WorkflowDefinition } from '../engine/workflow-parser.ts';
import { buildGraph } from '../engine/dag.ts';
import { runWorkflow, type RunWorkflowOptions } from '../engine/worker-pool.ts';
import type { GateEnforcer } from '../engine/gate-enforcer.ts';

/**
 * Orchestrator step that runs the *next* workflow after a successful run.
 *
 * Inputs: the previous Run + its parsed WorkflowDefinition. If the definition
 * declares a `nextWorkflowId` AND the previous run succeeded AND the loader
 * resolves it AND (optional) the gate enforcer says OK, a new run is started.
 *
 * The chainer never touches disk for workflow files itself — it goes through
 * `loadWorkflowById` so tests can inject inline definitions and production
 * can wire a real directory-backed loader.
 */

export type ChainNextOptions = {
  repos: Repositories;
  executor: Executor;
  /** Resolves a workflow id (filename stem) to its parsed definition, or null. */
  loadWorkflowById: (id: string) => WorkflowDefinition | null;
  /** Optional gate enforcer. When set, the next workflow is checked before launch. */
  gateEnforcer?: GateEnforcer;
  /** Optional worktree allocator. When set, the new run gets its own worktree. */
  acquireWorktree?: (runId: number) => Promise<{
    path: string;
    release: (opts: { success: boolean }) => Promise<void>;
  }>;
  /** Optional run-level options forwarded to runWorkflow (concurrency, safety). */
  runOptions?: Pick<RunWorkflowOptions, 'concurrency' | 'safety'>;
};

export type ChainResult =
  | {
      chained: true;
      run: Run;
      definition: WorkflowDefinition;
    }
  | {
      chained: false;
      reason:
        | 'no-next-workflow'
        | 'previous-not-succeeded'
        | 'next-workflow-not-found'
        | 'gate-failed';
      details?: unknown;
    };

export async function chainNextWorkflow(
  previousRun: Run,
  previousDefinition: WorkflowDefinition,
  opts: ChainNextOptions,
): Promise<ChainResult> {
  const { repos } = opts;

  if (previousRun.status !== 'succeeded') {
    recordSkipped(repos, previousRun, previousDefinition, 'previous-not-succeeded');
    return { chained: false, reason: 'previous-not-succeeded' };
  }

  const nextId = previousDefinition.nextWorkflowId;
  if (!nextId) {
    recordSkipped(repos, previousRun, previousDefinition, 'no-next-workflow');
    return { chained: false, reason: 'no-next-workflow' };
  }

  const nextDef = opts.loadWorkflowById(nextId);
  if (!nextDef) {
    recordSkipped(repos, previousRun, previousDefinition, 'next-workflow-not-found', {
      requested_id: nextId,
    });
    return { chained: false, reason: 'next-workflow-not-found' };
  }

  const nextGraph = buildGraph(nextDef);

  if (opts.gateEnforcer) {
    const gate = await opts.gateEnforcer.check(nextGraph, {
      previousWorkflowId: previousDefinition.id,
    });
    if (!gate.ok) {
      recordSkipped(repos, previousRun, previousDefinition, 'gate-failed', {
        failures: gate.failures,
      });
      return { chained: false, reason: 'gate-failed', details: gate.failures };
    }
  }

  let worktreePath: string | undefined;
  let release: ((opts: { success: boolean }) => Promise<void>) | null = null;
  if (opts.acquireWorktree) {
    // We don't have a run id yet — acquireWorktree is keyed on the *next* run.
    // Allocate a transient id by inserting a placeholder run first.
    const placeholder = repos.runs.createRun({
      workflow_id: nextDef.id,
      item_id: previousRun.item_id,
      status: 'queued',
      worktree_path: null,
      triggered_by: `chain:${previousDefinition.id}`,
    });
    const handle = await opts.acquireWorktree(placeholder.id);
    worktreePath = handle.path;
    release = handle.release;
    // We don't keep the placeholder — runWorkflow creates its own row.
    // Mark it cancelled so audit history stays clean.
    repos.runs.transitionRun(placeholder.id, 'cancelled');
  }

  try {
    const result = await runWorkflow(nextGraph, opts.executor, repos, {
      concurrency: opts.runOptions?.concurrency,
      safety: opts.runOptions?.safety,
      triggeredBy: `chain:${previousDefinition.id}`,
      itemId: previousRun.item_id,
      worktreePath,
    });

    repos.auditLog.append({
      actor: 'orchestrator',
      action: 'pipeline.chained',
      resource_type: 'run',
      resource_id: String(previousRun.id),
      payload: {
        from_workflow: previousDefinition.id,
        to_workflow: nextDef.id,
        next_run_id: result.run.id,
        failed_step_key: result.failedStepKey,
      },
    });

    if (release) await release({ success: result.run.status === 'succeeded' });

    return { chained: true, run: result.run, definition: nextDef };
  } catch (err) {
    if (release) await release({ success: false });
    throw err;
  }
}

function recordSkipped(
  repos: Repositories,
  previousRun: Run,
  previousDefinition: WorkflowDefinition,
  reason: Exclude<
    Extract<ChainResult, { chained: false }>['reason'],
    never
  >,
  extra?: Record<string, unknown>,
): void {
  repos.auditLog.append({
    actor: 'orchestrator',
    action: 'pipeline.chain-skipped',
    resource_type: 'run',
    resource_id: String(previousRun.id),
    payload: {
      from_workflow: previousDefinition.id,
      next_workflow: previousDefinition.nextWorkflowId,
      reason,
      ...extra,
    },
  });
}
