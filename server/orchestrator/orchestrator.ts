import type { Executor } from '../engine/executor.ts';
import type { Repositories } from '../db/repositories/index.ts';
import type { Run } from '../db/schemas.ts';
import type { WorkflowDefinition } from '../engine/workflow-parser.ts';
import { buildGraph } from '../engine/dag.ts';
import {
  runWorkflow,
  type GateController,
  type RunWorkflowOptions,
} from '../engine/worker-pool.ts';
import type { GateEnforcer } from '../engine/gate-enforcer.ts';
import type { ApprovalQueue } from './approval-queue.ts';
import type {
  NotificationDispatcher,
  NotificationEvent,
  NotificationKind,
} from '../notifications/dispatcher.ts';
import { chainNextWorkflow } from './pipeline-chainer.ts';
import { BlueprintWatcher } from './blueprint-watcher.ts';

/**
 * Orchestrator — composite facade for the autonomous runtime.
 *
 * Wires together:
 *   - workflow loader (id → definition)
 *   - worker pool (runWorkflow)
 *   - gate enforcer (pre-flight checks)
 *   - pipeline chainer (nextWorkflowId)
 *   - approval queue (placeholder for Faz 4.2 mid-run gates)
 *   - notification dispatcher (started/succeeded/failed events)
 *   - worktree allocator (one worktree per run, parallel runs each get their own)
 *   - blueprint watcher (status: approved → trigger)
 *
 * Public entry points:
 *   - triggerWorkflow(id)      — run one workflow end-to-end (including chain)
 *   - triggerMany(ids[])       — run several workflows in parallel, capped by maxParallelRuns
 *   - start() / stop()         — manage the blueprint watcher
 *   - setMaxParallelRuns(n)    — adjust concurrency at runtime
 *
 * Parallelism model: one worktree per run. Concurrent runs work on separate
 * git worktrees so they cannot trample one another. The semaphore here only
 * limits *how many* worktrees can be in flight at once.
 */

export type AcquireWorktreeFn = (runId: number) => Promise<{
  path: string;
  release: (opts: { success: boolean }) => Promise<void>;
}>;

export type OrchestratorOptions = {
  repos: Repositories;
  executor: Executor;
  loadWorkflowById: (id: string) => WorkflowDefinition | null;
  approvalQueue: ApprovalQueue;
  gateEnforcer?: GateEnforcer;
  dispatcher?: NotificationDispatcher;
  acquireWorktree?: AcquireWorktreeFn;
  runOptions?: Pick<RunWorkflowOptions, 'concurrency' | 'safety'>;
  /** Mid-run gate controller. When set, runWorkflow pauses at every gate. */
  gateController?: GateController;
  /** Max simultaneous runs across triggerMany. Default 3. */
  maxParallelRuns?: number;
  /** Optional blueprint to watch — when status flips to 'approved', triggerWorkflowId is fired. */
  blueprint?: {
    filePath: string;
    triggerWorkflowId: string;
  };
};

export type TriggerResult =
  | {
      ok: true;
      run: Run;
      /** Successive runs produced by chain-following nextWorkflowId. */
      chainedRuns: Run[];
    }
  | {
      ok: false;
      reason:
        | 'workflow-not-found'
        | 'gate-failed'
        | 'execution-error'
        | 'not-retryable'
        | 'run-not-found';
      details?: unknown;
    };

export class Orchestrator {
  private maxParallelRuns: number;
  private active = 0;
  private waiters: Array<() => void> = [];
  private watcher: BlueprintWatcher | null = null;

  constructor(private readonly opts: OrchestratorOptions) {
    this.maxParallelRuns = Math.max(1, opts.maxParallelRuns ?? 3);
    if (opts.blueprint) {
      this.watcher = new BlueprintWatcher({
        filePath: opts.blueprint.filePath,
        onApproved: async () => {
          await this.triggerWorkflow(opts.blueprint!.triggerWorkflowId);
        },
      });
    }
  }

  setMaxParallelRuns(n: number): void {
    this.maxParallelRuns = Math.max(1, n);
    // Wake waiters if we just raised the limit.
    while (this.active < this.maxParallelRuns && this.waiters.length > 0) {
      const wake = this.waiters.shift();
      wake?.();
    }
  }

  start(): void {
    this.watcher?.start();
  }

  stop(): void {
    this.watcher?.stop();
  }

  /** Exposed so tests (and future webhooks) can poke the watcher directly. */
  async handleBlueprintChange(): Promise<void> {
    if (!this.watcher) return;
    await this.watcher.handleChange();
  }

  async triggerWorkflow(workflowId: string): Promise<TriggerResult> {
    await this.acquireSlot();
    try {
      return await this.runOne(workflowId);
    } finally {
      this.releaseSlot();
    }
  }

  async triggerMany(workflowIds: string[]): Promise<TriggerResult[]> {
    return Promise.all(workflowIds.map((id) => this.triggerWorkflow(id)));
  }

  /**
   * Retry a previously rejected run.
   *
   * Preconditions:
   *   - the run exists, is `cancelled`, and its `error_message` starts with `rejected:`
   *   - the workflow definition is still resolvable via `loadWorkflowById`
   *
   * Behaviour:
   *   - succeeded steps from the original run are marked `skipped` (resumed) on
   *     the new run so the scheduler picks up at the next layer
   *   - the previous worktree is reused (no new acquireWorktree call)
   */
  async retryRun(runId: number): Promise<TriggerResult> {
    const previous = this.opts.repos.runs.getRun(runId);
    if (!previous) return { ok: false, reason: 'run-not-found' };
    const msg = previous.error_message ?? '';
    const retryable =
      previous.status === 'cancelled' &&
      (msg.startsWith('rejected:') || msg.startsWith('orphaned:'));
    if (!retryable) return { ok: false, reason: 'not-retryable' };

    const def = this.opts.loadWorkflowById(previous.workflow_id);
    if (!def) return { ok: false, reason: 'workflow-not-found' };

    await this.acquireSlot();
    try {
      const graph = buildGraph(def);
      const indexToKey = new Map<number, string>();
      for (const node of graph.nodes.values()) {
        indexToKey.set(node.step.index, node.step.key);
      }
      const completedKeys = new Set<string>();
      for (const step of this.opts.repos.runs.listSteps(previous.id)) {
        if (step.status === 'succeeded') {
          const key = indexToKey.get(step.step_index);
          if (key) completedKeys.add(key);
        }
      }

      this.opts.repos.auditLog.append({
        actor: 'orchestrator',
        action: 'run.retry',
        resource_type: 'run',
        resource_id: String(previous.id),
        payload: {
          workflow_id: previous.workflow_id,
          resumed_step_keys: [...completedKeys],
          worktree_path: previous.worktree_path,
        },
      });

      const result = await runWorkflow(graph, this.opts.executor, this.opts.repos, {
        concurrency: this.opts.runOptions?.concurrency,
        safety: this.opts.runOptions?.safety,
        triggeredBy: `retry:${previous.id}`,
        itemId: previous.item_id,
        worktreePath: previous.worktree_path ?? undefined,
        gates: def.gates,
        gateController: this.opts.gateController,
        preCompletedStepKeys: completedKeys,
      });

      const succeeded = result.run.status === 'succeeded';
      await this.dispatch(succeeded ? 'pipeline.succeeded' : 'pipeline.failed', {
        runId: result.run.id,
        workflowId: def.id,
        summary: succeeded
          ? `${def.title} succeeded after retry`
          : `${def.title} failed after retry`,
        payload: {
          workflow_id: def.id,
          retry_of: previous.id,
        },
      });

      return { ok: true, run: result.run, chainedRuns: [] };
    } finally {
      this.releaseSlot();
    }
  }

  private async runOne(workflowId: string): Promise<TriggerResult> {
    const def = this.opts.loadWorkflowById(workflowId);
    if (!def) {
      this.opts.repos.auditLog.append({
        actor: 'orchestrator',
        action: 'pipeline.trigger-skipped',
        resource_type: 'workflow',
        resource_id: workflowId,
        payload: { reason: 'workflow-not-found' },
      });
      return { ok: false, reason: 'workflow-not-found' };
    }

    const graph = buildGraph(def);

    if (this.opts.gateEnforcer) {
      const gate = await this.opts.gateEnforcer.check(graph);
      if (!gate.ok) {
        this.opts.repos.auditLog.append({
          actor: 'orchestrator',
          action: 'pipeline.trigger-skipped',
          resource_type: 'workflow',
          resource_id: workflowId,
          payload: { reason: 'gate-failed', failures: gate.failures },
        });
        return { ok: false, reason: 'gate-failed', details: gate.failures };
      }
    }

    let worktreePath: string | undefined;
    let release: ((opts: { success: boolean }) => Promise<void>) | null = null;
    if (this.opts.acquireWorktree) {
      // We need an id to key the worktree. Create a placeholder run row first.
      const placeholder = this.opts.repos.runs.createRun({
        workflow_id: def.id,
        item_id: null,
        status: 'queued',
        worktree_path: null,
        triggered_by: 'orchestrator',
      });
      const handle = await this.opts.acquireWorktree(placeholder.id);
      worktreePath = handle.path;
      release = handle.release;
      // We mark the placeholder cancelled — runWorkflow will create its own row.
      this.opts.repos.runs.transitionRun(placeholder.id, 'cancelled');
    }

    try {
      await this.dispatch('pipeline.started', {
        runId: 0,
        workflowId: def.id,
        summary: `${def.title} starting`,
        payload: { workflow_id: def.id },
      });

      const result = await runWorkflow(graph, this.opts.executor, this.opts.repos, {
        concurrency: this.opts.runOptions?.concurrency,
        safety: this.opts.runOptions?.safety,
        triggeredBy: 'orchestrator',
        itemId: null,
        worktreePath,
        gates: def.gates,
        gateController: this.opts.gateController,
      });

      const succeeded = result.run.status === 'succeeded';
      await this.dispatch(succeeded ? 'pipeline.succeeded' : 'pipeline.failed', {
        runId: result.run.id,
        workflowId: def.id,
        summary: succeeded
          ? `${def.title} succeeded`
          : `${def.title} failed at step ${result.failedStepKey ?? '?'}`,
        payload: {
          workflow_id: def.id,
          failed_step_key: result.failedStepKey,
        },
      });

      if (release) await release({ success: succeeded });

      const chainedRuns: Run[] = [];
      if (succeeded) {
        await this.followChain(result.run, def, chainedRuns);
      }

      return { ok: true, run: result.run, chainedRuns };
    } catch (err) {
      if (release) await release({ success: false });
      const message = err instanceof Error ? err.message : String(err);
      this.opts.repos.auditLog.append({
        actor: 'orchestrator',
        action: 'pipeline.execution-error',
        resource_type: 'workflow',
        resource_id: workflowId,
        payload: { message },
      });
      return { ok: false, reason: 'execution-error', details: message };
    }
  }

  private async followChain(
    previousRun: Run,
    previousDef: WorkflowDefinition,
    accumulated: Run[],
  ): Promise<void> {
    if (!previousDef.nextWorkflowId) return;
    const chained = await chainNextWorkflow(previousRun, previousDef, {
      repos: this.opts.repos,
      executor: this.opts.executor,
      loadWorkflowById: this.opts.loadWorkflowById,
      gateEnforcer: this.opts.gateEnforcer,
      acquireWorktree: this.opts.acquireWorktree,
      runOptions: this.opts.runOptions,
    });
    if (!chained.chained) return;
    accumulated.push(chained.run);
    const succeeded = chained.run.status === 'succeeded';
    await this.dispatch(succeeded ? 'pipeline.succeeded' : 'pipeline.failed', {
      runId: chained.run.id,
      workflowId: chained.definition.id,
      summary: succeeded
        ? `${chained.definition.title} succeeded (chained)`
        : `${chained.definition.title} failed (chained)`,
      payload: { workflow_id: chained.definition.id, chained_from: previousDef.id },
    });
    if (succeeded) {
      await this.followChain(chained.run, chained.definition, accumulated);
    }
  }

  private async dispatch(
    kind: NotificationKind,
    event: Omit<NotificationEvent, 'kind'>,
  ): Promise<void> {
    if (!this.opts.dispatcher) return;
    try {
      await this.opts.dispatcher.dispatch({ kind, ...event });
    } catch {
      // Dispatcher errors must never break the run loop.
    }
  }

  private async acquireSlot(): Promise<void> {
    if (this.active < this.maxParallelRuns) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.active -= 1;
    if (this.waiters.length > 0 && this.active < this.maxParallelRuns) {
      const wake = this.waiters.shift();
      wake?.();
    }
  }
}
