import type { Repositories } from '../db/repositories/index.ts';
import type { BacklogStatus } from '../db/schemas.ts';
import type { Deployer, DeployOutcome } from '../engine/deployer.ts';
import type { ApprovalQueue } from './approval-queue.ts';
import { runStagingApproval } from './staging-approval.ts';

const TERMINAL: ReadonlySet<BacklogStatus> = new Set(['done', 'cancelled']);

export type EpicCompletionResult = {
  itemId: string;
  /** The item's parent epic, or null when the item has no parent. */
  epicId: string | null;
  /** True when every child is terminal and at least one is done. */
  epicComplete: boolean;
  /** The staging deploy outcome when triggered; null otherwise. */
  deploy: DeployOutcome | null;
};

export type EpicCompletionDeps = {
  repos: Repositories;
  deployer: Deployer;
  /** Actor reserved for future audit. Default 'orchestrator'. */
  by?: string;
  /**
   * Approval queue for the post-deploy staging-approval fan-out (Task B5).
   * When omitted, gate-persona staging reports and the prime approval question
   * are skipped (backwards-compatible with existing call sites that do not yet
   * wire the queue).
   */
  queue?: ApprovalQueue;
};

/**
 * When an item closes, check whether its parent epic is now complete and, if so,
 * trigger the staging deploy (§5.9 #8, mock-first).
 *
 * Detection is a plain fold over the epic's children (orchestrator layer, §5.13):
 * complete = every child terminal (done|cancelled) AND at least one done. The
 * injected {@link Deployer} owns the deploy substrate (development → staging).
 * The epic's own status is intentionally left untouched (Eray kararı); the
 * closure→epic-check wiring is the capstone's job (Madde 10).
 */
export async function runEpicCompletion(
  itemId: string,
  deps: EpicCompletionDeps,
): Promise<EpicCompletionResult> {
  const { repos, deployer } = deps;

  const item = repos.backlog.get(itemId);
  if (!item) throw new Error(`backlog item not found: ${itemId}`);

  const epicId = item.parent_id;
  if (!epicId) {
    return { itemId, epicId: null, epicComplete: false, deploy: null };
  }

  // Detection fold: complete = every child terminal AND at least one done
  // (a cancelled child doesn't block; an all-cancelled epic isn't a completion).
  const children = repos.backlog.list({ parent_id: epicId, limit: 1000 });
  const complete =
    children.length > 0 &&
    children.every((c) => TERMINAL.has(c.status)) &&
    children.some((c) => c.status === 'done');

  if (!complete) {
    return { itemId, epicId, epicComplete: false, deploy: null };
  }

  // Flip the epic's own status to `done` (direct write — epics bypass the
  // worker/test/review lifecycle, so we skip lifecycle.transition and write
  // directly). Guard on current status so repeated calls are idempotent.
  const epic = repos.backlog.get(epicId);
  if (epic && epic.status !== 'done') {
    const by = deps.by ?? 'orchestrator';
    repos.backlog.transitionStatus(epicId, 'done');
    repos.auditLog.append({
      actor: by,
      action: 'epic.completed',
      resource_type: 'backlog_item',
      resource_id: epicId,
      payload: { epicId, triggeredBy: itemId },
    });
  }

  let deploy: DeployOutcome;
  try {
    deploy = await deployer.deployStaging({ epicId });
  } catch (err) {
    // A crashing deployer is a failed deploy, not a thrown closure.
    deploy = {
      ok: false,
      reason: `deployer error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Task B5: gate-persona staging reports + prime staging-approval question.
  // Best-effort — a failure here must not throw the epic-completion result.
  if (deploy.ok && deps.queue) {
    try {
      await runStagingApproval(epicId, { repos, queue: deps.queue });
    } catch {
      // Swallow: staging-approval is a post-deploy side-effect; epic completion
      // already succeeded at this point.
    }
  }

  return { itemId, epicId, epicComplete: true, deploy };
}
