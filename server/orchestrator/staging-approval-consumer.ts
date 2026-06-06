/**
 * Staging-approval consumer (M2b).
 *
 * Called after a `phase='staging-approval'` pending_question is answered.
 * Inspects the answer and either:
 *
 *   APPROVE — marks gate-staging reports approved, marks the epic
 *             frontmatter staging_approved=true, then checks whether every
 *             epic in the same version is now staging-approved and, if so,
 *             enqueues a `phase='preprod-approval'` question for +prime.
 *
 *   REJECT  — opens a bug backlog item with the rejection reason as body.
 *
 * Convention (same as QueueReviewApprover): answer === 'approve' → approved;
 * anything else → rejected.
 *
 * NOTE: The preprod deployer substrate does not exist yet. The preprod-approval
 * question is enqueued here as a placeholder; the actual deploy step is a
 * follow-up (tracked in development/TODO.md).
 */

import type { PendingQuestion } from '../db/schemas.ts';
import type { Repositories } from '../db/repositories/index.ts';
import type { ApprovalQueue } from './approval-queue.ts';
import { nextBacklogId } from '../routes/backlog.ts';

export type ConsumeStagingApprovalDeps = {
  repos: Repositories;
  queue: ApprovalQueue;
  /** Seam for deterministic timestamps in tests. Defaults to `new Date()`. */
  now?: () => Date;
};

/**
 * Process an answered staging-approval question. Safe to call with any answered
 * question; non-staging-approval phases are a no-op via the epicId guard.
 */
export async function consumeStagingApproval(
  question: PendingQuestion,
  deps: ConsumeStagingApprovalDeps,
): Promise<void> {
  const { repos, queue } = deps;
  const metadata = question.metadata;

  // Defensive: only act when we have a meaningful epicId.
  if (!metadata || typeof metadata.epicId !== 'string' || metadata.epicId.length === 0) {
    return;
  }

  const epicId = metadata.epicId;
  const version =
    typeof metadata.version === 'string' && metadata.version.length > 0
      ? metadata.version
      : null;

  const isApprove = question.answer === 'approve';

  if (isApprove) {
    await handleApprove(epicId, version, repos, queue);
  } else {
    handleReject(epicId, question.answer ?? 'rejected', repos);
  }
}

// ---------------------------------------------------------------------------
// Approve branch
// ---------------------------------------------------------------------------

async function handleApprove(
  epicId: string,
  version: string | null,
  repos: Repositories,
  queue: ApprovalQueue,
): Promise<void> {
  // 1. Mark this epic's gate-staging reports approved.
  const stagingReports = repos.reports.list({
    scope: 'gate-staging',
    relatedItem: epicId,
  });
  for (const report of stagingReports) {
    try {
      repos.reports.updateStatus(report.id, 'approved');
    } catch {
      // Best-effort: if a report was deleted race-concurrently, skip it.
    }
  }

  // 2. Mark the epic itself staging-approved in frontmatter.
  const epic = repos.backlog.get(epicId);
  if (epic) {
    const updatedFrontmatter: Record<string, unknown> = {
      ...epic.frontmatter,
      staging_approved: true,
    };
    repos.backlog.updateFrontmatter(epicId, updatedFrontmatter);
  }

  // 3. Check whether every epic in this version is now staging-approved.
  if (version !== null) {
    await checkVersionCompletion(version, repos, queue);
  }
}

/**
 * If every epic tagged with `version` now has `frontmatter.staging_approved === true`,
 * enqueue a `preprod-approval` question for +prime.
 *
 * NOTE: The preprod DEPLOY substrate does not exist yet — this enqueues the
 * question only. The actual deploy step is a follow-up.
 */
async function checkVersionCompletion(
  version: string,
  repos: Repositories,
  queue: ApprovalQueue,
): Promise<void> {
  const epics = repos.backlog.list({ type: 'epic', limit: 500 });
  const versionEpics = epics.filter((e) => e.version === version);

  if (versionEpics.length === 0) return;

  const allApproved = versionEpics.every(
    (e) => e.frontmatter.staging_approved === true,
  );

  if (allApproved) {
    // Idempotency guard: two epics of the same version approved close together
    // (the route consumer is invoked per answer) must not each enqueue a
    // separate preprod-approval. Skip if one is already open for this version.
    const alreadyQueued = repos.pendingQuestions
      .listOpen()
      .some(
        (q) =>
          q.phase === 'preprod-approval' &&
          (q.metadata as { version?: string } | null)?.version === version,
      );
    if (alreadyQueued) return;
    queue.enqueue({
      runId: null,
      question: `All epics in version ${version} have been staging-approved. Ready to promote to pre-production?`,
      choices: ['approve', 'reject'],
      persona: '+prime',
      phase: 'preprod-approval',
      metadata: { version },
    });
  }
}

// ---------------------------------------------------------------------------
// Reject branch
// ---------------------------------------------------------------------------

function handleReject(epicId: string, reason: string, repos: Repositories): void {
  const bugId = nextBacklogId(repos, 'bug');
  repos.backlog.create({
    id: bugId,
    type: 'bug',
    title: `Staging rejected: ${epicId}`,
    parent_id: epicId,
    body_md: reason,
    status: 'to_do',
  });
}
