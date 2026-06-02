import { describe, it, expect } from 'vitest';
import {
  statusBadge,
  acChecklist,
  childrenOf,
  epicProgress,
  formatDate,
  descriptionFromBody,
  availableTransitions,
} from '../src/lib/board-drawer.ts';
import type { BacklogItem } from '../src/lib/api-types.ts';

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
  it('marks the first N criteria done (ac_done is a count, not per-item flags)', () => {
    expect(acChecklist(['a', 'b', 'c'], 2)).toEqual([
      { text: 'a', done: true },
      { text: 'b', done: true },
      { text: 'c', done: false },
    ]);
  });

  it('treats done <= 0 as nothing checked', () => {
    expect(acChecklist(['a', 'b'], 0)).toEqual([
      { text: 'a', done: false },
      { text: 'b', done: false },
    ]);
  });

  it('clamps done above the list length so everything is checked', () => {
    expect(acChecklist(['a', 'b'], 5)).toEqual([
      { text: 'a', done: true },
      { text: 'b', done: true },
    ]);
  });

  it('returns [] for empty criteria', () => {
    expect(acChecklist([], 3)).toEqual([]);
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
