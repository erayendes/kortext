import { describe, it, expect } from 'vitest';
import {
  stepProgress,
  currentStepPersona,
  resolveActiveRun,
} from '../src/lib/active-run.ts';
import type { Run, RunStep, BacklogItem } from '../src/lib/api-types.ts';

function step(partial: Partial<RunStep> & Pick<RunStep, 'step_index' | 'status'>): RunStep {
  return {
    id: partial.step_index,
    run_id: 1,
    step_name: `step-${partial.step_index}`,
    persona: null,
    started_at: null,
    ended_at: null,
    log_path: null,
    output_summary: null,
    error_message: null,
    ...partial,
  };
}

function run(partial: Partial<Run> = {}): Run {
  return {
    id: 1,
    workflow_id: 'development-cycle',
    item_id: 'T04',
    status: 'running',
    worktree_path: null,
    triggered_by: 'cli',
    error_message: null,
    started_at: null,
    ended_at: null,
    created_at: 0,
    ...partial,
  };
}

function item(partial: Partial<BacklogItem> & Pick<BacklogItem, 'id'>): BacklogItem {
  return {
    type: 'task',
    title: `title-${partial.id}`,
    status: 'in_progress',
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

describe('stepProgress', () => {
  it('returns null when there are no steps', () => {
    expect(stepProgress([])).toBeNull();
  });

  it('counts the running step as the current one (3 done + 1 running of 7 → 4/7)', () => {
    const steps: RunStep[] = [
      step({ step_index: 0, status: 'succeeded' }),
      step({ step_index: 1, status: 'succeeded' }),
      step({ step_index: 2, status: 'succeeded' }),
      step({ step_index: 3, status: 'running' }),
      step({ step_index: 4, status: 'pending' }),
      step({ step_index: 5, status: 'pending' }),
      step({ step_index: 6, status: 'pending' }),
    ];
    expect(stepProgress(steps)).toEqual({ current: 4, total: 7 });
  });

  it('reports 0 of N while everything is still pending (queued run)', () => {
    const steps: RunStep[] = [
      step({ step_index: 0, status: 'pending' }),
      step({ step_index: 1, status: 'pending' }),
      step({ step_index: 2, status: 'pending' }),
    ];
    expect(stepProgress(steps)).toEqual({ current: 0, total: 3 });
  });

  it('reports N of N when all steps are terminal (succeeded/skipped)', () => {
    const steps: RunStep[] = [
      step({ step_index: 0, status: 'succeeded' }),
      step({ step_index: 1, status: 'skipped' }),
      step({ step_index: 2, status: 'succeeded' }),
    ];
    expect(stepProgress(steps)).toEqual({ current: 3, total: 3 });
  });
});

describe('currentStepPersona', () => {
  it('returns the persona of the running step', () => {
    const steps: RunStep[] = [
      step({ step_index: 0, status: 'succeeded', persona: '+operation-manager' }),
      step({ step_index: 1, status: 'running', persona: '+backend-developer' }),
    ];
    expect(currentStepPersona(steps)).toBe('+backend-developer');
  });

  it('falls back to the last succeeded step when nothing is running', () => {
    const steps: RunStep[] = [
      step({ step_index: 0, status: 'succeeded', persona: '+designer' }),
      step({ step_index: 1, status: 'succeeded', persona: '+qa-engineer' }),
      step({ step_index: 2, status: 'pending', persona: '+devops-engineer' }),
    ];
    expect(currentStepPersona(steps)).toBe('+qa-engineer');
  });

  it('returns null when no step has started', () => {
    expect(currentStepPersona([step({ step_index: 0, status: 'pending', persona: '+x' })])).toBeNull();
    expect(currentStepPersona([])).toBeNull();
  });
});

describe('resolveActiveRun', () => {
  const items: BacklogItem[] = [
    item({ id: 'T04', title: 'Search contacts', owner: '+backend-developer' }),
  ];

  it('prefers the running step persona over the backlog owner, and uses the backlog title', () => {
    const steps: RunStep[] = [
      step({ step_index: 0, status: 'succeeded', persona: '+operation-manager' }),
      step({ step_index: 1, status: 'running', persona: '+qa-engineer' }),
    ];
    expect(resolveActiveRun(run({ item_id: 'T04' }), steps, items)).toEqual({
      persona: '+qa-engineer',
      taskTitle: 'Search contacts',
      step: { current: 2, total: 2 },
    });
  });

  it('falls back to the backlog owner when there are no steps yet (queued run)', () => {
    expect(resolveActiveRun(run({ item_id: 'T04', status: 'queued' }), [], items)).toEqual({
      persona: '+backend-developer',
      taskTitle: 'Search contacts',
      step: null,
    });
  });

  it('returns null persona/title when the item is unknown', () => {
    expect(resolveActiveRun(run({ item_id: 'NOPE' }), [], items)).toEqual({
      persona: null,
      taskTitle: null,
      step: null,
    });
  });
});
