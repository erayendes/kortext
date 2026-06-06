import { resolve } from 'node:path';
import type { Repositories } from '../db/repositories/index.ts';
import type { PersonaRegistry } from '../engine/persona-registry.ts';
import type { WorkflowDefinition } from '../engine/workflow-parser.ts';
import { buildGraph } from '../engine/dag.ts';
import { ItemLifecycle } from '../engine/item-lifecycle.ts';
import { createExecutor, type ExecutorKind } from '../cli/executor-factory.ts';
import { createComposition } from './composition.ts';
import { driveReadyItems, type DriveResult } from './driver.ts';
import type { ApprovalQueue } from './approval-queue.ts';

/**
 * Build-phase parallelism (Eray's "orta" tier, 2026-06-06). The autonomous
 * driver codes up to this many backlog items at once, each in its own git
 * worktree; the worktree ceiling sits just above so item leases never starve.
 * Raising these trades wall-clock for concurrent Claude processes (API cost +
 * machine load) — see DECISIONS. Conservative defaults were 3 / 10.
 */
const DRIVE_MAX_ITEMS = 6;
const DRIVE_MAX_WORKTREES = 12;

/** Just the lookup the assembler needs from the workflow registry. */
export type WorkflowLookup = { get(id: string): WorkflowDefinition | null };

export type ServerDriveDeps = {
  repos: Repositories;
  personas: PersonaRegistry;
  workflows: WorkflowLookup;
  /** The human-in-the-loop queue uat questions surface through. */
  queue: ApprovalQueue;
  /** Project git root (the directory containing .git). */
  repoRoot: string;
  /** Directory with `[handle].md` persona files (used by non-mock executors). */
  agentsDir: string;
  /** Reads the safety switch — env.KORTEXT_DRIVE_ENABLED. */
  enabled: () => boolean;
  /** Which agent substrate to run (resolved from project.json; mock fallback). */
  resolveExecutor: () => { kind: ExecutorKind; binary?: string };
  /** Branch item worktrees fork from (§5.11). Default 'development'. */
  baseBranch?: string;
};

export type ServerDrive = {
  /** The safety switch the route gates on. */
  enabled: () => boolean;
  /** Run exactly one drive pass, building the runtime lazily on first call. */
  drive: () => Promise<DriveResult>;
};

/**
 * Assembles the autonomous driver from the pieces `server/index.ts` already has
 * loaded (repos, registries, queue) and hands back the `{ enabled, drive }` pair
 * the {@link driveRouter} consumes (§5.16). This is the composition seam that
 * actually wires {@link driveReadyItems} to the real substrate — kept out of
 * `index.ts` (an untestable boot script) so the lazy-once build and the missing-
 * workflow guard can be unit-tested.
 *
 * The runtime is built lazily and cached: the very first drive constructs the
 * composition (and its {@link ResolutionRegistry}); every later drive reuses it,
 * because that ledger holds item→worktree handles that must survive across
 * passes (a bounced item is finished on a later pass). §5.13 holds — this is
 * pure wiring, no conditional lifecycle logic.
 */
export function makeServerDrive(deps: ServerDriveDeps): ServerDrive {
  let runtime: {
    composition: ReturnType<typeof createComposition>;
    lifecycle: ItemLifecycle;
    graph: ReturnType<typeof buildGraph>;
  } | null = null;

  function buildRuntime() {
    const devWf = deps.workflows.get('development-cycle');
    if (!devWf) {
      throw new Error(
        "cannot drive: the 'development-cycle' workflow is not loaded — check the workflows directory",
      );
    }
    const { kind, binary } = deps.resolveExecutor();
    const executor = createExecutor(kind, {
      binary: binary ?? '',
      agentsDir: deps.agentsDir,
      logsDir: resolve(deps.repoRoot, '.kortext', 'data', 'logs'),
      // MockExecutor doesn't read personas — skip handing it the registry.
      personaRegistry: kind === 'mock' ? undefined : deps.personas,
    });
    const composition = createComposition({
      repos: deps.repos,
      executor,
      queue: deps.queue,
      repoRoot: deps.repoRoot,
      baseBranch: deps.baseBranch,
      loadDeploymentWorkflow: () => deps.workflows.get('deployment-cycle'),
      // Build phase parallelism (Eray: "orta" — 6 items / 12 worktrees). The
      // driver runs DRIVE_MAX_ITEMS items at once, each in its own worktree;
      // the worktree ceiling sits a little above so leases never starve.
      maxConcurrentWorktrees: DRIVE_MAX_WORKTREES,
    });
    return {
      composition,
      lifecycle: new ItemLifecycle({ repos: deps.repos, personas: deps.personas }),
      graph: buildGraph(devWf),
    };
  }

  return {
    enabled: deps.enabled,
    drive: async () => {
      if (!runtime) runtime = buildRuntime();
      return driveReadyItems({
        composition: runtime.composition,
        lifecycle: runtime.lifecycle,
        graph: runtime.graph,
        maxConcurrent: DRIVE_MAX_ITEMS,
      });
    },
  };
}
