/**
 * Preprod-approval consumer (§5.11 chain end).
 *
 * Called after a `phase='preprod-approval'` pending_question is answered.
 * Inspects the answer and either:
 *
 *   APPROVE — marks every epic in the version `frontmatter.preprod_approved=true`,
 *             then calls `deployer.deployProd({ version })` (the mechanical
 *             `development→main` merge + prod deploy + tag, mock-first per §5.11).
 *             Idempotency guard: if every version epic already has
 *             `preprod_approved === true` at entry → no-op (don't re-deploy).
 *
 *   REJECT  — opens a `type='bug'` backlog item titled
 *             `Preprod rejected: version ${version}` with the rejection reason
 *             as body; parent_id = first epic of that version (or null).
 *
 * Convention: answer === 'approve' → approved; anything else → rejected.
 * This is the END of the approval chain per §5.11 — no further gate after prod deploy.
 */

import type { PendingQuestion } from '../db/schemas.ts';
import type { Repositories } from '../db/repositories/index.ts';
import type { ApprovalQueue } from './approval-queue.ts';
import type { Deployer } from '../engine/deployer.ts';
import { nextBacklogId } from '../routes/backlog.ts';

export type ConsumePreprodApprovalDeps = {
  repos: Repositories;
  queue: ApprovalQueue;
  deployer: Deployer;
};

/**
 * Process an answered preprod-approval question. Safe to call with any answered
 * question; missing version metadata is a no-op.
 */
export async function consumePreprodApproval(
  question: PendingQuestion,
  deps: ConsumePreprodApprovalDeps,
): Promise<void> {
  const { repos, deployer } = deps;
  const metadata = question.metadata;

  // Defensive: only act when we have a meaningful version.
  if (!metadata || typeof metadata.version !== 'string' || metadata.version.length === 0) {
    return;
  }

  const version = metadata.version;
  const isApprove = question.answer === 'approve';

  if (isApprove) {
    await handleApprove(version, repos, deployer);
  } else {
    handleReject(version, question.answer ?? 'rejected', repos);
  }
}

// ---------------------------------------------------------------------------
// Approve branch
// ---------------------------------------------------------------------------

async function handleApprove(
  version: string,
  repos: Repositories,
  deployer: Deployer,
): Promise<void> {
  const epics = repos.backlog.list({ type: 'epic', limit: 500 });
  const versionEpics = epics.filter((e) => e.version === version);

  if (versionEpics.length === 0) return;

  // Idempotency guard: if every version epic already has preprod_approved=true,
  // do not re-deploy (duplicate answer or retry).
  const allAlreadyApproved = versionEpics.every(
    (e) => e.frontmatter.preprod_approved === true,
  );
  if (allAlreadyApproved) return;

  // Mark all version epics preprod-approved.
  for (const epic of versionEpics) {
    try {
      const updatedFrontmatter: Record<string, unknown> = {
        ...epic.frontmatter,
        preprod_approved: true,
      };
      repos.backlog.updateFrontmatter(epic.id, updatedFrontmatter);
    } catch {
      // Best-effort: if an epic was deleted race-concurrently, skip it.
    }
  }

  // Mechanical prod release: development→main merge + annotated tag (§5.11).
  // Prod push is a follow-up — WorkflowDeployer.deployProd does merge+tag only.
  const outcome = await deployer.deployProd({ version });

  // Surface a merge/deploy failure as a bug so it's visible in the backlog.
  // The approval side-effects (preprod_approved markers) above are kept — the
  // approval happened; the merge failure is a separate issue.
  if (!outcome.ok) {
    const epics = repos.backlog.list({ type: 'epic', limit: 500 });
    const versionEpics = epics.filter((e) => e.version === version);
    const firstEpic = versionEpics[0] ?? null;

    const bugId = nextBacklogId(repos, 'bug');
    repos.backlog.create({
      id: bugId,
      type: 'bug',
      title: `Prod release failed: version ${version}`,
      parent_id: firstEpic?.id ?? null,
      body_md: outcome.reason ?? 'prod release failed (no reason provided)',
      status: 'to_do',
    });
  }
}

// ---------------------------------------------------------------------------
// Reject branch
// ---------------------------------------------------------------------------

function handleReject(version: string, reason: string, repos: Repositories): void {
  const epics = repos.backlog.list({ type: 'epic', limit: 500 });
  const versionEpics = epics.filter((e) => e.version === version);
  const firstEpic = versionEpics[0] ?? null;

  const bugId = nextBacklogId(repos, 'bug');
  repos.backlog.create({
    id: bugId,
    type: 'bug',
    title: `Preprod rejected: version ${version}`,
    parent_id: firstEpic?.id ?? null,
    body_md: reason,
    status: 'to_do',
  });
}
