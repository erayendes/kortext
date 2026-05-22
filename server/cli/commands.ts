import { existsSync } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';
import type { Repositories } from '../db/repositories/index.ts';
import type { PendingQuestion, Run } from '../db/schemas.ts';
import { loadWorkflowFromFile } from '../engine/workflow-parser.ts';
import { buildGraph } from '../engine/dag.ts';
import { runWorkflow } from '../engine/worker-pool.ts';
import { createExecutor, type ExecutorKind } from './executor-factory.ts';
import type { ApprovalQueue } from '../orchestrator/approval-queue.ts';

/**
 * Thin command surface used by `bin/kortext.ts`. Each command is a pure
 * function so it can be tested without spawning the CLI as a subprocess.
 */

export type StartCommandInput = {
  repos: Repositories;
  workflowsDir: string;
  workflowId: string;
  executor: ExecutorKind;
  /** Required for non-mock executors. */
  executorBinary?: string;
  agentsDir?: string;
  logsDir?: string;
  concurrency?: number;
};

export type StartCommandResult =
  | { ok: true; runId: number; status: Run['status']; failedStepKey: string | null }
  | { ok: false; errorMessage: string };

export async function startCommand(input: StartCommandInput): Promise<StartCommandResult> {
  const workflowsDir = isAbsolute(input.workflowsDir)
    ? input.workflowsDir
    : resolve(process.cwd(), input.workflowsDir);
  const filePath = join(workflowsDir, `${input.workflowId}.md`);
  if (!existsSync(filePath)) {
    return { ok: false, errorMessage: `workflow file not found: ${filePath}` };
  }

  if (input.executor !== 'mock' && !input.executorBinary) {
    return {
      ok: false,
      errorMessage: `executor '${input.executor}' requires --binary (or KORTEXT_${input.executor.toUpperCase()}_BIN env var)`,
    };
  }

  const def = loadWorkflowFromFile(filePath);
  const graph = buildGraph(def);
  const executor = createExecutor(input.executor, {
    binary: input.executorBinary ?? '',
    agentsDir: input.agentsDir ?? resolve(process.cwd(), 'agents'),
    logsDir: input.logsDir ?? resolve(process.cwd(), '.kortext', 'logs'),
  });
  const result = await runWorkflow(graph, executor, input.repos, {
    concurrency: input.concurrency ?? 3,
    triggeredBy: 'cli',
  });

  return {
    ok: true,
    runId: result.run.id,
    status: result.run.status,
    failedStepKey: result.failedStepKey,
  };
}

export type ApproveCommandInput = {
  repos: Repositories;
  queue: ApprovalQueue;
  runId: number;
  answer: string;
  answeredBy: string;
};

export type ApproveCommandResult =
  | { ok: true; questionId: number; answer: string }
  | { ok: false; errorMessage: string };

export async function approveCommand(input: ApproveCommandInput): Promise<ApproveCommandResult> {
  const open = input.queue.findOpenForRun(input.runId);
  if (!open) {
    return { ok: false, errorMessage: `no open question for run ${input.runId}` };
  }
  try {
    const answered = input.queue.answer(open.id, input.answer, input.answeredBy);
    return { ok: true, questionId: open.id, answer: answered.answer ?? input.answer };
  } catch (err) {
    return { ok: false, errorMessage: err instanceof Error ? err.message : String(err) };
  }
}

export type StatusCommandInput = {
  repos: Repositories;
  limit?: number;
};

export type StatusCommandResult = {
  recentRuns: Run[];
  openQuestions: PendingQuestion[];
};

export function statusCommand(input: StatusCommandInput): StatusCommandResult {
  const limit = input.limit ?? 10;
  return {
    recentRuns: input.repos.runs.listRuns({ limit }),
    openQuestions: input.repos.pendingQuestions.listOpen(),
  };
}
