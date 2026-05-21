import type { WorkflowStep } from './workflow-parser.ts';

/**
 * Common interface every step executor (mock or real CLI) must implement.
 * Phase 2.B will add ClaudeCliExecutor, CodexCliExecutor, GeminiCliExecutor
 * — all conform to this shape so the worker pool stays adapter-agnostic.
 */

export type ExecutorContext = {
  /** Workflow id ('01a-analysis-pipeline') for logging + persona prompt assembly. */
  workflowId: string;
  /** Run id from the runs table. */
  runId: number;
  /** Run step id from the run_steps table. */
  runStepId: number;
  /** Absolute path to the worktree this step should write into (or repo root in Faz 2.A). */
  worktreePath: string;
  /** Signal aborted when the run is cancelled. */
  signal: AbortSignal;
};

export type ExecutorResult = {
  ok: boolean;
  outputSummary?: string;
  logPath?: string;
  errorMessage?: string;
};

export interface Executor {
  /** Stable name for logs and audit, e.g. 'mock', 'claude-cli'. */
  readonly name: string;
  /** Runs a single step. Implementations MUST honour ctx.signal. */
  execute(step: WorkflowStep, ctx: ExecutorContext): Promise<ExecutorResult>;
}
