import type { Repositories } from '../db/repositories/index.ts';
import type { BacklogItem } from '../db/schemas.ts';
import type { ItemLifecycle } from '../engine/item-lifecycle.ts';
import type { RunRegistry } from '../engine/run-registry.ts';

export type BlockResult = {
  itemId: string;
  /** Runs that were cancelled (aborted + marked cancelled in the DB). */
  cancelledRunIds: number[];
  item: BacklogItem;
};

export type BlockDeps = {
  repos: Repositories;
  lifecycle: ItemLifecycle;
  registry: RunRegistry;
  /** Why the item is blocked — recorded in the audit reason. */
  reason: string;
  /** Actor recorded on the lifecycle transition/audit. Default 'orchestrator'. */
  by?: string;
};

/**
 * Block an item: cancel its in-flight runs and flip it to `blocked` (§5.9 #9).
 *
 * More than a DB status flip (§5.13) — it aborts the item's live runs via the
 * {@link RunRegistry} (stopping the agents) and marks those runs `cancelled` in
 * the DB, then transitions the item. The owner is left untouched (§5.4); "assigned
 * to prime" is the derived whose-turn (blocked → +prime, Madde 5), not an owner
 * overwrite.
 */
export function blockItem(itemId: string, deps: BlockDeps): BlockResult {
  const { repos, lifecycle, registry, reason } = deps;
  const by = deps.by ?? 'orchestrator';

  // Validate + flip first — an illegal block (e.g. from to_do) throws here and
  // cancels nothing.
  const item = lifecycle.transition(itemId, 'block', by, reason);

  // Then stop the item's live runs: abort the agents + mark the runs cancelled.
  const cancelledRunIds = registry.cancelForItem(itemId);
  for (const runId of cancelledRunIds) {
    repos.runs.transitionRun(runId, 'cancelled', { error_message: `blocked: ${reason}` });
  }

  return { itemId, cancelledRunIds, item };
}
