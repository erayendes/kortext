import { isAbsolute, resolve } from 'node:path';
import type { Repositories } from '../db/repositories/index.ts';
import type { PendingQuestion, Run } from '../db/schemas.ts';
import { loadWorkflowsFromDir } from '../engine/workflow-loader.ts';
import { loadPersonasFromDir } from '../engine/persona-registry.ts';
import { buildGraph } from '../engine/dag.ts';
import { runWorkflow } from '../engine/worker-pool.ts';
import { createExecutor, type ExecutorKind } from './executor-factory.ts';
import type { ApprovalQueue } from '../orchestrator/approval-queue.ts';
import { runtimeLayout } from '../paths.ts';

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

  const registry = loadWorkflowsFromDir(workflowsDir);
  const def = registry.get(input.workflowId);
  if (!def) {
    const loadError = registry.errors().find((e) => e.file === `${input.workflowId}.md`);
    if (loadError) {
      return {
        ok: false,
        errorMessage: `workflow '${input.workflowId}' not loadable: ${loadError.reason}`,
      };
    }
    return {
      ok: false,
      errorMessage: `workflow not found: ${input.workflowId} (in ${workflowsDir})`,
    };
  }

  if (input.executor !== 'mock' && !input.executorBinary) {
    return {
      ok: false,
      errorMessage: `executor '${input.executor}' requires --binary (or KORTEXT_${input.executor.toUpperCase()}_BIN env var)`,
    };
  }

  const graph = buildGraph(def);
  // v3.1: personas live in the npm package, not the project.
  const agentsDir = input.agentsDir ?? runtimeLayout().agentsDir;
  // Mock executor doesn't read personas — skip the disk scan when possible.
  const personaRegistry =
    input.executor === 'mock' ? undefined : loadPersonasFromDir(agentsDir);
  const executor = createExecutor(input.executor, {
    binary: input.executorBinary ?? '',
    agentsDir,
    // Per-project raw logs land under .kortext/data/logs (git-ignored).
    logsDir: input.logsDir ?? resolve(process.cwd(), '.kortext', 'data', 'logs'),
    personaRegistry,
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
