import { describe, expect, it } from 'vitest';
import { generateTodoMarkdown, orderByDependency } from '../server/engine/todo-generator.ts';
import type { BacklogItem } from '../server/db/schemas.ts';

function item(p: Partial<BacklogItem> & { id: string; type: BacklogItem['type'] }): BacklogItem {
  return {
    id: p.id,
    type: p.type,
    title: p.title ?? p.id,
    status: p.status ?? 'to_do',
    owner: p.owner ?? null,
    parent_id: p.parent_id ?? null,
    version: p.version ?? null,
    model: p.model ?? null,
    preview_url: p.preview_url ?? null,
    review_gates: p.review_gates ?? [],
    frontmatter: p.frontmatter ?? {},
    body_md: p.body_md ?? '',
    created_at: p.created_at ?? 1,
    updated_at: p.updated_at ?? 1,
  };
}

describe('generateTodoMarkdown', () => {
  it('nests version → epic → task with checkboxes and real ids', () => {
    const md = generateTodoMarkdown([
      item({ id: 'PROJ-E01', type: 'epic', title: 'Auth', version: 'v0.1', body_md: 'Login flows' }),
      item({ id: 'PROJ-001', type: 'task', title: 'OAuth', parent_id: 'PROJ-E01', version: 'v0.1', body_md: 'Set up OAuth' }),
      item({ id: 'PROJ-002', type: 'task', title: 'Logout', parent_id: 'PROJ-E01', version: 'v0.1', status: 'done' }),
    ]);
    expect(md).toContain('- [ ] v0.1');
    expect(md).toContain('    - [ ] PROJ-E01 - Auth: Login flows');
    expect(md).toContain('        - [ ] PROJ-001 - OAuth: Set up OAuth');
    expect(md).toContain('        - [x] PROJ-002 - Logout'); // done → [x]
  });

  it('orders tasks so a blocked task never precedes its blocker', () => {
    const tasks = [
      item({ id: 'T-003', type: 'task', frontmatter: { blocked_by: ['T-001'] } }),
      item({ id: 'T-001', type: 'task' }),
      item({ id: 'T-002', type: 'task', frontmatter: { blocked_by: ['T-001'] } }),
    ];
    const ordered = orderByDependency(tasks).map((t) => t.id);
    expect(ordered.indexOf('T-001')).toBeLessThan(ordered.indexOf('T-002'));
    expect(ordered.indexOf('T-001')).toBeLessThan(ordered.indexOf('T-003'));
  });

  it('excludes cancelled items and groups versions ascending', () => {
    const md = generateTodoMarkdown([
      item({ id: 'P-E01', type: 'epic', title: 'A', version: 'v1.0' }),
      item({ id: 'P-E02', type: 'epic', title: 'B', version: 'v0.1' }),
      item({ id: 'P-099', type: 'task', title: 'Dead', parent_id: 'P-E02', version: 'v0.1', status: 'cancelled' }),
    ]);
    expect(md).not.toContain('Dead');
    expect(md.indexOf('v0.1')).toBeLessThan(md.indexOf('v1.0')); // ascending
  });

  it('does not crash on a dependency cycle (falls back to id order)', () => {
    const ordered = orderByDependency([
      item({ id: 'C-1', type: 'task', frontmatter: { blocked_by: ['C-2'] } }),
      item({ id: 'C-2', type: 'task', frontmatter: { blocked_by: ['C-1'] } }),
    ]);
    expect(ordered).toHaveLength(2);
  });
});
