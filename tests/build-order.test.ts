import { describe, expect, it } from 'vitest';
import { selectBuildableItems } from '../server/orchestrator/build-order.ts';
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
