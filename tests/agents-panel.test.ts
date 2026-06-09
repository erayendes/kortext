import { describe, it, expect } from 'vitest';
import { deriveActiveAgents } from '../src/lib/agents-panel.ts';
import type { BacklogItem } from '../src/lib/api-types.ts';

function item(partial: Partial<BacklogItem> & Pick<BacklogItem, 'id'>): BacklogItem {
  return {
    type: 'task',
    title: partial.id,
    status: 'to_do',
    owner: null,
    parent_id: null,
    version: null,
    frontmatter: {},
    body_md: '',
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe('deriveActiveAgents', () => {
  it('lists only agents with unfinished work (done/cancelled/epic excluded)', () => {
    const rows = deriveActiveAgents([
      item({ id: 'A', owner: '+dev', status: 'in_progress' }),
      item({ id: 'B', owner: '+dev', status: 'done' }), // finished — not counted
      item({ id: 'C', owner: '+qa', status: 'cancelled' }), // not counted
      item({ id: 'E', type: 'epic', owner: '+pm', status: 'to_do' }), // epic excluded
      item({ id: 'D', owner: null }), // unassigned — skipped
    ]);
    expect(rows.map((r) => r.handle)).toEqual(['+dev']);
    expect(rows[0]).toMatchObject({ openCount: 1, leadItemId: 'A', leadStatus: 'in_progress', tone: 'working' });
  });

  it("uses the agent's most-advanced open item as the lead, and counts the rest", () => {
    const rows = deriveActiveAgents([
      item({ id: 'A', owner: '+dev', status: 'to_do' }),
      item({ id: 'B', owner: '+dev', status: 'in_progress' }),
      item({ id: 'C', owner: '+dev', status: 'review' }),
    ]);
    expect(rows[0]).toMatchObject({ handle: '+dev', openCount: 3, leadItemId: 'B', leadStatus: 'in_progress' });
  });

  it('resolves the agent from frontmatter.assignee when owner is null', () => {
    const rows = deriveActiveAgents([
      item({ id: 'A', owner: null, frontmatter: { assignee: '+frontend-developer' }, status: 'test' }),
    ]);
    expect(rows[0]).toMatchObject({ handle: '+frontend-developer', tone: 'working', statusLabel: 'Test' });
  });

  it('sorts working before queued, then by open count', () => {
    const rows = deriveActiveAgents([
      item({ id: 'A', owner: '+queued', status: 'to_do' }),
      item({ id: 'B', owner: '+busy', status: 'in_progress' }),
      item({ id: 'C', owner: '+busy2', status: 'in_progress' }),
      item({ id: 'D', owner: '+busy2', status: 'to_do' }),
    ]);
    // both +busy and +busy2 are "working"; +busy2 has more open → first
    expect(rows.map((r) => r.handle)).toEqual(['+busy2', '+busy', '+queued']);
  });

  it('flags a derived-locked lead item (open dependency) with the blocked tone', () => {
    // BLK is an open blocker; A depends on it → A is derived-locked even though
    // its real status is to_do (UAT #10 — no `blocked` status).
    const rows = deriveActiveAgents([
      item({ id: 'BLK', owner: '+other', status: 'in_progress' }),
      item({ id: 'A', owner: '+dev', status: 'to_do', frontmatter: { blocked_by: ['BLK'] } }),
    ]);
    const dev = rows.find((r) => r.handle === '+dev')!;
    expect(dev.tone).toBe('blocked');
  });

  it('returns [] when nobody has open work', () => {
    expect(deriveActiveAgents([item({ id: 'A', owner: '+dev', status: 'done' })])).toEqual([]);
  });
});
