import type { Repositories } from '../db/repositories/index.ts';
import type { ItemLifecycle } from '../engine/item-lifecycle.ts';
import type { Merger, MergeOutcome } from '../engine/merger.ts';
import type { Deployer } from '../engine/deployer.ts';
import type { PreviewManager } from './test-preview.ts';
import { runEpicCompletion, type EpicCompletionResult } from './epic-completion.ts';

export type ClosureResult = {
  itemId: string;
  /** 'done' = merged cleanly; 'bounced' = conflict/failure → in_progress. */
  outcome: 'done' | 'bounced';
  merge: MergeOutcome;
  /** Epic-completion seam result when the item closed `done`; null on a bounce. */
  epic: EpicCompletionResult | null;
};

export type ClosureDeps = {
  repos: Repositories;
  lifecycle: ItemLifecycle;
  merger: Merger;
  /**
   * Staging-deploy substrate for the epic-completion seam (§5.9 #8). Required —
   * like {@link Merger} — so the capstone can't wire closure and silently skip
   * the epic→staging trigger.
   */
  deployer: Deployer;
  /**
   * Local test-preview manager (§5.7/§5.9 #7). When set, the item's preview is
   * torn down here — the worktree it ran from is being merged/quarantined, so the
   * URL is stopped on both done and bounce (the developer gets a fresh one on the
   * next test entry). Optional + soft: a stop failure never fails the closure.
   */
  previewManager?: PreviewManager;
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
  const { repos, lifecycle, merger, deployer, previewManager } = deps;
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

  // Preview seam (§5.7): the worktree the preview ran from is gone now (merged on
  // ok, quarantined on conflict), so tear the URL down either way. Soft — a stop
  // failure must not turn a clean merge into a bounce.
  if (previewManager) {
    try {
      await previewManager.stopFor(itemId);
    } catch {
      // best-effort teardown
    }
  }

  if (merge.ok) {
    lifecycle.transition(itemId, 'done', by, 'closure: merged to development');
    // Seam (W2, §5.9 #8): a fresh `done` may have completed the parent epic —
    // check + (if so) trigger the staging deploy. The item is already `done`
    // regardless of the epic outcome; this is the downstream trigger only.
    const epic = await runEpicCompletion(itemId, { repos, deployer, by });
    return { itemId, outcome: 'done', merge, epic };
  }

  lifecycle.transition(
    itemId,
    'bounce',
    by,
    merge.reason ? `merge conflict: ${merge.reason}` : 'merge conflict',
  );
  return { itemId, outcome: 'bounced', merge, epic: null };
}
