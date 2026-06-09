import type { Repositories } from '../db/repositories/index.ts';
import type { Run } from '../db/schemas.ts';
import type { Executor } from '../engine/executor.ts';
import type { WorkflowGraph } from '../engine/dag.ts';
import type { ItemLifecycle } from '../engine/item-lifecycle.ts';
import type { RunRegistry } from '../engine/run-registry.ts';
import type { WorktreeHandle } from '../engine/worktree.ts';
import type { ResolutionRegistry } from './resolution-registry.ts';
import type { PreviewManager } from './test-preview.ts';
import { runWorkflow } from '../engine/worker-pool.ts';
import { selectBuildableItems } from './build-order.ts';

/**
 * A per-item worktree lease — the item's isolated working copy (base=`development`,
 * §5.11). Kept alive across the whole item-cycle: the dev-cycle run builds in it,
 * and closure (Madde 10 C2) merges it back to `development` and releases it.
 */
export type WorktreeLease = {
  path: string;
  /**
   * The real WorktreeManager handle backing this lease — recorded in the
   * resolution ledger so GitMerger (C2) can merge+tear down the item's worktree.
   * null for mock acquirers (tests) that have no real handle.
   */
  handle?: WorktreeHandle | null;
  /** Tear down the worktree. failure → quarantine (kept for postmortem). */
  release: (opts: { success: boolean }) => Promise<void> | void;
};

/**
 * Acquire a per-item worktree, keyed by the item's (pre-created) run id so the
 * worktree branch/dir line up with the real run. Injected so tests mock git; the
 * real impl forks `development` via WorktreeManager.
 */
export type AcquireItemWorktree = (itemId: string, runId: number) => Promise<WorktreeLease>;

export type RunItemDeps = {
  repos: Repositories;
  lifecycle: ItemLifecycle;
  executor: Executor;
  /** The development-cycle graph the ready item runs. */
  graph: WorkflowGraph;
  /** Per-item worktree (base=`development`); injected so tests mock git. */
  acquireWorktree: AcquireItemWorktree;
  /** Live-cancellation registry (W1) so `block` can stop this item-run. */
  registry: RunRegistry;
  /**
   * The item→run ledger the real adapters resolve through (§5.14). When set,
   * runItem records the spawned run's id + worktree (handle) so GitMerger (C2),
   * QueueReviewApprover (C3) and AgentGateExecutor (C5) can resolve the item.
   * Optional so the keystone's own unit tests can run without the composition.
   */
  resolution?: ResolutionRegistry;
  /**
   * Local test-preview manager (§5.7/§5.9 #7). When set, a successful item-run
   * brings up a preview from its worktree on `test`-entry so gates + prime UAT
   * can open the live URL. Optional + soft: a preview that fails to spawn never
   * fails the build (the item still reaches `test`). Closure stops it.
   */
  previewManager?: PreviewManager;
  /** Actor recorded on lifecycle transitions/audit. Default 'orchestrator'. */
  by?: string;
};

export type RunItemResult = {
  itemId: string;
  run: Run;
  /**
   * 'implemented' = dev-cycle ran clean → item at `test`, worktree kept for closure.
   * 'failed'      = dev-cycle run failed → item stays in_progress, worktree quarantined.
   */
  outcome: 'implemented' | 'failed';
  /** The live worktree lease on success (closure merges + releases it); null on failure. */
  worktree: WorktreeLease | null;
};

const READY: ReadonlySet<string> = new Set(['to_do', 'in_progress']);

/**
 * Spawn the development-cycle run for a ready backlog item (§5.9 #10 — the
 * capstone keystone that closes the run/item impedance).
 *
 * The item finally gets a real `run` row with `item_id` set (FK closes), runs in
 * its own worktree forked from `development`, and is registered for cancellation
 * (W1, so `block` reaches the live agent). Per §5.13 the run itself stays a pure
 * AND-join build; the conditional `in_progress → test` exit is an orchestrator-
 * layer transition applied here on success.
 *
 * Mock-first: the worktree acquirer is injected (real git lands in C-slices).
 */
export async function runItem(itemId: string, deps: RunItemDeps): Promise<RunItemResult> {
  const { repos, lifecycle, executor, graph, acquireWorktree, registry, resolution, previewManager } =
    deps;
  const by = deps.by ?? 'orchestrator';

  const item = repos.backlog.get(itemId);
  if (!item) throw new Error(`backlog item not found: ${itemId}`);
  if (!READY.has(item.status)) {
    throw new Error(
      `runItem requires a ready item (to_do|in_progress), got '${item.status}' for ${itemId}`,
    );
  }

  // Ensure the item is in_progress before the build (a fresh to_do is started;
  // an in_progress item resumed after a bounce is left where it is).
  if (item.status === 'to_do') {
    lifecycle.transition(itemId, 'start', by);
  }

  // Pre-create the item's dev-cycle run FIRST (FK closes: item_id is set) so the
  // worktree — and the resolution ledger — key off a real run id. This is where
  // the run/item impedance actually closes (§5.14); the engine then executes the
  // dev-cycle steps against this same run (existingRun), so there's one run row.
  const run0 = repos.runs.createRun({
    workflow_id: graph.workflowId,
    item_id: itemId,
    status: 'queued',
    worktree_path: null,
    triggered_by: by,
  });

  // Per-item worktree (base=`development`), keyed by the run id; injected so tests mock git.
  const lease = await acquireWorktree(itemId, run0.id);
  repos.runs.setWorktreePath(run0.id, lease.path);
  // Fill the ledger the real adapters resolve through (GitMerger handle C2, uat
  // run id C3, gate run-context C5). Closure forgets it after a clean merge.
  resolution?.record(itemId, {
    runId: run0.id,
    worktreePath: lease.path,
    handle: lease.handle ?? null,
  });

  let run: Run;
  try {
    const result = await runWorkflow(graph, executor, repos, {
      existingRun: run0, // ← run pre-created above; the engine reuses it (no orphan)
      itemId, // ← keep so the registry tags the run with this item (W1 block)
      worktreePath: lease.path,
      registry, // ← block can cancel the live run by item (W1)
      triggeredBy: by,
    });
    run = result.run;
  } catch (err) {
    // The engine threw (e.g. a misconfigured gate) — quarantine, drop the stale
    // ledger entry, then rethrow.
    await lease.release({ success: false });
    resolution?.forget(itemId);
    throw err;
  }

  if (run.status === 'succeeded') {
    // Development-cycle exit (§5.8): in_progress → test. Worktree is kept alive —
    // closure (C2) merges it to development and releases it then (ledger kept).
    //
    // Idempotent: a long real-agent build can race an overlapping drive pass /
    // scheduler retry that already advanced (or blocked) the item. Re-read and
    // only apply the exit from `in_progress`, so the exit never throws
    // IllegalTransitionError('test' from 'test') and never forces a blocked/
    // advanced item back to `test`.
    const fresh = repos.backlog.get(itemId);
    if (fresh?.status === 'in_progress') {
      lifecycle.transition(itemId, 'test', by, 'development-cycle complete');
    }
    // Preview seam (§5.7): bring up the local test URL from the worktree so gates
    // + prime UAT can open it. Soft — a failed spawn must not fail a clean build.
    if (previewManager) {
      try {
        await previewManager.startFor(itemId, lease.path);
        // Persist the live URL whenever a preview actually came up, so it
        // reaches the user (#8). Previously this was gated on
        // `frontmatter.preview === true`, which meant the computed URL was
        // started in-memory but never written to the DB / surfaced in the UI.
        // The preview lifecycle is unchanged — closure still calls stopFor,
        // which clears the URL.
        const url = previewManager.urlFor(itemId);
        if (url) {
          repos.backlog.setPreviewUrl(itemId, url);
        }
      } catch {
        // preview is best-effort; the item is on `test` regardless
      }
    }
    return { itemId, run, outcome: 'implemented', worktree: lease };
  }

  // Build failed → item stays in_progress (developer retries); quarantine the
  // worktree and forget the ledger so no merger resolves a dangling handle.
  await lease.release({ success: false });
  resolution?.forget(itemId);
  return { itemId, run, outcome: 'failed', worktree: null };
}

export type RunReadyItemsDeps = RunItemDeps & {
  /** Max simultaneous item-runs. Default 3. */
  maxConcurrent?: number;
};

/**
 * Kick off a development-cycle run for every BUILDABLE item, with bounded
 * concurrency (§5.9 #10). Each item runs via {@link runItem} in its own worktree.
 *
 * Buildability is decided by {@link selectBuildableItems} (UAT #9 #1+#2): the
 * earliest open version first, only dependency-ready items (blockers `done`),
 * and bounced `in_progress` items are retried. This replaces the old "every
 * `to_do` item in parallel" query that ignored blocked_by/version and caused
 * merge-conflict stalls.
 */
export async function runReadyItems(deps: RunReadyItemsDeps): Promise<RunItemResult[]> {
  const max = Math.max(1, deps.maxConcurrent ?? 3);
  const ready = selectBuildableItems(deps.repos.backlog.list({ limit: 100_000 }));

  const results: RunItemResult[] = [];
  let cursor = 0;
  // A fixed pool of workers drains a shared cursor. The `cursor++` claim is
  // atomic (no await between read and increment), so no item is run twice.
  const worker = async (): Promise<void> => {
    while (cursor < ready.length) {
      const item = ready[cursor++]!; // in-bounds per the while-guard
      results.push(await runItem(item.id, deps));
    }
  };
  await Promise.all(Array.from({ length: Math.min(max, ready.length) }, () => worker()));
  return results;
}
