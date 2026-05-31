/**
 * Preview-server abstraction — the local-test-URL substrate (§5.9 #7).
 *
 * Division of labour (§5.1 turnusol): the engine ({@link PreviewManager}) owns
 * the bookkeeping (which item has a preview, idempotent start, paired stop); the
 * PreviewServer owns the substrate — spawn a dev server from the item's worktree
 * and return its URL, kill it on stop. The real implementation runs the project's
 * dev command in the worktree (deferred — needs per-item worktrees, Madde 10);
 * tests inject a MockPreviewServer.
 */

export type PreviewStartContext = {
  itemId: string;
  /** Worktree the dev server is launched from. */
  worktreePath: string;
};

/** A running preview. `url` is what gates and prime UAT open (§5.7). */
export type PreviewHandle = {
  itemId: string;
  url: string;
};

export interface PreviewServer {
  /** Stable name for logs/audit, e.g. 'mock-preview', 'vite-preview'. */
  readonly name: string;
  /** Launch a dev server from the worktree and return its URL. */
  start(ctx: PreviewStartContext): Promise<PreviewHandle>;
  /** Tear the preview down (idempotent). */
  stop(handle: PreviewHandle): Promise<void>;
}
