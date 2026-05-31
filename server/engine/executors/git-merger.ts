import type { Merger, MergeContext, MergeOutcome } from '../merger.ts';
import type { WorktreeManager, WorktreeHandle } from '../worktree.ts';

export type GitMergerDeps = {
  /** Owns the git substrate — merge feature → development, tear the worktree down. */
  worktrees: WorktreeManager;
  /**
   * Resolve the item's live worktree handle. Populated when B1's runItem acquires
   * the per-item worktree; null once it's gone (already merged / never created).
   */
  resolveHandle: (itemId: string) => WorktreeHandle | null;
};

/**
 * Real {@link Merger} (capstone C2) — the git counterpart of MockMerger.
 *
 * Closes an approved item by merging its feature branch into `development` and
 * removing the worktree, reusing {@link WorktreeManager.release}'s tested
 * merge+teardown path. A merge conflict (or any git failure) leaves the worktree
 * in place — release throws before removal — so the developer can resolve it; the
 * closure orchestrator turns that into a `bounce`.
 *
 * handover-on-close (§5.9 #6) is intentionally NOT done here yet — it needs a
 * content/location spec (a product decision), tracked as a capstone follow-up.
 */
export class GitMerger implements Merger {
  readonly name = 'git-merger';

  constructor(private readonly deps: GitMergerDeps) {}

  async close(ctx: MergeContext): Promise<MergeOutcome> {
    const handle = this.deps.resolveHandle(ctx.itemId);
    if (!handle) {
      return { ok: false, reason: `no worktree registered for item ${ctx.itemId}` };
    }

    try {
      this.deps.worktrees.release(handle, { success: true, merge: true });
      return { ok: true };
    } catch (err) {
      // A failed merge (conflict) leaves the worktree intact (release throws
      // before removal) → bounce, developer resolves.
      return {
        ok: false,
        conflict: true,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
