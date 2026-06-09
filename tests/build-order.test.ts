import { describe, expect, it } from 'vitest';
import { selectBuildableItems, isBlocked } from '../server/orchestrator/build-order.ts';
import type { BacklogItem } from '../server/db/schemas.ts';

// UAT #9 #1+#2: the build/drive scheduler used to run EVERY to_do item in
// parallel, ignoring blocked_by + version → all coded from the same
// `development` base → merge conflicts → bounce → permanent stall. The
// scheduler must run in order: current version → dependency-ready items only,
// and must re-pick a bounced (in_progress) item so it retries.
function item(over: Partial<BacklogItem> & { id: string }): BacklogItem {
  return {
    id: over.id,
    type: over.type ?? 'task',
    title: over.title ?? over.id,
    status: over.status ?? 'to_do',
    owner: over.owner ?? null,
    parent_id: over.parent_id ?? null,
    version: over.version ?? null,
    model: over.model ?? null,
    preview_url: over.preview_url ?? null,
    review_gates: over.review_gates ?? [],
    frontmatter: over.frontmatter ?? {},
    body_md: over.body_md ?? '',
    created_at: over.created_at ?? 1,
    updated_at: over.updated_at ?? 1,
  };
}
const ids = (items: BacklogItem[]) => items.map((i) => i.id).sort();

describe('selectBuildableItems', () => {
  it('runs only the head of a blocked_by chain; blocked items wait', () => {
    const items = [
      item({ id: 'T1', version: 'v0.1' }),
      item({ id: 'T2', version: 'v0.1', frontmatter: { blocked_by: ['T1'] } }),
      item({ id: 'T3', version: 'v0.1', frontmatter: { blocked_by: ['T2'] } }),
    ];
    expect(ids(selectBuildableItems(items))).toEqual(['T1']); // T2/T3 blocked
  });

  it('releases the next item once its blocker is done', () => {
    const items = [
      item({ id: 'T1', version: 'v0.1', status: 'done' }),
      item({ id: 'T2', version: 'v0.1', frontmatter: { blocked_by: ['T1'] } }),
      item({ id: 'T3', version: 'v0.1', frontmatter: { blocked_by: ['T2'] } }),
    ];
    expect(ids(selectBuildableItems(items))).toEqual(['T2']); // T1 done → T2 ready, T3 still blocked
  });

  it('gates by the EARLIEST version with open work (version ordering)', () => {
    const items = [
      item({ id: 'A1', version: 'v0.1' }),
      item({ id: 'B1', version: 'v0.2' }), // later version — must wait
    ];
    expect(ids(selectBuildableItems(items))).toEqual(['A1']);
  });

  it('advances to the next version once the earlier one is fully done', () => {
    const items = [
      item({ id: 'A1', version: 'v0.1', status: 'done' }),
      item({ id: 'B1', version: 'v0.2' }),
      item({ id: 'B2', version: 'v0.10' }), // semver: v0.10 > v0.2, so B1 first
    ];
    expect(ids(selectBuildableItems(items))).toEqual(['B1']);
  });

  it('re-picks a bounced (in_progress) item so it retries (#2)', () => {
    const items = [
      item({ id: 'T1', version: 'v0.1', status: 'done' }),
      item({ id: 'T2', version: 'v0.1', status: 'in_progress', frontmatter: { blocked_by: ['T1'] } }),
    ];
    expect(ids(selectBuildableItems(items))).toContain('T2'); // bounced T2 retried
  });

  it('never builds epics, terminal, or test/review items', () => {
    const items = [
      item({ id: 'E1', type: 'epic', version: 'v0.1' }),
      item({ id: 'T1', version: 'v0.1', status: 'done' }),
      item({ id: 'T2', version: 'v0.1', status: 'cancelled' }),
      item({ id: 'T3', version: 'v0.1', status: 'test' }),
      item({ id: 'T4', version: 'v0.1', status: 'review' }),
      item({ id: 'T5', version: 'v0.1', status: 'to_do' }),
    ];
    expect(ids(selectBuildableItems(items))).toEqual(['T5']);
  });

  it('treats a dangling blocker (id not present) as resolved (no permanent stall)', () => {
    const items = [item({ id: 'T1', version: 'v0.1', frontmatter: { blocked_by: ['GHOST'] } })];
    expect(ids(selectBuildableItems(items))).toEqual(['T1']);
  });
});

// `blocked` is no longer a status — it's a DERIVED lock flag. An item is
// "locked" when it has a `blocked_by` dependency that is not yet terminal
// (done/cancelled). The item keeps its real status (to_do / in_progress / …);
// the lock is just an overlay used by the board (🔒 badge) and the scheduler.
describe('isBlocked (derived lock flag)', () => {
  const byId = (items: BacklogItem[]) => new Map(items.map((i) => [i.id, i]));

  it('is true when a blocker is not yet terminal', () => {
    const blocker = item({ id: 'T1', status: 'in_progress' });
    const dependent = item({ id: 'T2', frontmatter: { blocked_by: ['T1'] } });
    expect(isBlocked(dependent, byId([blocker, dependent]))).toBe(true);
  });

  it('is false when every blocker is terminal (done)', () => {
    const blocker = item({ id: 'T1', status: 'done' });
    const dependent = item({ id: 'T2', frontmatter: { blocked_by: ['T1'] } });
    expect(isBlocked(dependent, byId([blocker, dependent]))).toBe(false);
  });

  it('is false when the blocker is cancelled (terminal)', () => {
    const blocker = item({ id: 'T1', status: 'cancelled' });
    const dependent = item({ id: 'T2', frontmatter: { blocked_by: ['T1'] } });
    expect(isBlocked(dependent, byId([blocker, dependent]))).toBe(false);
  });

  it('is false when the blocker is dangling (missing id = resolved)', () => {
    const dependent = item({ id: 'T2', frontmatter: { blocked_by: ['GHOST'] } });
    expect(isBlocked(dependent, byId([dependent]))).toBe(false);
  });

  it('is false when there are no blockers at all', () => {
    const it1 = item({ id: 'T1' });
    expect(isBlocked(it1, byId([it1]))).toBe(false);
  });

  it('is true if ANY blocker is still open (mixed terminal + open)', () => {
    const done = item({ id: 'T1', status: 'done' });
    const open = item({ id: 'T2', status: 'to_do' });
    const dependent = item({ id: 'T3', frontmatter: { blocked_by: ['T1', 'T2'] } });
    expect(isBlocked(dependent, byId([done, open, dependent]))).toBe(true);
  });
});
