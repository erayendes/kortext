import type { WorkflowStep } from './workflow-parser.ts';

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
};

export interface Executor {
  /** Stable name for logs and audit, e.g. 'mock', 'claude-cli'. */
  readonly name: string;
  /** Runs a single step. Implementations MUST honour ctx.signal. */
  execute(step: WorkflowStep, ctx: ExecutorContext): Promise<ExecutorResult>;
}
