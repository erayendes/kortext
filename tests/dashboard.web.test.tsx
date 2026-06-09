import { describe, it, expect } from 'vitest';
import {
  itemStatusBars,
  epicProgressRows,
  runPill,
  mergeActivity,
  describeAuditEvent,
  buildActivityFeed,
  formatAge,
  STATUS_SEGMENTS,
} from '../src/routes/dashboard.tsx';
import type {
  ActivityEntry,
  BacklogItem,
  DecisionIndex,
  Handover,
} from '../src/lib/api-types.ts';

function audit(partial: Partial<ActivityEntry> & Pick<ActivityEntry, 'id'>): ActivityEntry {
  return {
    actor: '+prime',
    action: 'pipeline.succeeded',
    resource_type: 'run',
    resource_id: '1',
    payload: {},
    created_at: 0,
    ...partial,
  };
}

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

describe('itemStatusBars', () => {
  it('counts items into the 5 canonical bars and computes shares', () => {
    const items: BacklogItem[] = [
      item({ id: 'T-1', status: 'to_do' }),
      item({ id: 'T-2', status: 'to_do' }),
      item({ id: 'T-3', status: 'in_progress' }),
      item({ id: 'T-4', status: 'done' }),
    ];
    const { bars, total } = itemStatusBars(items);
    expect(total).toBe(4);
    expect(bars.map((b) => b.n)).toEqual([2, 1, 0, 0, 1]);
    const todo = bars[0]!;
    expect(todo.pct).toBe(50); // 2 of 4
    expect(todo.barPct).toBe(100); // busiest segment
  });

  it('ignores statuses outside the canonical set (cancelled)', () => {
    // `cancelled` is a real status but is intentionally not one of the five
    // dashboard bars, so it must not contribute to the total.
    const items = [item({ id: 'Y', status: 'cancelled' })];
    const { total } = itemStatusBars(items);
    expect(total).toBe(0);
  });

  it('produces zeroed bars (no NaN) for an empty backlog', () => {
    const { bars, total } = itemStatusBars([]);
    expect(total).toBe(0);
    expect(bars).toHaveLength(STATUS_SEGMENTS.length);
    expect(bars.every((b) => b.n === 0 && b.pct === 0 && b.barPct === 0)).toBe(true);
  });
});

describe('epicProgressRows', () => {
  it('derives pct from child completion', () => {
    const items: BacklogItem[] = [
      item({ id: 'E-1', type: 'epic', title: 'Auth' }),
      item({ id: 'T-1', parent_id: 'E-1', status: 'done' }),
      item({ id: 'T-2', parent_id: 'E-1', status: 'done' }),
      item({ id: 'T-3', parent_id: 'E-1', status: 'in_progress' }),
      item({ id: 'T-4', parent_id: 'E-1', status: 'to_do' }),
    ];
    const rows = epicProgressRows(items);
    expect(rows).toEqual([{ id: 'E-1', title: 'Auth', pct: 50 }]); // 2 of 4 done
  });

  it('falls back to own status when the epic has no children', () => {
    const rows = epicProgressRows([
      item({ id: 'E-1', type: 'epic', status: 'done' }),
      item({ id: 'E-2', type: 'epic', status: 'in_progress' }),
    ]);
    expect(rows.map((r) => r.pct)).toEqual([100, 0]);
  });

  it('only returns epics', () => {
    const rows = epicProgressRows([item({ id: 'T-1', type: 'task' })]);
    expect(rows).toHaveLength(0);
  });
});

describe('runPill', () => {
  it('maps run statuses to wireframe pills', () => {
    expect(runPill('running')).toEqual({ label: 'Live', cls: 'tag-live' });
    expect(runPill('queued')).toEqual({ label: 'Queued', cls: 'tag-warn' });
    expect(runPill('awaiting_approval')).toEqual({ label: 'Review', cls: 'tag-warn' });
    expect(runPill('failed')).toEqual({ label: 'Blocked', cls: 'tag-block' });
  });
});

describe('mergeActivity', () => {
  const handover: Handover = {
    id: 1,
    item_id: 'T-1',
    from_persona: '+engineering-manager',
    to_persona: '+backend-developer',
    reason: null,
    context_payload: {},
    markdown_path: null,
    created_at: 100,
  };
  const decision: DecisionIndex = {
    id: 1,
    decision_id: 'ADR-003',
    title: 'Use hash history',
    status: 'accepted',
    markdown_path: 'x.md',
    item_id: null,
    tags: [],
    created_at: 50,
    decided_at: 200,
  };

  it('merges both sources newest-first, preferring decided_at for decisions', () => {
    const events = mergeActivity([handover], [decision]);
    expect(events.map((e) => e.kind)).toEqual(['decision', 'handover']); // 200 > 100
    expect(events[0]).toMatchObject({ kind: 'decision', decisionId: 'ADR-003', who: '+prime' });
    expect(events[1]).toMatchObject({ kind: 'handover', toPersona: '+backend-developer', item: 'T-1' });
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ ...handover, id: i, created_at: i }));
    expect(mergeActivity(many, [], 40)).toHaveLength(40);
  });
});

describe('formatAge', () => {
  const now = 1_000_000_000;
  it('renders compact terse stamps', () => {
    expect(formatAge(now, now)).toBe('now');
    expect(formatAge(now - 90_000, now)).toBe('1m');
    expect(formatAge(now - 2 * 3_600_000, now)).toBe('2h');
    expect(formatAge(now - 3 * 86_400_000, now)).toBe('3d');
  });
});

describe('describeAuditEvent', () => {
  it('phrases pipeline lifecycle events', () => {
    expect(
      describeAuditEvent({ actor: 'orchestrator', action: 'pipeline.succeeded', payload: { workflow_id: 'planning-pipeline' } }),
    ).toBe('completed planning-pipeline');
    expect(
      describeAuditEvent({ actor: 'orchestrator', action: 'pipeline.chained', payload: { to_workflow: 'planning-pipeline' } }),
    ).toBe('advanced to planning-pipeline');
  });

  it('phrases gate events', () => {
    expect(describeAuditEvent({ actor: 'engine', action: 'gate.awaiting-approval', payload: {} })).toMatch(
      /approval/i,
    );
  });

  it('summarises a backlog patch by count', () => {
    expect(describeAuditEvent({ actor: 'engine', action: 'backlog.patch.summary', payload: { count: 50 } })).toBe(
      'patched 50 items',
    );
    expect(describeAuditEvent({ actor: 'engine', action: 'backlog.patch.summary', payload: { count: 1 } })).toBe(
      'patched 1 item',
    );
  });

  it('reuses status labels for item transitions', () => {
    expect(
      describeAuditEvent({ actor: '+prime', action: 'item_transition', payload: { from: 'to_do', to: 'in_progress' } }),
    ).toBe('moved To do → In progress');
  });

  it('names the agent and humanises the step for pipeline step events', () => {
    expect(
      describeAuditEvent({
        actor: 'orchestrator',
        action: 'pipeline.step.started',
        payload: { step_key: 'product-analysis.1', persona: '+compliance-expert' },
      }),
    ).toBe('compliance-expert started product-analysis step 1');
    expect(
      describeAuditEvent({
        actor: 'orchestrator',
        action: 'pipeline.step.succeeded',
        payload: { step_key: 'product-analysis.1', persona: '+compliance-expert' },
      }),
    ).toBe('compliance-expert finished product-analysis step 1');
  });

  it('still describes a step when the persona is missing', () => {
    expect(
      describeAuditEvent({ actor: 'x', action: 'pipeline.step.started', payload: { step_key: 'planning.3' } }),
    ).toBe('started planning step 3');
  });

  it('falls back to a humanised action for unknown events', () => {
    expect(describeAuditEvent({ actor: 'x', action: 'some.weird_action', payload: {} })).toBe('some weird action');
  });
});

describe('buildActivityFeed', () => {
  it('maps audit rows, attaching the backlog item id when the resource is one', () => {
    const feed = buildActivityFeed(
      [
        audit({ id: 1, action: 'item_transition', resource_type: 'backlog_item', resource_id: 'T-7', payload: { from: 'to_do', to: 'in_progress' }, created_at: 10 }),
        audit({ id: 2, action: 'pipeline.succeeded', resource_type: 'run', resource_id: '2', created_at: 20 }),
      ],
      [],
      [],
    );
    expect(feed.map((e) => e.id)).toEqual(['a-2', 'a-1']); // newest first
    const t = feed.find((e) => e.id === 'a-1')!;
    expect(t.kind).toBe('audit');
    expect(t.item).toBe('T-7');
    const run = feed.find((e) => e.id === 'a-2')!;
    expect(run.item).toBeNull(); // run resource → no board item link
  });

  it('merges audit, handovers and decisions into one reverse-chronological feed', () => {
    const feed = buildActivityFeed(
      [audit({ id: 1, created_at: 30 })],
      [{ id: 9, item_id: 'T-1', from_persona: '+dev', to_persona: '+qa', reason: null, context_payload: {}, markdown_path: null, created_at: 50 }],
      [{ id: 4, decision_id: 'D-2', title: 'pick db', status: 'accepted', markdown_path: 'x', item_id: null, tags: [], created_at: 0, decided_at: 40 }],
    );
    expect(feed.map((e) => e.kind)).toEqual(['handover', 'decision', 'audit']);
  });
});
