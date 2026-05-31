import type { BacklogItem } from '../db/schemas.ts';

/**
 * Review approval abstraction — the `review`-column counterpart of {@link GateExecutor}.
 *
 * Division of labour (§5.1 turnusol): the engine owns the *mechanics* (the
 * uat-selected check, the lifecycle transition to done/bounce, audit); the
 * ReviewApprover owns the *judgment* — does the reviewer (prime, for `uat`)
 * accept this item? The real implementation surfaces the question to the
 * human prime (approval-queue / dashboard, deferred — see TODO §5.9); tests
 * inject a deterministic MockReviewApprover.
 */

export type ReviewContext = {
  itemId: string;
  /** The item under review — read-only context for the approver. */
  item: BacklogItem;
  /** Reviewer asked to approve — '+prime' for the `uat` gate. */
  persona: string | null;
  /** Aborted when the surrounding run is cancelled. Implementations SHOULD honour it. */
  signal?: AbortSignal;
};

/** A reviewer's verdict. `reason` is surfaced as the bounce audit reason on reject. */
export type ReviewVerdict = {
  approved: boolean;
  reason?: string | null;
};

export interface ReviewApprover {
  /** Stable name for logs/audit, e.g. 'mock-review', 'prime-approval'. */
  readonly name: string;
  /** Ask the reviewer to approve the item and return an approve/reject verdict. */
  requestApproval(ctx: ReviewContext): Promise<ReviewVerdict>;
}
