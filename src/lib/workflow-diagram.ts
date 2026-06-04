import type { WorkflowDetail, WorkflowStepDetail, WorkflowGate } from './api-types.ts';

/**
 * Group a workflow's flat step list into phases for the "Visual flow" diagram.
 *
 * Phases appear in the order their first step does. Each gate is attached to
 * the phase it lives under; a gate whose phase has no steps (rare) becomes its
 * own trailing group so it's never silently dropped.
 */
export type DiagramPhase = {
  phase: string;
  steps: WorkflowStepDetail[];
  gates: WorkflowGate[];
};

export function groupWorkflowByPhase(wf: WorkflowDetail): DiagramPhase[] {
  const order: string[] = [];
  const byPhase = new Map<string, DiagramPhase>();

  const ensure = (phase: string): DiagramPhase => {
    let group = byPhase.get(phase);
    if (!group) {
      group = { phase, steps: [], gates: [] };
      byPhase.set(phase, group);
      order.push(phase);
    }
    return group;
  };

  for (const step of [...wf.steps].sort((a, b) => a.index - b.index)) {
    ensure(step.phase).steps.push(step);
  }
  for (const gate of wf.gates) {
    ensure(gate.phase).gates.push(gate);
  }

  return order.map((phase) => byPhase.get(phase)!);
}
