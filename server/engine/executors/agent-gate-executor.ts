import type { GateExecutor, GateContext, GateOutcome } from '../gate-executor.ts';
import type { Executor, ExecutorContext } from '../executor.ts';
import type { WorkflowStep } from '../workflow-parser.ts';

/** The run/step/worktree the gate agent runs inside — the item's live cycle. */
export type GateRunContext = {
  runId: number;
  runStepId: number;
  worktreePath: string;
};

export type AgentGateExecutorDeps = {
  /** The agent substrate that actually runs the persona (a real CLI executor; mocked in tests). */
  executor: Executor;
  /** Resolve the run/step/worktree the gate runs in (the item's live test-cycle). */
  resolveRunContext: (ctx: GateContext) => GateRunContext;
};

/**
 * Real {@link GateExecutor} (capstone C5) — the gate's judgment is delegated to an
 * actual persona agent via the injected {@link Executor} (the gate counterpart of
 * how the worker pool runs workflow steps). The engine still owns the mechanics
 * (fan-out, join fold, gate_runs); this only supplies the pass/fail verdict by
 * running the persona in the item's worktree and reading its result.
 *
 * A clean agent run → pass; a failed run → fail, surfacing the agent's
 * error/summary as the gate findings. The run/step/worktree are resolved per item
 * (injected so the slice stays self-contained; real wiring threads the item's
 * test-cycle run).
 */
export class AgentGateExecutor implements GateExecutor {
  readonly name = 'persona-agent';

  constructor(private readonly deps: AgentGateExecutorDeps) {}

  async runGate(ctx: GateContext): Promise<GateOutcome> {
    const rc = this.deps.resolveRunContext(ctx);

    const step: WorkflowStep = {
      key: `gate:${ctx.gate}#${ctx.attempt}`,
      index: 0,
      phase: 'Gate',
      persona: ctx.persona,
      description: `Run the ${ctx.gate} gate on item ${ctx.itemId} (attempt ${ctx.attempt})`,
      inputs: [],
      outputs: [],
      approver: null,
      reviewer: null,
    };

    const execCtx: ExecutorContext = {
      workflowId: `gate:${ctx.gate}`,
      runId: rc.runId,
      runStepId: rc.runStepId,
      worktreePath: rc.worktreePath,
      signal: ctx.signal ?? new AbortController().signal,
    };

    const result = await this.deps.executor.execute(step, execCtx);
    if (result.ok) return { pass: true };
    return { pass: false, findings: result.errorMessage ?? result.outputSummary ?? null };
  }
}
