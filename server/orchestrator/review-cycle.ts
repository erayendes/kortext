import type { Repositories } from '../db/repositories/index.ts';
import type { ItemLifecycle } from '../engine/item-lifecycle.ts';
import type { ReviewApprover, ReviewVerdict } from '../engine/review-approver.ts';
import type { Merger } from '../engine/merger.ts';
import type { Deployer } from '../engine/deployer.ts';
import type { PreviewManager } from './test-preview.ts';
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
  /** Threaded into closure for the epic-completion → staging seam (§5.9 #8). */
  deployer: Deployer;
  /** Threaded into closure to stop the item's local test preview (§5.7). */
  previewManager?: PreviewManager;
  /** Actor recorded on lifecycle transitions/audit. Default 'orchestrator'. */
  by?: string;
};

/**
 * The outcome of an item's uat *judgment* — the parallelisable half of the
 * review cycle. `kind: 'merge'` means the item cleared review (approved, or no
 * uat gate selected) and is ready for the SERIAL mechanical closure; `kind:
 * 'bounced'` means it was rejected and has already been transitioned back to
 * in_progress. The merge itself (git → development) is intentionally NOT done
 * here so callers can run judgments concurrently and serialise only the merge.
 */
export type ReviewDecision = {
  itemId: string;
  kind: 'merge' | 'bounced';
  uatRequired: boolean;
  verdict: ReviewVerdict | null;
};

export type JudgeReviewDeps = Pick<ReviewCycleDeps, 'repos' | 'lifecycle' | 'approver' | 'by'>;

/**
 * Run the human uat judgment for an item in `review` WITHOUT merging.
 *
 * Independent across items (each is its own +prime approval + DB rows), so the
 * driver can fan these out in parallel; the returned {@link ReviewDecision}
 * tells it which items still need the serial closure.
 */
export async function judgeReview(itemId: string, deps: JudgeReviewDeps): Promise<ReviewDecision> {
  const { repos, lifecycle, approver } = deps;
  const by = deps.by ?? 'orchestrator';

  const item = repos.backlog.get(itemId);
  if (!item) throw new Error(`backlog item not found: ${itemId}`);
  if (item.status !== 'review') {
    throw new Error(
      `judgeReview requires item in 'review', got '${item.status}' for ${itemId}`,
    );
  }

  const uatRequired = item.review_gates.includes('uat');

  // uat unselected → no human approval needed; vacuous pass straight to closure
  // (mirrors test-cycle's 0-gate → review, §5.8).
  if (!uatRequired) {
    return { itemId, kind: 'merge', uatRequired: false, verdict: null };
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

  // Derive a collision-safe attempt: count of prior uat gate_run rows + 1.
  // UNIQUE(item_id, attempt, gate) means we must NOT reuse an existing (item_id, N, 'uat').
  // Using `currentAttempt()` (which tracks test-cycle attempt numbers) would collide
  // when test-cycle never ran (0-test-gate items stay at attempt 0). Counting only
  // prior uat rows gives an independent sequence per UAT cycle.
  const priorUatCount = repos.gateRuns.listForItem(itemId).filter((r) => r.gate === 'uat').length;
  const uatAttempt = priorUatCount + 1;

  if (verdict.approved) {
    repos.gateRuns.create({
      item_id: itemId,
      gate: 'uat',
      persona: '+prime',
      attempt: uatAttempt,
      status: 'pass',
    });
    return { itemId, kind: 'merge', uatRequired, verdict };
  }

  repos.gateRuns.create({
    item_id: itemId,
    gate: 'uat',
    persona: '+prime',
    attempt: uatAttempt,
    status: 'fail',
    findings: verdict.reason ?? null,
  });
  lifecycle.transition(
    itemId,
    'bounce',
    by,
    verdict.reason ? `uat rejected: ${verdict.reason}` : 'uat rejected',
  );
  return { itemId, kind: 'bounced', uatRequired, verdict };
}

/**
 * Run the full `review`-column uat cycle for an item already in `review`:
 * judgment then (when cleared) the mechanical closure.
 *
 * The review counterpart of {@link runTestCycle} (§5.9, Madde 4 eşi): the engine
 * owns the mechanics (uat-selected check, lifecycle transition, audit), the
 * injected {@link ReviewApprover} owns the approve/reject judgment. Kept as the
 * single-item entry point; the driver splits judge (parallel) from close
 * (serial) via {@link judgeReview} + {@link runClosure}.
 */
export async function runReviewCycle(itemId: string, deps: ReviewCycleDeps): Promise<ReviewCycleResult> {
  const { repos, lifecycle, approver, merger, deployer, previewManager } = deps;
  const by = deps.by ?? 'orchestrator';

  const decision = await judgeReview(itemId, { repos, lifecycle, approver, by });
  if (decision.kind === 'bounced') {
    return { itemId, outcome: 'bounced', uatRequired: decision.uatRequired, verdict: decision.verdict };
  }

  const closure = await runClosure(itemId, { repos, lifecycle, merger, deployer, previewManager, by });
  return { itemId, outcome: closure.outcome, uatRequired: decision.uatRequired, verdict: decision.verdict };
}
