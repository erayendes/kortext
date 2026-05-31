import type { MergeContext, MergeOutcome, Merger } from '../merger.ts';

export type MockMergeBehavior = {
  /** Force a merge conflict (→ bounce). */
  conflict?: boolean;
  /** Reason text surfaced as the bounce reason on conflict. */
  reason?: string | null;
  /** development HEAD returned on success. Default 'mockmerge'. */
  sha?: string | null;
  /** Delay before resolving, ms. Default 0. */
  durationMs?: number;
  /** Throw instead of returning — exercises the crash → bounce path. */
  throws?: boolean;
};

/**
 * Deterministic Merger for tests — the closure counterpart of MockGateExecutor.
 * The behavior callback decides clean-merge vs conflict vs crash per item, so
 * closure tests can drive any outcome. Tracks which items it closed.
 */
export class MockMerger implements Merger {
  readonly name = 'mock-merger';
  /** Items close() was called for, in order. */
  readonly closedFor: string[] = [];

  constructor(private readonly behavior: (ctx: MergeContext) => MockMergeBehavior = () => ({})) {}

  async close(ctx: MergeContext): Promise<MergeOutcome> {
    this.closedFor.push(ctx.itemId);
    const cfg = this.behavior(ctx);
    if (cfg.durationMs && cfg.durationMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, cfg.durationMs));
    }
    if (cfg.throws) {
      throw new Error(cfg.reason ?? 'mock merger crash');
    }
    if (cfg.conflict) {
      return { ok: false, conflict: true, reason: cfg.reason ?? 'merge conflict' };
    }
    return { ok: true, sha: cfg.sha ?? 'mockmerge' };
  }
}
