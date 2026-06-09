import { describe, it, expect } from 'vitest';
import {
  statusBadge,
  acChecklist,
  childrenOf,
  epicProgress,
  formatDate,
  descriptionFromBody,
  availableTransitions,
  describeActivity,
  checklistFromSection,
  columnKeyForStatus,
  boardColumns,
  BOARD_COLUMNS,
  itemGates,
  gateProgress,
  blockReasonFromActivity,
  underlyingStatusFromActivity,
  dependenciesFromBody,
  dependenciesOf,
  assigneeOf,
  assigneesOf,
  compareVersions,
  sortedVersions,
  defaultActiveVersion,
  previewLinkOf,
} from '../src/lib/board-drawer.ts';
import type { ActivityEntry, BacklogItem } from '../src/lib/api-types.ts';

function item(partial: Partial<BacklogItem> & Pick<BacklogItem, 'id'>): BacklogItem {
  return {
    type: 'task',
    title: `title-${partial.id}`,
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

describe('statusBadge', () => {
  it('maps in_progress to a pink "In progress" badge (matches the pink column dot)', () => {
    expect(statusBadge('in_progress')).toEqual({ label: 'In progress', tone: 'pink' });
  });

  it('maps done to a green "Done" badge', () => {
    expect(statusBadge('done')).toEqual({ label: 'Done', tone: 'green' });
  });

  it('maps review to amber, test to blue, blocked to red — matching their column dot colors', () => {
    expect(statusBadge('review')).toEqual({ label: 'Review', tone: 'amber' });
    expect(statusBadge('test')).toEqual({ label: 'Test', tone: 'blue' });
    expect(statusBadge('blocked')).toEqual({ label: 'Blocked', tone: 'red' });
  });

  it('maps to_do and cancelled to a neutral badge', () => {
    expect(statusBadge('to_do')).toEqual({ label: 'To do', tone: 'neutral' });
    expect(statusBadge('cancelled')).toEqual({ label: 'Cancelled', tone: 'neutral' });
  });
});

describe('acChecklist', () => {
  it('reads the new [{text, done}] shape directly (per-item flags)', () => {
    expect(
      acChecklist({
        acceptance_criteria: [
          { text: 'a', done: true },
          { text: 'b', done: false },
          { text: 'c', done: true },
        ],
      }),
    ).toEqual([
      { text: 'a', done: true },
      { text: 'b', done: false },
      { text: 'c', done: true },
    ]);
  });

  it('defaults a missing done flag to false in the new shape', () => {
    expect(
      acChecklist({ acceptance_criteria: [{ text: 'a' }, { text: 'b', done: true }] }),
    ).toEqual([
      { text: 'a', done: false },
      { text: 'b', done: true },
    ]);
  });

  it('reads the legacy string[] + ac_done count → first N done (backward compatible)', () => {
    expect(acChecklist({ acceptance_criteria: ['a', 'b', 'c'], ac_done: 2 })).toEqual([
      { text: 'a', done: true },
      { text: 'b', done: true },
      { text: 'c', done: false },
    ]);
  });

  it('treats a legacy list with no ac_done (or 0) as nothing checked', () => {
    expect(acChecklist({ acceptance_criteria: ['a', 'b'] })).toEqual([
      { text: 'a', done: false },
      { text: 'b', done: false },
    ]);
    expect(acChecklist({ acceptance_criteria: ['a', 'b'], ac_done: 0 })).toEqual([
      { text: 'a', done: false },
      { text: 'b', done: false },
    ]);
  });

  it('clamps a legacy ac_done above the list length so everything is checked', () => {
    expect(acChecklist({ acceptance_criteria: ['a', 'b'], ac_done: 5 })).toEqual([
      { text: 'a', done: true },
      { text: 'b', done: true },
    ]);
  });

  it('returns [] when acceptance_criteria is absent, empty, or not an array', () => {
    expect(acChecklist({})).toEqual([]);
    expect(acChecklist({ acceptance_criteria: [] })).toEqual([]);
    expect(acChecklist({ acceptance_criteria: 'nope' })).toEqual([]);
  });
});

describe('childrenOf', () => {
  const items: BacklogItem[] = [
    item({ id: 'T1', parent_id: 'E1' }),
    item({ id: 'T2', parent_id: 'E2' }),
    item({ id: 'T3', parent_id: 'E1' }),
    item({ id: 'E1', type: 'epic' }),
  ];

  it('returns items whose parent_id matches the epic, in order', () => {
    expect(childrenOf(items, 'E1').map((i) => i.id)).toEqual(['T1', 'T3']);
  });

  it('returns [] when the epic has no children', () => {
    expect(childrenOf(items, 'E9')).toEqual([]);
  });
});

describe('epicProgress', () => {
  const items: BacklogItem[] = [
    item({ id: 'T1', parent_id: 'E1', status: 'done' }),
    item({ id: 'T2', parent_id: 'E1', status: 'in_progress' }),
    item({ id: 'T3', parent_id: 'E1', status: 'done' }),
    item({ id: 'T4', parent_id: 'E2', status: 'done' }),
  ];

  it('counts total + done children and rounds the percent (2 of 3 → 67%)', () => {
    expect(epicProgress(items, 'E1')).toEqual({ total: 3, done: 2, pct: 67 });
  });

  it('returns zeros and pct 0 for an epic with no children (no divide-by-zero)', () => {
    expect(epicProgress(items, 'E9')).toEqual({ total: 0, done: 0, pct: 0 });
  });
});

describe('formatDate', () => {
  it('formats an epoch (ms) as YYYY-MM-DD in UTC for stable output', () => {
    expect(formatDate(Date.UTC(2026, 4, 10))).toBe('2026-05-10');
    expect(formatDate(Date.UTC(2026, 0, 3))).toBe('2026-01-03');
  });
});

describe('descriptionFromBody', () => {
  it('drops the leading "# Heading" line (it duplicates the drawer title)', () => {
    expect(descriptionFromBody('# Login page\n\nDemo item for dashboard preview.\n')).toBe(
      'Demo item for dashboard preview.',
    );
  });

  it('returns prose unchanged when there is no leading heading', () => {
    expect(descriptionFromBody('Just prose, no heading')).toBe('Just prose, no heading');
  });

  it('returns an empty string when the body is only a heading', () => {
    expect(descriptionFromBody('# Only a heading\n')).toBe('');
  });

  it('returns an empty string for empty/blank input', () => {
    expect(descriptionFromBody('')).toBe('');
    expect(descriptionFromBody('   \n  ')).toBe('');
  });

  describe('availableTransitions (mirrors the backend ItemLifecycle legal moves)', () => {
    it('to_do → Start', () => {
      expect(availableTransitions('to_do')).toEqual([
        { action: 'start', label: 'Start', primary: true },
      ]);
    });

    it('in_progress → Send to test (primary) + Mark blocked', () => {
      expect(availableTransitions('in_progress')).toEqual([
        { action: 'test', label: 'Send to test', primary: true },
        { action: 'block', label: 'Mark blocked', primary: false },
      ]);
    });

    it('test → Move to review (primary) + Bounce back + Mark blocked', () => {
      expect(availableTransitions('test')).toEqual([
        { action: 'review', label: 'Move to review', primary: true },
        { action: 'bounce', label: 'Bounce back', primary: false },
        { action: 'block', label: 'Mark blocked', primary: false },
      ]);
    });

    it('review → Mark done (primary) + Bounce back + Mark blocked', () => {
      expect(availableTransitions('review')).toEqual([
        { action: 'done', label: 'Mark done', primary: true },
        { action: 'bounce', label: 'Bounce back', primary: false },
        { action: 'block', label: 'Mark blocked', primary: false },
      ]);
    });

    it('blocked → Unblock', () => {
      expect(availableTransitions('blocked')).toEqual([
        { action: 'unblock', label: 'Unblock', primary: true },
      ]);
    });

    it('terminal states offer no transitions', () => {
      expect(availableTransitions('done')).toEqual([]);
      expect(availableTransitions('cancelled')).toEqual([]);
    });
  });

  describe('describeActivity', () => {
    it('humanizes a status transition with readable status labels', () => {
      expect(
        describeActivity({
          actor: '+prime',
          action: 'item_transition',
          payload: { from: 'to_do', to: 'in_progress' },
        }),
      ).toBe('+prime moved To do → In progress');
    });

    it('surfaces the transition reason (UAT #9 #3: merge-conflict bounce)', () => {
      expect(
        describeActivity({
          actor: 'orchestrator',
          action: 'item_transition',
          payload: {
            from: 'review',
            to: 'in_progress',
            transition: 'bounce',
            reason: 'merge conflict: merge kortext/run-2 -> development failed',
          },
        }),
      ).toBe(
        'orchestrator moved Review → In progress — merge conflict: merge kortext/run-2 -> development failed',
      );
    });

    it('omits the reason suffix when there is none', () => {
      expect(
        describeActivity({
          actor: '+prime',
          action: 'item_transition',
          payload: { from: 'to_do', to: 'in_progress', reason: null },
        }),
      ).toBe('+prime moved To do → In progress');
    });

    it('humanizes an acceptance-criterion check', () => {
      expect(
        describeActivity({
          actor: '+prime',
          action: 'item_ac_toggle',
          payload: { index: 0, text: 'Logout clears the session', done: true },
        }),
      ).toBe('+prime checked "Logout clears the session"');
    });

    it('humanizes an acceptance-criterion uncheck', () => {
      expect(
        describeActivity({
          actor: '+qa-engineer',
          action: 'item_ac_toggle',
          payload: { index: 0, text: 'Logout clears the session', done: false },
        }),
      ).toBe('+qa-engineer unchecked "Logout clears the session"');
    });

    it('falls back to "actor action" for non-transition entries', () => {
      expect(
        describeActivity({ actor: '+backend-developer', action: 'created', payload: {} }),
      ).toBe('+backend-developer created');
    });
  });

  describe('checklistFromSection', () => {
    const body =
      '# T\n\n## Review Gates\n\n- [ ] Code review\n- [x] Quality control\n- [ ] Security check\n\n## Notes\n\n- [ ] ignored\n';

    it('parses the markdown checklist under the named section (done from [x])', () => {
      expect(checklistFromSection(body, 'Review Gates')).toEqual([
        { text: 'Code review', done: false },
        { text: 'Quality control', done: true },
        { text: 'Security check', done: false },
      ]);
    });

    it('stops at the next heading (does not bleed into other sections)', () => {
      expect(checklistFromSection(body, 'Review Gates')).toHaveLength(3);
    });

    it('returns [] when the section is absent or body is empty', () => {
      expect(checklistFromSection(body, 'Acceptance Criteria')).toEqual([]);
      expect(checklistFromSection('', 'Review Gates')).toEqual([]);
    });
  });

  it('extracts the "## Description" section from a templated body (up to the next heading)', () => {
    const body =
      '# OAuth login flow\n\n> **Status:** ...\n\n---\n\n## Description\n\nValidate JWT tokens on protected routes.\n\n## Acceptance Criteria\n\n- [ ] x\n';
    expect(descriptionFromBody(body)).toBe('Validate JWT tokens on protected routes.');
  });

  it('hides an unfilled bracketed placeholder description (template not yet written)', () => {
    const body =
      '# T\n\n## Description\n\n[Bu bir örnek görev dosyasıdır.]\n\n## Acceptance Criteria\n\n- [ ] x\n';
    expect(descriptionFromBody(body)).toBe('');
  });
});

describe('columnKeyForStatus (blocked has its own column — UAT #10)', () => {
  it('maps each workflow status to its own column', () => {
    expect(columnKeyForStatus('to_do')).toBe('to_do');
    expect(columnKeyForStatus('in_progress')).toBe('in_progress');
    expect(columnKeyForStatus('test')).toBe('test');
    expect(columnKeyForStatus('review')).toBe('review');
    expect(columnKeyForStatus('done')).toBe('done');
  });

  it('maps blocked to its own dedicated column, NOT in_progress (UAT #10 — blocked must never look "In progress")', () => {
    expect(columnKeyForStatus('blocked')).toBe('blocked');
    expect(columnKeyForStatus('blocked')).not.toBe('in_progress');
  });

  it('returns null for cancelled (hidden from the board)', () => {
    expect(columnKeyForStatus('cancelled')).toBeNull();
  });
});

describe('boardColumns', () => {
  it('exposes the six columns in left-to-right workflow order, with Blocked after In progress', () => {
    expect(BOARD_COLUMNS.map((c) => c.key)).toEqual([
      'to_do',
      'in_progress',
      'blocked',
      'test',
      'review',
      'done',
    ]);
  });

  it('includes a Blocked column with a distinct lock/red color', () => {
    const blocked = BOARD_COLUMNS.find((c) => c.key === 'blocked');
    expect(blocked).toBeDefined();
    expect(blocked!.name).toMatch(/blocked/i);
    // distinct from the in_progress amber — its own red/lock color
    const inProgress = BOARD_COLUMNS.find((c) => c.key === 'in_progress');
    expect(blocked!.color).not.toBe(inProgress!.color);
  });

  it('routes tasks/bugs/debt into columns, drops epics (they live in the rail) and cancelled', () => {
    const items = [
      item({ id: 'E01', type: 'epic', status: 'in_progress' }),
      item({ id: 'T01', status: 'to_do' }),
      item({ id: 'T02', status: 'in_progress' }),
      item({ id: 'T03', status: 'blocked' }),
      item({ id: 'T04', status: 'done' }),
      item({ id: 'T05', status: 'cancelled' }),
    ];
    const cols = boardColumns(items);
    const byKey = Object.fromEntries(cols.map((c) => [c.key, c.cards.map((x) => x.id)]));
    expect(byKey.to_do).toEqual(['T01']);
    // blocked T03 now lands in its own Blocked column, never in In progress
    expect(byKey.in_progress).toEqual(['T02']);
    expect(byKey.blocked).toEqual(['T03']);
    expect(byKey.test).toEqual([]);
    expect(byKey.done).toEqual(['T04']);
    // epic + cancelled never appear as cards
    expect(cols.flatMap((c) => c.cards.map((x) => x.id))).not.toContain('E01');
    expect(cols.flatMap((c) => c.cards.map((x) => x.id))).not.toContain('T05');
  });

  it('preserves input order within a column', () => {
    const items = [
      item({ id: 'T09', status: 'to_do' }),
      item({ id: 'T01', status: 'to_do' }),
      item({ id: 'T05', status: 'to_do' }),
    ];
    const todo = boardColumns(items).find((c) => c.key === 'to_do')!;
    expect(todo.cards.map((x) => x.id)).toEqual(['T09', 'T01', 'T05']);
  });
});

describe('itemGates / gateProgress (item-based gate strip → AC/QC/SE/DS/CR)', () => {
  it('renders only the selected gates, in canonical AC→QC→SE→DS→CR order', () => {
    const it1 = item({ id: 'T1', review_gates: ['code_review', 'uat', 'quality_control'] });
    expect(itemGates(it1).map((g) => g.abbr)).toEqual(['AC', 'QC', 'CR']);
  });

  it('is empty when no gates are selected (sparse real data → no strip)', () => {
    expect(itemGates(item({ id: 'T1', review_gates: [] }))).toEqual([]);
    expect(itemGates(item({ id: 'T1' }))).toEqual([]); // field absent
    expect(gateProgress(item({ id: 'T1' }))).toEqual({ done: 0, total: 0 });
  });

  it('marks every gate passed once the item is done', () => {
    const done = item({ id: 'T1', status: 'done', review_gates: ['code_review', 'uat'] });
    expect(itemGates(done).every((g) => g.state === 'passed')).toBe(true);
    expect(gateProgress(done)).toEqual({ done: 2, total: 2 });
  });

  it('passes the AC (uat) gate only when all acceptance criteria are checked; others stay pending', () => {
    const fm = { acceptance_criteria: [{ text: 'a', done: true }, { text: 'b', done: true }] };
    const ip = item({
      id: 'T1',
      status: 'in_progress',
      review_gates: ['uat', 'code_review'],
      frontmatter: fm,
    });
    const gates = itemGates(ip);
    expect(gates.find((g) => g.abbr === 'AC')!.state).toBe('passed');
    expect(gates.find((g) => g.abbr === 'CR')!.state).toBe('pending');
    expect(gateProgress(ip)).toEqual({ done: 1, total: 2 });
  });

  it('leaves the AC gate pending when criteria are incomplete or absent', () => {
    const partial = item({
      id: 'T1',
      status: 'in_progress',
      review_gates: ['uat'],
      frontmatter: { acceptance_criteria: [{ text: 'a', done: false }] },
    });
    expect(itemGates(partial)[0]!.state).toBe('pending');
    const none = item({ id: 'T2', status: 'in_progress', review_gates: ['uat'] });
    expect(itemGates(none)[0]!.state).toBe('pending');
  });
});

describe('blockReasonFromActivity', () => {
  const entry = (over: Partial<ActivityEntry>): ActivityEntry => ({
    id: 1,
    actor: '+prime',
    action: 'item_transition',
    resource_type: 'backlog_item',
    resource_id: 'T03',
    payload: {},
    created_at: 0,
    ...over,
  });

  it('returns the reason from the most recent block transition', () => {
    const activity = [
      entry({ id: 2, created_at: 200, payload: { transition: 'block', reason: 'awaiting DNS / SPF' } }),
      entry({ id: 1, created_at: 100, payload: { transition: 'start' } }),
    ];
    expect(blockReasonFromActivity(activity)).toBe('awaiting DNS / SPF');
  });

  it('returns null when the block carried no reason or there is no block entry', () => {
    expect(blockReasonFromActivity([entry({ payload: { transition: 'block', reason: null } })])).toBeNull();
    expect(blockReasonFromActivity([entry({ payload: { transition: 'start' } })])).toBeNull();
    expect(blockReasonFromActivity([])).toBeNull();
  });
});

describe('underlyingStatusFromActivity (the column a blocked item came from)', () => {
  const entry = (over: Partial<ActivityEntry>): ActivityEntry => ({
    id: 1,
    actor: '+prime',
    action: 'item_transition',
    resource_type: 'backlog_item',
    resource_id: 'T03',
    payload: {},
    created_at: 0,
    ...over,
  });

  it('reads the `from` status of the latest block transition', () => {
    const activity = [
      entry({ id: 2, created_at: 200, payload: { from: 'test', to: 'blocked', transition: 'block' } }),
      entry({ id: 1, created_at: 100, payload: { from: 'to_do', to: 'in_progress', transition: 'start' } }),
    ];
    expect(underlyingStatusFromActivity(activity)).toBe('test');
  });

  it('returns null when there is no block transition on record', () => {
    expect(underlyingStatusFromActivity([entry({ payload: { transition: 'start' } })])).toBeNull();
  });
});

describe('dependenciesFromBody (## Dependencies → Blocks / Blocked By ids)', () => {
  it('extracts real item ids and ignores unfilled [task-id] placeholders', () => {
    const body =
      '## Dependencies\n\n- **Blocks:** T07 - pricing page\n- **Blocked By:** B-203 - email delivery\n\n## Notes\n';
    expect(dependenciesFromBody(body)).toEqual({ blocks: ['T07'], blockedBy: ['B-203'] });
  });

  it('returns empty arrays for the untouched template (all placeholders)', () => {
    const body =
      '## Dependencies\n\n- **Blocks:** [task-id] - [task-name]\n- **Blocked By:** [task-id] - [task-name]\n';
    expect(dependenciesFromBody(body)).toEqual({ blocks: [], blockedBy: [] });
  });

  it('returns empty arrays when the section is missing', () => {
    expect(dependenciesFromBody('# T\n\nno deps here')).toEqual({ blocks: [], blockedBy: [] });
  });
});

describe('dependenciesOf', () => {
  it('prefers structured frontmatter blocks/blocked_by (what planning writes)', () => {
    expect(
      dependenciesOf(
        item({ id: 'TF-002', frontmatter: { blocks: ['TF-003'], blocked_by: ['TF-001'] }, body_md: '' }),
      ),
    ).toEqual({ blocks: ['TF-003'], blockedBy: ['TF-001'] });
  });

  it('falls back to the body Dependencies section when frontmatter has none', () => {
    const body = '## Dependencies\n- Blocked by: T01\n- Blocks: T03';
    expect(dependenciesOf(item({ id: 'T02', body_md: body }))).toEqual({
      blocks: ['T03'],
      blockedBy: ['T01'],
    });
  });

  it('ignores non-string / empty frontmatter values', () => {
    expect(
      dependenciesOf(item({ id: 'X', frontmatter: { blocks: [1, '', 'TF-009'], blocked_by: 'nope' }, body_md: '' })),
    ).toEqual({ blocks: ['TF-009'], blockedBy: [] });
  });
});

describe('assigneeOf', () => {
  it('prefers the engine-set owner column when present', () => {
    expect(assigneeOf(item({ id: 'T1', owner: '+engineering-manager' }))).toBe(
      '+engineering-manager',
    );
  });

  it('falls back to frontmatter.assignee when owner is null (planning agents write here)', () => {
    expect(
      assigneeOf(item({ id: 'T1', owner: null, frontmatter: { assignee: '+frontend-developer' } })),
    ).toBe('+frontend-developer');
  });

  it('owner wins over a differing frontmatter.assignee', () => {
    expect(
      assigneeOf(item({ id: 'T1', owner: '+prime', frontmatter: { assignee: '+qa-engineer' } })),
    ).toBe('+prime');
  });

  it('returns null when neither owner nor a string assignee is set', () => {
    expect(assigneeOf(item({ id: 'T1', owner: null }))).toBeNull();
    expect(assigneeOf(item({ id: 'T1', owner: null, frontmatter: { assignee: 42 } }))).toBeNull();
    expect(assigneeOf(item({ id: 'T1', owner: null, frontmatter: { assignee: '' } }))).toBeNull();
  });
});

describe('assigneesOf', () => {
  it('lists distinct non-epic assignees alphabetically, resolving owner/frontmatter', () => {
    const items = [
      item({ id: 'A', owner: '+qa-engineer' }),
      item({ id: 'B', owner: null, frontmatter: { assignee: '+frontend-developer' } }),
      item({ id: 'C', owner: '+qa-engineer' }), // dup
      item({ id: 'E', type: 'epic', owner: '+engineering-manager' }), // epic excluded
      item({ id: 'D', owner: null }), // no assignee skipped
    ];
    expect(assigneesOf(items)).toEqual(['+frontend-developer', '+qa-engineer']);
  });

  it('returns [] when nobody is assigned', () => {
    expect(assigneesOf([item({ id: 'A', owner: null })])).toEqual([]);
  });
});

describe('previewLinkOf (live preview URL surfaced in the drawer)', () => {
  it('returns the preview_url when it is a non-empty string', () => {
    expect(previewLinkOf(item({ id: 'T1', preview_url: 'http://127.0.0.1:4173' }))).toBe(
      'http://127.0.0.1:4173',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(previewLinkOf(item({ id: 'T1', preview_url: '  http://127.0.0.1:4173  ' }))).toBe(
      'http://127.0.0.1:4173',
    );
  });

  it('returns null when preview_url is null, empty, blank, or absent', () => {
    expect(previewLinkOf(item({ id: 'T1', preview_url: null }))).toBeNull();
    expect(previewLinkOf(item({ id: 'T1', preview_url: '' }))).toBeNull();
    expect(previewLinkOf(item({ id: 'T1', preview_url: '   ' }))).toBeNull();
    expect(previewLinkOf(item({ id: 'T1' }))).toBeNull(); // field absent
  });
});

describe('compareVersions', () => {
  it('orders dotted versions numerically, not lexically (v0.2 < v0.10 < v1.0)', () => {
    expect(['v0.10', 'v1.0', 'v0.2'].sort(compareVersions)).toEqual(['v0.2', 'v0.10', 'v1.0']);
  });

  it('treats a missing trailing segment as zero (v1 === v1.0 < v1.1)', () => {
    expect(compareVersions('v1', 'v1.0')).toBe(0);
    expect(compareVersions('v1', 'v1.1')).toBeLessThan(0);
  });

  it('ignores the leading non-digit prefix (v / version)', () => {
    expect(compareVersions('v2.0', '1.5')).toBeGreaterThan(0);
  });
});

describe('sortedVersions', () => {
  it('returns the unique versions present, ascending, skipping null', () => {
    const items = [
      item({ id: 'A', version: 'v1.0' }),
      item({ id: 'B', version: 'v0.2' }),
      item({ id: 'C', version: 'v0.2' }),
      item({ id: 'D', version: null }),
      item({ id: 'E', version: 'v0.10' }),
    ];
    expect(sortedVersions(items)).toEqual(['v0.2', 'v0.10', 'v1.0']);
  });

  it('returns [] when no item carries a version', () => {
    expect(sortedVersions([item({ id: 'A' }), item({ id: 'B' })])).toEqual([]);
  });
});

describe('defaultActiveVersion', () => {
  it('picks the smallest version that still has unfinished non-epic work', () => {
    const items = [
      item({ id: 'A', version: 'v0.1', status: 'done' }),
      item({ id: 'B', version: 'v0.2', status: 'in_progress' }),
      item({ id: 'C', version: 'v1.0', status: 'to_do' }),
    ];
    expect(defaultActiveVersion(items)).toBe('v0.2');
  });

  it('skips a version whose only open item is an epic (epics are rail-only)', () => {
    const items = [
      item({ id: 'E1', type: 'epic', version: 'v0.1', status: 'to_do' }),
      item({ id: 'A', version: 'v0.1', status: 'done' }),
      item({ id: 'B', version: 'v0.5', status: 'review' }),
    ];
    expect(defaultActiveVersion(items)).toBe('v0.5');
  });

  it('returns null when every version is fully complete (board shows all)', () => {
    const items = [
      item({ id: 'A', version: 'v0.1', status: 'done' }),
      item({ id: 'B', version: 'v1.0', status: 'cancelled' }),
    ];
    expect(defaultActiveVersion(items)).toBeNull();
  });

  it('returns null when there are no versions at all', () => {
    expect(defaultActiveVersion([item({ id: 'A', status: 'to_do' })])).toBeNull();
  });
});
