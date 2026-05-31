import type { ReviewApprover, ReviewContext, ReviewVerdict } from '../review-approver.ts';
import type { ApprovalQueue } from '../../orchestrator/approval-queue.ts';

export type QueueReviewApproverDeps = {
  /** The human-in-the-loop queue (DB-polled pending_questions). */
  queue: ApprovalQueue;
  /**
   * Resolve the run the uat question anchors to — the item's most-recent run
   * (its dev-cycle run, which produced the work under review). pending_questions
   * is run_id-keyed (§5.13 impedance); B1 gives the item a real run to anchor to.
   * null when the item has no run yet.
   */
  resolveRunId: (itemId: string) => number | null;
};

/**
 * Real {@link ReviewApprover} (capstone C3) — surfaces the `uat` decision to the
 * human prime via the real {@link ApprovalQueue} and blocks on the answer.
 *
 * The engine still owns the review mechanics (the uat-selected check, the
 * lifecycle transition); this only supplies the verdict. An 'approve' answer →
 * approved; anything else → not approved with the answer as the bounce reason. A
 * blocked/cancelled wait (aborted signal) → not approved (never hangs review).
 */
export class QueueReviewApprover implements ReviewApprover {
  readonly name = 'prime-approval';

  constructor(private readonly deps: QueueReviewApproverDeps) {}

  async requestApproval(ctx: ReviewContext): Promise<ReviewVerdict> {
    const runId = this.deps.resolveRunId(ctx.itemId);
    if (runId == null) {
      return { approved: false, reason: `no run to anchor the uat approval for ${ctx.itemId}` };
    }

    const question = this.deps.queue.enqueue({
      runId,
      question: `Approve uat for item ${ctx.itemId}: ${ctx.item.title}?`,
      choices: ['approve', 'reject'],
    });

    try {
      const answered = await this.deps.queue.waitForAnswer(question.id, { signal: ctx.signal });
      if (answered.answer === 'approve') return { approved: true };
      return { approved: false, reason: answered.answer ?? 'rejected' };
    } catch (err) {
      // The wait was aborted (run blocked) or the question ended without an
      // answer → non-approval, so review bounces rather than hangs.
      return {
        approved: false,
        reason: `uat approval not obtained: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
