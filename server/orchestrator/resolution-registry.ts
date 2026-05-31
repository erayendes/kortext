import type { WorktreeHandle } from '../engine/worktree.ts';

/**
 * The item → live-run ledger that closes the run/item impedance at composition
 * time (capstone "son montaj", §5.14).
 *
 * Five real substrate adapters were built mock-first, each taking an injected
 * resolver:
 *   - {@link GitMerger}.resolveHandle      → the item's WorktreeHandle (C2)
 *   - {@link QueueReviewApprover}.resolveRunId → the item's run id     (C3)
 *   - {@link AgentGateExecutor}.resolveRunContext → run + worktree     (C5)
 *
 * In tests those resolvers are hand-wired per case; in production they all read
 * from one ledger that {@link runItem} fills when it spawns an item's dev-cycle
 * run in its real worktree. This class IS that ledger — a plain in-memory index
 * keyed by item id, the worktree counterpart of {@link RunRegistry}.
 *
 * In-memory only: a process restart drops it (the DB run rows are the durable
 * record). Closure calls {@link forget} after a clean merge so a stale handle is
 * never resolved for an item whose worktree is already gone.
 */
export type ItemRunEntry = {
  /** The item's dev-cycle run id (FK anchor for uat questions, C3). */
  runId: number;
  /** Absolute path to the item's worktree (where gates/preview run, C5/C1). */
  worktreePath: string;
  /**
   * The real WorktreeManager handle for the item's worktree (C2 merge+teardown),
   * or null when the worktree was a test mock with no real handle.
   */
  handle: WorktreeHandle | null;
};

/** The run-context view AgentGateExecutor (C5) resolves — run id + worktree, no handle. */
export type ItemRunContext = {
  runId: number;
  worktreePath: string;
};

export class ResolutionRegistry {
  private readonly byItem = new Map<string, ItemRunEntry>();

  /** Record (or replace) an item's live run + worktree. Called by runItem on spawn. */
  record(itemId: string, entry: ItemRunEntry): void {
    this.byItem.set(itemId, entry);
  }

  /** The item's run id, or null when unknown (QueueReviewApprover.resolveRunId, C3). */
  resolveRunId(itemId: string): number | null {
    return this.byItem.get(itemId)?.runId ?? null;
  }

  /** The item's worktree handle, or null when unknown / mock (GitMerger.resolveHandle, C2). */
  resolveHandle(itemId: string): WorktreeHandle | null {
    return this.byItem.get(itemId)?.handle ?? null;
  }

  /** The item's run + worktree context, or null when unknown (AgentGateExecutor, C5). */
  runContextFor(itemId: string): ItemRunContext | null {
    const entry = this.byItem.get(itemId);
    return entry ? { runId: entry.runId, worktreePath: entry.worktreePath } : null;
  }

  /** Drop the item after its worktree is gone (closure post-merge). True if one was present. */
  forget(itemId: string): boolean {
    return this.byItem.delete(itemId);
  }
}
