import type { Repositories } from '../db/repositories/index.ts';
import type { Executor } from '../engine/executor.ts';
import type { WorkflowDefinition } from '../engine/workflow-parser.ts';
import { WorktreeManager, type WorktreeHandle } from '../engine/worktree.ts';
import { RunRegistry } from '../engine/run-registry.ts';
import { GitMerger } from '../engine/executors/git-merger.ts';
import { AgentGateExecutor } from '../engine/executors/agent-gate-executor.ts';
import { QueueReviewApprover } from '../engine/executors/queue-review-approver.ts';
import { WorkflowDeployer } from '../engine/executors/workflow-deployer.ts';
import {
  DevServerPreviewServer,
  type DevServerConfig,
} from '../engine/executors/dev-server-preview-server.ts';
import type { PreviewServer } from '../engine/preview-server.ts';
import { PreviewManager } from './test-preview.ts';
import { ApprovalQueue } from './approval-queue.ts';
import { ResolutionRegistry } from './resolution-registry.ts';
import type { Merger } from '../engine/merger.ts';
import type { GateExecutor } from '../engine/gate-executor.ts';
import type { ReviewApprover } from '../engine/review-approver.ts';
import type { Deployer } from '../engine/deployer.ts';
import type { WorktreeLease } from './run-item.ts';
import { HandoverEngine } from '../engine/handover.ts';
import { loadPersonasFromDir } from '../engine/persona-registry.ts';
import { runtimeLayout } from '../paths.ts';
import { MarkdownSyncService } from '../services/markdown-sync.ts';

export type CompositionDeps = {
  repos: Repositories;
  /** The agent substrate gates + deploys run on (real CLI executor in prod, Mock in tests). */
  executor: Executor;
  /** The human-in-the-loop queue uat questions are surfaced through (C3). */
  queue: ApprovalQueue;
  /** Repo root (the directory containing .git). */
  repoRoot: string;
  /**
   * Project root for per-project artefacts (.kortext/memory/handover.md etc.).
   * Defaults to {@link repoRoot} when not set.
   */
  projectRoot?: string;
  /**
   * Directory that contains persona `.md` files (e.g. `<pkg>/agents`).
   * Used by the HandoverEngine to validate `fromPersona`/`toPersona`.
   * Defaults to `<packageRoot>/agents` via {@link runtimeLayout} when not set.
   */
  agentsDir?: string;
  /** Branch item worktrees fork from (§5.11). Default 'development'. */
  baseBranch?: string;
  /** Resolve the deployment-cycle workflow the staging deploy drives (C4). */
  loadDeploymentWorkflow: () => WorkflowDefinition | null;
  /**
   * Dev-server config the real preview substrate spawns per item worktree (C1).
   * Used when {@link previewServer} is not injected. Defaults to `npm run dev`.
   */
  preview?: DevServerConfig;
  /**
   * Override the preview substrate (tests inject a MockPreviewServer; prod uses
   * the real {@link DevServerPreviewServer} built from {@link preview}).
   */
  previewServer?: PreviewServer;
  /** Max simultaneous worktrees. Default 10. */
  maxConcurrentWorktrees?: number;
};

/**
 * The wired-up runtime: the five real substrate adapters, the preview manager,
 * and the two ledgers, all sharing one resolution + cancellation index.
 */
export type Composition = {
  repos: Repositories;
  executor: Executor;
  queue: ApprovalQueue;
  worktrees: WorktreeManager;
  registry: RunRegistry;
  resolution: ResolutionRegistry;
  merger: Merger;
  gateExecutor: GateExecutor;
  approver: ReviewApprover;
  deployer: Deployer;
  previewManager: PreviewManager;
  handoverEngine: HandoverEngine;
  markdownSync: MarkdownSyncService;
  /** The per-item worktree acquirer runItem injects (keyed by run id, real handle). */
  acquireWorktree: (itemId: string, runId: number) => Promise<WorktreeLease>;
};

/**
 * Composition root (capstone "son montaj", §5.14) — the single place that
 * instantiates the REAL substrate adapters and wires their injected resolvers to
 * the {@link ResolutionRegistry} that {@link runItem} fills. This is where the
 * mock→real swap actually happens: the orchestrator functions (runTestCycle,
 * runReviewCycle, runClosure, runEpicCompletion) take these in their deps in
 * place of the mocks.
 *
 * Per §5.13 nothing here adds conditional logic — it's pure wiring; the
 * orchestrator layer still owns every decision and the engine stays a pure
 * AND-join. A standalone factory (Eray's B1 "small, clean, new piece" choice),
 * not a class hierarchy.
 */
export function createComposition(deps: CompositionDeps): Composition {
  const { repos, executor, queue } = deps;
  const baseBranch = deps.baseBranch ?? 'development';

  const worktrees = new WorktreeManager({
    repoRoot: deps.repoRoot,
    baseBranch,
    maxConcurrent: deps.maxConcurrentWorktrees,
    artifacts: repos.runtimeArtifacts,
  });
  const registry = new RunRegistry();
  const resolution = new ResolutionRegistry();

  // C2 — git merge resolves the item's worktree handle from the ledger.
  const merger = new GitMerger({
    worktrees,
    resolveHandle: (itemId) => resolution.resolveHandle(itemId),
  });

  // C5 — gate judgment runs the persona agent inside the item's worktree on a
  // fresh step opened on the item's run (so the dashboard timeline shows it).
  const gateExecutor = new AgentGateExecutor({
    executor,
    resolveRunContext: (ctx) => {
      const rc = resolution.runContextFor(ctx.itemId);
      if (!rc) {
        throw new Error(`no run context registered for item ${ctx.itemId} (gate ${ctx.gate})`);
      }
      const existing = repos.runs.listSteps(rc.runId).length;
      const step = repos.runs.addStep({
        run_id: rc.runId,
        step_index: existing,
        step_name: `Gate — ${ctx.gate} (${ctx.persona ?? 'no persona'}) attempt ${ctx.attempt}`,
        persona: ctx.persona,
        status: 'pending',
      });
      return { runId: rc.runId, runStepId: step.id, worktreePath: rc.worktreePath };
    },
  });

  // C3 — the uat approval anchors to the item's run id from the ledger.
  const approver = new QueueReviewApprover({
    queue,
    resolveRunId: (itemId) => resolution.resolveRunId(itemId),
  });

  // C4 — staging deploy IS the deployment-cycle workflow run.
  const deployer = new WorkflowDeployer({
    repos,
    executor,
    loadDeploymentWorkflow: deps.loadDeploymentWorkflow,
    registry,
  });

  // C1 — preview spawns the project's dev command in the item's worktree.
  // Injectable so tests use a deterministic MockPreviewServer; prod builds the
  // real spawner from the dev-server config.
  const previewServer =
    deps.previewServer ??
    new DevServerPreviewServer(deps.preview ?? { command: 'npm', args: ['run', 'dev'] });
  const previewManager = new PreviewManager(previewServer);

  // B3 — handover-on-close engine. Personas resolved from the package's agents
  // dir (or an override); workspace root anchored at projectRoot (defaults to
  // repoRoot so the .kortext/memory/ tree lands next to .git).
  const workspaceRoot = deps.projectRoot ?? deps.repoRoot;
  const agentsDirResolved = deps.agentsDir ?? runtimeLayout().agentsDir;
  const handoverEngine = new HandoverEngine({
    repos,
    personas: loadPersonasFromDir(agentsDirResolved),
    workspaceRoot,
  });

  // M2a — markdown sync service for writing real gate-staging report files
  // and other generated artifacts under .kortext/.
  const markdownSync = new MarkdownSyncService(repos, { root: workspaceRoot });

  // The per-item worktree acquirer runItem injects: provision a real worktree
  // keyed by the (pre-created) run id and surface its handle so the ledger can
  // record it for the merger (C2).
  const acquireWorktree = async (_itemId: string, runId: number): Promise<WorktreeLease> => {
    const handle: WorktreeHandle = worktrees.acquire(runId);
    return {
      path: handle.path,
      handle,
      release: ({ success }: { success: boolean }) => worktrees.release(handle, { success }),
    };
  };

  return {
    repos,
    executor,
    queue,
    worktrees,
    registry,
    resolution,
    merger,
    gateExecutor,
    approver,
    deployer,
    previewManager,
    handoverEngine,
    markdownSync,
    acquireWorktree,
  };
}
