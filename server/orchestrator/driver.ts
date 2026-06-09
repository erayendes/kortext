import type { ItemLifecycle } from '../engine/item-lifecycle.ts';
import type { WorkflowGraph } from '../engine/dag.ts';
import type { Composition } from './composition.ts';
import { runReadyItems, type RunItemResult } from './run-item.ts';
import { runTestCycle, type TestCycleResult } from './test-cycle.ts';
import { judgeReview, type ReviewCycleResult } from './review-cycle.ts';
import { runClosure } from './closure.ts';
import { mapWithPool } from './pool.ts';

export type DriveDeps = {
  /** The wired-up runtime (real adapters + ledgers), from createComposition. */
  composition: Composition;
  lifecycle: ItemLifecycle;
  /** The development-cycle graph ready items build against. */
  graph: WorkflowGraph;
  /** Max simultaneous dev-cycle builds. Default 3. */
  maxConcurrent?: number;
  /** Actor recorded on lifecycle transitions/audit. Default 'orchestrator'. */
  by?: string;
};

export type DriveResult = {
  /** Dev-cycle runs spawned this pass (to_do → test / failed). */
  implemented: RunItemResult[];
  /** Test-gate cycles run this pass (test → review / bounced). */
  tested: TestCycleResult[];
  /** Review cycles run this pass (review → done / bounced). */
  reviewed: ReviewCycleResult[];
};

/**
 * Drive every ready item one step further through the lifecycle — the "start
 * button" for the autonomous loop (§5.14 step 4, the capstone driver).
 *
 * One pass folds over DB status in three orchestrator-layer phases (§5.13 — all
 * the conditionals live here; the engine stays a pure AND-join):
 *
 *   1. to_do  → runReadyItems  (build in a real worktree → `test`)
 *   2. test   → runTestCycle   (selected gates in parallel → `review` / bounce)
 *   3. review → runReviewCycle → runClosure (uat → merge → `done` / bounce,
 *               + epic-completion → staging on a fresh `done`)
 *
 * Phases run in order and re-read DB status, so a fresh gate-free item can walk
 * to_do → done in a single pass: phase 1 leaves it at `test`, phase 2 reads it
 * there and moves it to `review`, phase 3 closes it. Bounced items drop back to
 * in_progress and are picked up on the next pass. The injected
 * {@link Composition} supplies the real adapters; nothing here is engine work.
 *
 * A standalone function (Eray's B1 "small, clean, new piece" choice) — it leaves
 * the existing Orchestrator class untouched and is trivially testable end-to-end.
 * Each call is one pass; a scheduler that calls it on a loop is a separate piece.
 */
export async function driveReadyItems(deps: DriveDeps): Promise<DriveResult> {
  const { composition: c, lifecycle, graph } = deps;
  const by = deps.by ?? 'orchestrator';
  const max = Math.max(1, deps.maxConcurrent ?? 3);
  const { repos, gateExecutor, approver, merger, deployer, registry, resolution, previewManager } = c;

  // Phase 1 — start fresh to_do items: each builds in its own real worktree and
  // exits to `test` (the ledger + preview are filled inside runItem).
  const implemented = await runReadyItems({
    repos,
    lifecycle,
    executor: c.executor,
    graph,
    acquireWorktree: c.acquireWorktree,
    registry,
    resolution,
    previewManager,
    maxConcurrent: deps.maxConcurrent,
    by,
  });

  // Phase 2 — run the test-gate cycle for everything now in `test` (newly built
  // above OR left there from a previous pass). Each item's gate judgment is
  // independent (its own gate_run rows + agent calls), so they fan out in
  // parallel — the slow part is the agent, not any shared state.
  const inTest = repos.backlog.list({ status: 'test', limit: 1000 });
  const tested: TestCycleResult[] = await mapWithPool(inTest, max, (item) =>
    // `queue` arms gate-fail escalation (UAT #10): a gate that fails 3× pauses
    // the item + raises a +prime Inbox question instead of bouncing forever.
    runTestCycle(item.id, { repos, lifecycle, gateExecutor, by, queue: c.queue }),
  );

  // Phase 3 — review/closure for everything now in `review`. Two passes: the uat
  // JUDGMENTS run in parallel (independent +prime approvals, so they surface
  // together) while the MERGES run SERIALLY — every close grafts the item's
  // worktree onto the shared `development` branch, and parallel git merges would
  // race. A clean merge → `done` (may trigger the epic→staging deploy); then we
  // forget the item's ledger entry (its worktree is gone).
  const inReview = repos.backlog.list({ status: 'review', limit: 1000 });
  const decisions = await mapWithPool(inReview, max, (item) =>
    judgeReview(item.id, { repos, lifecycle, approver, by }),
  );
  const reviewed: ReviewCycleResult[] = [];
  for (const decision of decisions) {
    if (decision.kind === 'bounced') {
      reviewed.push({
        itemId: decision.itemId,
        outcome: 'bounced',
        uatRequired: decision.uatRequired,
        verdict: decision.verdict,
      });
      continue;
    }
    const closure = await runClosure(decision.itemId, {
      repos,
      lifecycle,
      merger,
      deployer,
      previewManager,
      by,
      queue: c.queue,
      handoverEngine: c.handoverEngine,
    });
    reviewed.push({
      itemId: decision.itemId,
      outcome: closure.outcome,
      uatRequired: decision.uatRequired,
      verdict: decision.verdict,
    });
    if (closure.outcome === 'done') {
      // The worktree is merged + torn down — drop the stale ledger entry so no
      // later resolve hands an adapter a dangling handle (orchestrator-layer
      // cleanup, kept out of closure to avoid a new dependency there).
      resolution.forget(decision.itemId);
    }
  }

  return { implemented, tested, reviewed };
}
