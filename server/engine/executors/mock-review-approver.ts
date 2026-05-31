import type { ReviewApprover, ReviewContext, ReviewVerdict } from '../review-approver.ts';

export type MockReviewBehavior = {
  /** Force a reject (default is approve). */
  reject?: boolean;
  /** Reason text surfaced as the bounce audit reason on reject. */
  reason?: string | null;
  /** Delay before resolving, ms. Default 0. */
  durationMs?: number;
  /** Throw instead of returning a verdict — exercises the crash → bounce path. */
  throws?: boolean;
};

/**
 * Deterministic ReviewApprover for tests — the review counterpart of
 * MockGateExecutor. The behavior callback decides approve/reject + reason per
 * item, so review-cycle tests can drive any outcome. Tracks which items it was
 * consulted for so tests can assert the approver is skipped when uat is unselected.
 */
export class MockReviewApprover implements ReviewApprover {
  readonly name = 'mock-review';
  /** Items requestApproval() was called for, in order. */
  readonly ranFor: string[] = [];

  constructor(private readonly behavior: (ctx: ReviewContext) => MockReviewBehavior = () => ({})) {}

  async requestApproval(ctx: ReviewContext): Promise<ReviewVerdict> {
    this.ranFor.push(ctx.itemId);
    const cfg = this.behavior(ctx);
    if (cfg.durationMs && cfg.durationMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, cfg.durationMs));
    }
    if (cfg.throws) {
      throw new Error(cfg.reason ?? 'mock review approver crash');
    }
    return { approved: !cfg.reject, reason: cfg.reason ?? null };
  }
}
