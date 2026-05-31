import type { PreviewHandle, PreviewServer } from '../engine/preview-server.ts';

/**
 * Tracks the live test-preview per item and pairs start/stop (§5.9 #7).
 *
 * When an item enters `test` the engine brings up a local test URL from its
 * worktree (§5.7); when the worktree is torn down the URL closes. This manager
 * is the item→preview index (the RunRegistry of previews): idempotent start,
 * lookup, paired stop. The injected {@link PreviewServer} owns the actual spawn.
 *
 * Wiring (start on test-entry, stop on teardown) and the "is this a runnable/UI
 * task?" gate are the capstone's job (Madde 10, TODO §5.9).
 */
export class PreviewManager {
  private readonly active = new Map<string, PreviewHandle>();

  constructor(private readonly server: PreviewServer) {}

  /** Bring up (or return the existing) preview for an item. Idempotent. */
  async startFor(itemId: string, worktreePath: string): Promise<PreviewHandle> {
    const existing = this.active.get(itemId);
    if (existing) return existing; // already running — don't spawn twice
    const handle = await this.server.start({ itemId, worktreePath });
    this.active.set(itemId, handle);
    return handle;
  }

  /** Tear down the item's preview. Returns false when none was running. */
  async stopFor(itemId: string): Promise<boolean> {
    const handle = this.active.get(itemId);
    if (!handle) return false;
    await this.server.stop(handle);
    this.active.delete(itemId);
    return true;
  }

  /** The item's live preview URL, or null when none is running. */
  urlFor(itemId: string): string | null {
    return this.active.get(itemId)?.url ?? null;
  }
}
