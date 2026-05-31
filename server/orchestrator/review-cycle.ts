import type { Repositories } from '../db/repositories/index.ts';
import type { ItemLifecycle } from '../engine/item-lifecycle.ts';
import type { ReviewApprover, ReviewVerdict } from '../engine/review-approver.ts';
import type { Merger } from '../engine/merger.ts';
import { runClosure } from './closure.ts';

export type ReviewCycleResult = {
  itemId: string;
  /** 'done' = approved (or uat not selected); 'bounced' = rejected → in_progress. */
  outcome: 'done' | 'bounced';
  /** Whether the `uat` gate was on the item's checklist. */
  uatRequired: boolean;
  /** The verdict when uat ran; null when uat unselected (vacuous → done). */
  verdict: ReviewVerdict | null;
};

export type ReviewCycleDeps = {
  repos: Repositories;
  lifecycle: ItemLifecycle;
  approver: ReviewApprover;
  /** Drives the mechanical closure (merge → development) once review passes (§5.9 #6). */
  merger: Merger;
  /** Actor recorded on lifecycle transitions/audit. Default 'orchestrator'. */
  by?: string;
};

/**
 * Run the `review`-column uat cycle for an item already in `review`.
 *
 * The review counterpart of {@link runTestCycle} (§5.9, Madde 4 eşi): the engine
 * owns the mechanics (uat-selected check, lifecycle transition, audit), the
 * injected {@link ReviewApprover} owns the approve/reject judgment.
 */
export async function runReviewCycle(itemId: string, deps: ReviewCycleDeps): Promise<ReviewCycleResult> {
  const { repos, lifecycle, approver, merger } = deps;
  const by = deps.by ?? 'orchestrator';

  const item = repos.backlog.get(itemId);
  if (!item) throw new Error(`backlog item not found: ${itemId}`);
  if (item.status !== 'review') {
    throw new Error(
      `runReviewCycle requires item in 'review', got '${item.status}' for ${itemId}`,
    );
  }

  const uatRequired = item.review_gates.includes('uat');

  // uat unselected → no human approval needed; vacuous pass straight to done
  // (mirrors test-cycle's 0-gate → review, §5.8).
  if (!uatRequired) {
    // No human approval needed → straight into mechanical closure (§5.9 #6).
    const closure = await runClosure(itemId, { repos, lifecycle, merger, by });
    return { itemId, outcome: closure.outcome, uatRequired: false, verdict: null };
  }

  let verdict: ReviewVerdict;
  try {
    verdict = await approver.requestApproval({ itemId, item, persona: '+prime' });
  } catch (err) {
    // A crashing approver is a non-approval → bounce (never hang the review).
    verdict = {
      approved: false,
      reason: `review approver error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (verdict.approved) {
    // Prime approved → mechanical closure decides done vs bounce (merge conflict).
    const closure = await runClosure(itemId, { repos, lifecycle, merger, by });
    return { itemId, outcome: closure.outcome, uatRequired, verdict };
  }

  lifecycle.transition(
    itemId,
    'bounce',
    by,
    verdict.reason ? `uat rejected: ${verdict.reason}` : 'uat rejected',
  );
  return { itemId, outcome: 'bounced', uatRequired, verdict };
}
