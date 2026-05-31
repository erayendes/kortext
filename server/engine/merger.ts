/**
 * Merge abstraction — the closure-mechanics counterpart of {@link GateExecutor}
 * and {@link ReviewApprover}.
 *
 * Division of labour (§5.1 turnusol): the engine owns the *sequencing* (when to
 * close, which lifecycle transition follows); the Merger owns the *git substrate*
 * — CI + conflict check, merge the item's feature branch into `development`, and
 * tear down the worktree/preview. The real implementation drives WorktreeManager
 * once per-item worktrees exist (Madde 10, TODO §5.9); tests inject a MockMerger.
 */

export type MergeContext = {
  itemId: string;
  /** Aborted when the surrounding run is cancelled. Implementations SHOULD honour it. */
  signal?: AbortSignal;
};

/** Outcome of the merge substrate. `ok` = merged cleanly (CI passed, no conflict). */
export type MergeOutcome = {
  ok: boolean;
  /** True when a merge conflict (not a CI failure) blocked the merge. */
  conflict?: boolean;
  /** New development-branch HEAD on success. */
  sha?: string | null;
  /** Why the merge failed — surfaced as the bounce reason. */
  reason?: string | null;
};

export interface Merger {
  /** Stable name for logs/audit, e.g. 'mock-merger', 'worktree-merger'. */
  readonly name: string;
  /** CI + conflict check, merge feature → development, tear down worktree/preview. */
  close(ctx: MergeContext): Promise<MergeOutcome>;
}
