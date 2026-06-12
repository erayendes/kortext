import type { WorkflowStep } from './workflow-parser.ts';
import type { UsageMetadata } from '../db/schemas.ts';

export type { UsageMetadata };

/**
 * Common interface every step executor (mock or real CLI) must implement.
 * Phase 2.B will add ClaudeCliExecutor, CodexCliExecutor, GeminiCliExecutor
 * — all conform to this shape so the worker pool stays adapter-agnostic.
 */

export type ExecutorContext = {
  /** Workflow id ('new-project-analysis') for logging + persona prompt assembly. */
  workflowId: string;
  /** Run id from the runs table. */
  runId: number;
  /** Run step id from the run_steps table. */
  runStepId: number;
  /** Absolute path to the worktree this step should write into (or repo root in Faz 2.A). */
  worktreePath: string;
  /** Signal aborted when the run is cancelled. */
  signal: AbortSignal;
  /**
   * Set only when this step is being *regenerated* after its approval gate was
   * rejected (§14.2 "revize tek başına döner"). Carries the human's revise
   * reason so the persona can address the feedback on the second pass. Unset on
   * the first attempt. Executors that build a prompt should fold it in.
   */
  reviseFeedback?: string;
  /**
   * The backlog item this run is implementing, pre-rendered as a prompt block
   * (id, title, description, acceptance criteria — UAT #10L). Set by runItem on
   * dev-cycle runs; unset on pipeline runs (analysis/planning) that have no
   * item. Executors that build a prompt MUST fold it in: without it the
   * dev-cycle step text says "implement the item assigned to you" without ever
   * saying WHICH item — codex read files and exited 0 (zero code written).
   */
  itemContext?: string;
};

export type ExecutorResult = {
  ok: boolean;
  outputSummary?: string;
  logPath?: string;
  errorMessage?: string;
  /**
   * Set by an executor when its failure is RECOVERABLE — i.e. the FallbackExecutor
   * should try the next executor in the chain rather than failing the run (UAT
   * #10: a quota/429/empty-output failure, or a transient network blip). A hard
   * failure (bad model, real declared-output-missing with non-empty output)
   * leaves this unset/false so the chain fails fast. Only meaningful when
   * `ok === false`.
   */
  recoverable?: boolean;
  /**
   * Token/cost telemetry for this step, when the executor could capture it
   * (UAT #10 Faz 1). Unset when the CLI gives nothing. Flows through the worker
   * pool / gate cycle into run_steps.usage_metadata / gate_runs.usage_metadata.
   */
  usage?: UsageMetadata;
};

export interface Executor {
  /** Stable name for logs and audit, e.g. 'mock', 'claude-cli'. */
  readonly name: string;
  /** Runs a single step. Implementations MUST honour ctx.signal. */
  execute(step: WorkflowStep, ctx: ExecutorContext): Promise<ExecutorResult>;
}
