import { describe, expect, it } from 'vitest';
import { groupWorkflowByPhase } from '../src/lib/workflow-diagram.ts';
import type { WorkflowDetail, WorkflowStepDetail, WorkflowGate } from '../src/lib/api-types.ts';

function step(partial: Partial<WorkflowStepDetail> & { index: number; phase: string }): WorkflowStepDetail {
  return {
    key: `${partial.phase}.${partial.index}`,
    persona: null,
    description: '',
    inputs: [],
    outputs: [],
    approver: null,
    reviewer: null,
    ...partial,
  };
}

function wf(steps: WorkflowStepDetail[], gates: WorkflowGate[] = []): WorkflowDetail {
  return { id: 'w', title: 'W', startCommand: null, nextWorkflowId: null, steps, gates };
}

describe('groupWorkflowByPhase', () => {
  it('returns [] for an empty workflow', () => {
    expect(groupWorkflowByPhase(wf([]))).toEqual([]);
  });

  it('groups steps by phase, in first-appearance order, steps sorted by index', () => {
    const result = groupWorkflowByPhase(
      wf([
        step({ index: 2, phase: 'Plan' }),
        step({ index: 0, phase: 'Analyze' }),
        step({ index: 1, phase: 'Analyze' }),
        step({ index: 3, phase: 'Plan' }),
      ]),
    );
    expect(result.map((p) => p.phase)).toEqual(['Analyze', 'Plan']);
    expect(result[0]!.steps.map((s) => s.index)).toEqual([0, 1]);
    expect(result[1]!.steps.map((s) => s.index)).toEqual([2, 3]);
  });

  it('attaches gates to their phase', () => {
    const result = groupWorkflowByPhase(
      wf(
        [step({ index: 0, phase: 'Build' })],
        [{ phase: 'Build', afterStepIndex: 0, body: 'review', approver: '+prime' }],
      ),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.gates).toHaveLength(1);
    expect(result[0]!.gates[0]!.approver).toBe('+prime');
  });

  it('keeps an orphan-phase gate as its own trailing group', () => {
    const result = groupWorkflowByPhase(
      wf(
        [step({ index: 0, phase: 'Build' })],
        [{ phase: 'Sign-off', afterStepIndex: 0, body: 'final', approver: '+prime' }],
      ),
    );
    expect(result.map((p) => p.phase)).toEqual(['Build', 'Sign-off']);
    expect(result[1]!.steps).toHaveLength(0);
    expect(result[1]!.gates).toHaveLength(1);
  });
});
