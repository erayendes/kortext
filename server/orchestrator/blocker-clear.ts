import type { Repositories } from '../db/repositories/index.ts';
import type { BacklogStatus } from '../db/schemas.ts';

const TERMINAL: ReadonlySet<BacklogStatus> = new Set(['done', 'cancelled']);

export type BlockerClearDeps = {
  repos: Repositories;
  /** Actor recorded in the audit log. Default 'orchestrator'. */
  by?: string;
};

/**
 * After an item closes (done), unblock any dependents that are now fully
 * unblocked.
 *
 * For each item whose `frontmatter.blocked_by` includes `closedItemId` AND
 * whose status is `blocked` AND ALL of its `blocked_by` deps are now terminal
 * (done | cancelled) or dangling (missing → treated as resolved): set the item
 * back to `to_do` via a direct status write so the driver (which selects
 * `status:'to_do'`) can pick it up.
 *
 * The existing `unblock` lifecycle transition (`blocked → in_progress`) is NOT
 * used here because no worker is assigned yet — the item would be stuck in
 * `in_progress` forever. A direct `transitionStatus(id, 'to_do')` + audit is
 * the same pattern epic-completion.ts uses for epic → done.
 *
 * Best-effort per item: a throw on one candidate must not stop the others.
 */
export async function clearBlockedDependents(
  closedItemId: string,
  deps: BlockerClearDeps,
): Promise<void> {
  const { repos } = deps;
  const by = deps.by ?? 'orchestrator';

  const all = repos.backlog.list({ limit: 100_000 });

  for (const item of all) {
    // Only care about blocked items that list closedItemId as a blocker.
    if (item.status !== 'blocked') continue;
    const blockedBy = Array.isArray(item.frontmatter['blocked_by'])
      ? (item.frontmatter['blocked_by'] as string[])
      : [];
    if (!blockedBy.includes(closedItemId)) continue;

    // Check all blockers: a blocker is "resolved" if it is terminal or dangling.
    const allResolved = blockedBy.every((depId) => {
      const dep = repos.backlog.get(depId);
      // Dangling (not found) → treated as terminal (resolved).
      if (!dep) return true;
      return TERMINAL.has(dep.status);
    });

    if (!allResolved) continue;

    // All blockers resolved — make the item pickable by the driver.
    try {
      repos.backlog.transitionStatus(item.id, 'to_do');
      repos.auditLog.append({
        actor: by,
        action: 'backlog.auto_unblocked',
        resource_type: 'backlog_item',
        resource_id: item.id,
        payload: { unlockedBy: closedItemId },
      });
    } catch {
      // Best-effort — a failure on one item must not stop the rest.
    }
  }
}
