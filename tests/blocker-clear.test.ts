/**
 * Unit tests for clearBlockedDependents (server/orchestrator/blocker-clear.ts).
 * All repos are mocked — no DB, no real lifecycle needed.
 */
import { describe, expect, it, vi } from 'vitest';
import type { BacklogItem, BacklogStatus } from '../server/db/schemas.ts';
import { clearBlockedDependents } from '../server/orchestrator/blocker-clear.ts';

// ---------------------------------------------------------------------------
// Minimal mock builder
// ---------------------------------------------------------------------------

type MockItem = Pick<BacklogItem, 'id' | 'status' | 'frontmatter'>;
type AuditPayload = { id: number };

function makeMockRepos(items: MockItem[]) {
  const map = new Map(items.map((i) => [i.id, i]));
  const transitionStatus = vi.fn((id: string, status: BacklogStatus): MockItem => {
    const item = map.get(id);
    if (!item) throw new Error(`not found: ${id}`);
    const updated: MockItem = { ...item, status };
    map.set(id, updated);
    return updated;
  });
  const auditAppend = vi.fn((_input: unknown): AuditPayload => ({ id: 1 }));

  return {
    repos: {
      backlog: {
        list: vi.fn(() => [...map.values()]),
        get: vi.fn((id: string) => map.get(id) ?? null),
        transitionStatus,
      },
      auditLog: { append: auditAppend },
    } as unknown as import('../server/db/repositories/index.ts').Repositories,
    transitionStatus,
    auditAppend,
    getItem: (id: string) => map.get(id),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('clearBlockedDependents', () => {
  it('blocked item whose only blocker is now done → becomes to_do', async () => {
    const { repos, transitionStatus } = makeMockRepos([
      {
        id: 'TF-001',
        status: 'done',
        frontmatter: {},
      },
      {
        id: 'TF-002',
        status: 'blocked',
        frontmatter: { blocked_by: ['TF-001'] },
      },
    ]);

    await clearBlockedDependents('TF-001', { repos });

    expect(transitionStatus).toHaveBeenCalledWith('TF-002', 'to_do');
  });

  it('writes a backlog.auto_unblocked audit entry for the cleared item', async () => {
    const { repos, auditAppend } = makeMockRepos([
      { id: 'TF-001', status: 'done', frontmatter: {} },
      { id: 'TF-002', status: 'blocked', frontmatter: { blocked_by: ['TF-001'] } },
    ]);

    await clearBlockedDependents('TF-001', { repos, by: 'test-actor' });

    // Find the auto_unblocked call — mock.calls is unknown[][], so cast through unknown.
    const calls = auditAppend.mock.calls as unknown[][];
    const unblockCall = calls.find(
      (c) => c.length > 0 && (c[0] as Record<string, unknown>)['action'] === 'backlog.auto_unblocked',
    );
    expect(unblockCall).toBeDefined();
    expect(unblockCall![0]).toMatchObject({
      action: 'backlog.auto_unblocked',
      resource_type: 'backlog_item',
      resource_id: 'TF-002',
    });
  });

  it('co-blocker still in_progress → dependent stays blocked', async () => {
    const { repos, transitionStatus } = makeMockRepos([
      { id: 'TF-001', status: 'done', frontmatter: {} },
      { id: 'TF-003', status: 'in_progress', frontmatter: {} },
      {
        id: 'TF-002',
        status: 'blocked',
        frontmatter: { blocked_by: ['TF-001', 'TF-003'] },
      },
    ]);

    await clearBlockedDependents('TF-001', { repos });

    // TF-002 still has TF-003 as a non-terminal blocker → must NOT be unblocked
    expect(transitionStatus).not.toHaveBeenCalledWith('TF-002', 'to_do');
  });

  it('status to_do (never blocked) → untouched', async () => {
    const { repos, transitionStatus } = makeMockRepos([
      { id: 'TF-001', status: 'done', frontmatter: {} },
      {
        id: 'TF-002',
        status: 'to_do',
        frontmatter: { blocked_by: ['TF-001'] },
      },
    ]);

    await clearBlockedDependents('TF-001', { repos });

    expect(transitionStatus).not.toHaveBeenCalled();
  });

  it('dangling dep (not in DB) treated as terminal → item unblocked', async () => {
    const { repos, transitionStatus } = makeMockRepos([
      { id: 'TF-001', status: 'done', frontmatter: {} },
      {
        id: 'TF-002',
        status: 'blocked',
        // TF-999 does not exist → treated as terminal (dangling = resolved)
        frontmatter: { blocked_by: ['TF-001', 'TF-999'] },
      },
    ]);

    await clearBlockedDependents('TF-001', { repos });

    expect(transitionStatus).toHaveBeenCalledWith('TF-002', 'to_do');
  });

  it('one throwing transition does not stop the others', async () => {
    const items: MockItem[] = [
      { id: 'TF-001', status: 'done', frontmatter: {} },
      {
        id: 'TF-002',
        status: 'blocked',
        frontmatter: { blocked_by: ['TF-001'] },
      },
      {
        id: 'TF-003',
        status: 'blocked',
        frontmatter: { blocked_by: ['TF-001'] },
      },
    ];
    const { repos, transitionStatus, getItem } = makeMockRepos(items);

    // Make TF-002 throw on transition
    transitionStatus.mockImplementationOnce((id: string, _status: BacklogStatus): MockItem => {
      if (id === 'TF-002') throw new Error('simulated DB error');
      const item = getItem(id);
      if (!item) throw new Error(`not found: ${id}`);
      return { ...item, status: _status };
    });

    // Should NOT throw — best-effort
    await expect(clearBlockedDependents('TF-001', { repos })).resolves.not.toThrow();

    // TF-003 must still be processed even though TF-002 threw
    expect(transitionStatus).toHaveBeenCalledWith('TF-003', 'to_do');
  });

  it('no items reference the closed id → no transitions', async () => {
    const { repos, transitionStatus } = makeMockRepos([
      { id: 'TF-001', status: 'done', frontmatter: {} },
      { id: 'TF-002', status: 'to_do', frontmatter: {} },
    ]);

    await clearBlockedDependents('TF-001', { repos });

    expect(transitionStatus).not.toHaveBeenCalled();
  });

  it('cancelled dep treated as terminal → all-terminal → item unblocked', async () => {
    const { repos, transitionStatus } = makeMockRepos([
      { id: 'TF-001', status: 'done', frontmatter: {} },
      { id: 'TF-005', status: 'cancelled', frontmatter: {} },
      {
        id: 'TF-002',
        status: 'blocked',
        frontmatter: { blocked_by: ['TF-001', 'TF-005'] },
      },
    ]);

    await clearBlockedDependents('TF-001', { repos });

    expect(transitionStatus).toHaveBeenCalledWith('TF-002', 'to_do');
  });
});
