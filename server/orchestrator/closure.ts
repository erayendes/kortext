import type { Repositories } from '../db/repositories/index.ts';
import type { ItemLifecycle } from '../engine/item-lifecycle.ts';
import type { Merger, MergeOutcome } from '../engine/merger.ts';

export type ClosureResult = {
  itemId: string;
  /** 'done' = merged cleanly; 'bounced' = conflict/failure → in_progress. */
  outcome: 'done' | 'bounced';
  merge: MergeOutcome;
};

export type ClosureDeps = {
  repos: Repositories;
  lifecycle: ItemLifecycle;
  merger: Merger;
  /** Actor recorded on lifecycle transitions/audit. Default 'orchestrator'. */
  by?: string;
};

/**
 * Run the mechanical closure for an approved item in `review` (§5.9 #6).
 *
 * The closure counterpart of {@link runReviewCycle}: the engine owns the
 * sequencing + lifecycle transition, the injected {@link Merger} owns the git
 * substrate (CI + conflict check, merge → development, worktree/preview teardown).
 * Clean merge → lifecycle `done`; conflict/crash → `bounce` (back to the
 * developer). Mock-first — the real Merger lands with per-item worktrees
 * (Madde 10). Handover-on-close and blocker clearing are deferred (TODO §5.9).
 */
export async function runClosure(itemId: string, deps: ClosureDeps): Promise<ClosureResult> {
  const { repos, lifecycle, merger } = deps;
  const by = deps.by ?? 'orchestrator';

  const item = repos.backlog.get(itemId);
  if (!item) throw new Error(`backlog item not found: ${itemId}`);
  if (item.status !== 'review') {
    throw new Error(
      `runClosure requires item in 'review', got '${item.status}' for ${itemId}`,
    );
  }

  let merge: MergeOutcome;
  try {
    merge = await merger.close({ itemId });
  } catch (err) {
    // A crashing merger is a failed merge → bounce (never hang the closure).
    merge = {
      ok: false,
      reason: `merger error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (merge.ok) {
    lifecycle.transition(itemId, 'done', by, 'closure: merged to development');
    return { itemId, outcome: 'done', merge };
  }

  lifecycle.transition(
    itemId,
    'bounce',
    by,
    merge.reason ? `merge conflict: ${merge.reason}` : 'merge conflict',
  );
  return { itemId, outcome: 'bounced', merge };
}
