import { isAbsolute, resolve } from 'node:path';
import type { Repositories } from '../db/repositories/index.ts';
import type { PendingQuestion, Run } from '../db/schemas.ts';
import { loadWorkflowsFromDir } from '../engine/workflow-loader.ts';
import { loadPersonasFromDir } from '../engine/persona-registry.ts';
import { buildGraph } from '../engine/dag.ts';
import {
  runWorkflow,
  type SafetyGuards,
  type GateController,
} from '../engine/worker-pool.ts';
import { createExecutor, type ExecutorKind } from './executor-factory.ts';
import type { ApprovalQueue } from '../orchestrator/approval-queue.ts';
import { chainNextWorkflow } from '../orchestrator/pipeline-chainer.ts';
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
  /**
   * Optional safety guards (secret scanner, harmful filter, reports index
   * back-fill). Boot wires this in `server/index.ts`; CLI invocations
   * (`kortext start`) leave it undefined unless extended later.
   */
  safety?: SafetyGuards;
  /**
   * Decides approve/reject at each mid-run +prime gate. When provided, the
   * run pauses at every gate the workflow declares and waits for this
   * controller (server boot wires a `QueueGateController` backed by the same
   * ApprovalQueue the REST routes use). Left undefined, gates are not armed
   * and behavior is unchanged — the original CLI `start` path runs straight
   * through. The bounded auto-chain reuses the same controller for each hop.
   */
  gateController?: GateController;
  /**
   * When set, after this workflow succeeds the runner follows each workflow's
   * `**Sonraki akış:**` pointer (nextWorkflowId), running the chain until it has
   * just completed the workflow whose id equals this value — then stops.
   *
   * This bounds the auto-chain to the *setup* phase. Onboarding passes
   * `'planning-pipeline'` so a new project runs analysis → planning (which
   * derives the backlog via `add_backlog_item`) and then STOPS — it must not
   * roll on into environment-setup → development-cycle (building the product is
   * the gated driver's job, not a side effect of onboarding). Left undefined,
   * `start` runs exactly one workflow (the original CLI behavior).
   */
  chainThroughWorkflowId?: string;
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
  // Only arm the gates when a controller is present to answer them. Passing
  // `gates` without a `gateController` would make the worker-pool throw at the
  // first gate — so an un-wired caller (plain CLI `start`) runs ungated.
  const gateController = input.gateController;
  const result = await runWorkflow(graph, executor, input.repos, {
    concurrency: input.concurrency ?? 3,
    triggeredBy: 'cli',
    safety: input.safety,
    ...(gateController ? { gates: def.gates, gateController } : {}),
  });

  let lastRun = result.run;
  let lastDef = def;

  // Optional bounded auto-chain (see chainThroughWorkflowId). Follow the
  // nextWorkflowId pointer hop-by-hop while runs keep succeeding, stopping once
  // the workflow we were told to chain *through* has run. chainNextWorkflow
  // records pipeline.chained / chain-skipped audit entries for each hop.
  const stopAfter = input.chainThroughWorkflowId;
  if (stopAfter) {
    while (
      lastRun.status === 'succeeded' &&
      lastDef.id !== stopAfter &&
      lastDef.nextWorkflowId
    ) {
      const chain = await chainNextWorkflow(lastRun, lastDef, {
        repos: input.repos,
        executor,
        loadWorkflowById: (id) => registry.get(id) ?? null,
        runOptions: { concurrency: input.concurrency ?? 3, safety: input.safety },
        gateController,
      });
      if (!chain.chained) break;
      lastRun = chain.run;
      lastDef = chain.definition;
    }
  }

  return {
    ok: true,
    runId: lastRun.id,
    status: lastRun.status,
    // failedStepKey only meaningful for the first run; chained runs surface
    // their own failures via status + the audit log.
    failedStepKey: lastRun.id === result.run.id ? result.failedStepKey : null,
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
