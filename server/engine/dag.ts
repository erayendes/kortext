import type { WorkflowDefinition, WorkflowStep } from './workflow-parser.ts';

/**
 * Build a dependency DAG from a parsed workflow.
 *
 * Dependency derivation:
 *   - A step S that lists path P in its `inputs` depends on the step(s) that
 *     list path P in their `outputs`.
 *   - If a path appears in inputs but no step produces it, it is treated as a
 *     workflow-level input (no in-graph dep) — typical for blueprint.md and
 *     other human-authored references.
 *   - Multiple producers for the same path are allowed; S depends on all of
 *     them. (Some workflows have a step that consolidates several outputs.)
 *
 * Cycle detection:
 *   - We compute a Kahn-style queue. If at the end some nodes still have
 *     unsatisfied deps, those form a cycle and we throw.
 *
 * Externally we expose:
 *   - StepNode: step + computed depKeys
 *   - graph.readyKeys(done): for the runner, which nodes can start next
 *   - graph.externalInputs: file paths needed before the workflow can start
 */

export type StepNode = {
  step: WorkflowStep;
  /** keys of steps this node depends on. */
  depKeys: string[];
};

export type WorkflowGraph = {
  workflowId: string;
  nodes: Map<string, StepNode>;
  /** Files referenced as inputs that no step produces — must exist before run. */
  externalInputs: string[];
  /**
   * Given a set of completed step keys, returns the keys of steps whose deps
   * are all satisfied and which are themselves not yet completed.
   */
  readyKeys(done: ReadonlySet<string>): string[];
  /** Total step count, convenience for runners. */
  size: number;
};

export class WorkflowCycleError extends Error {
  constructor(public readonly remaining: string[]) {
    super(`workflow has a cycle; unresolvable steps: ${remaining.join(', ')}`);
    this.name = 'WorkflowCycleError';
  }
}

export function buildGraph(workflow: WorkflowDefinition): WorkflowGraph {
  const producers = new Map<string, string[]>(); // path -> step keys
  for (const step of workflow.steps) {
    for (const out of step.outputs) {
      const list = producers.get(out) ?? [];
      list.push(step.key);
      producers.set(out, list);
    }
  }

  const nodes = new Map<string, StepNode>();
  const externalInputsSet = new Set<string>();

  for (const step of workflow.steps) {
    const depSet = new Set<string>();
    for (const input of step.inputs) {
      const owners = producers.get(input);
      if (!owners || owners.length === 0) {
        externalInputsSet.add(input);
        continue;
      }
      for (const owner of owners) {
        if (owner !== step.key) depSet.add(owner);
      }
    }
    nodes.set(step.key, { step, depKeys: [...depSet] });
  }

  // Cycle detection via Kahn topological count.
  const inDegree = new Map<string, number>();
  for (const node of nodes.values()) inDegree.set(node.step.key, node.depKeys.length);

  const queue: string[] = [];
  for (const [key, deg] of inDegree) if (deg === 0) queue.push(key);

  const dependents = new Map<string, string[]>();
  for (const node of nodes.values()) {
    for (const dep of node.depKeys) {
      const list = dependents.get(dep) ?? [];
      list.push(node.step.key);
      dependents.set(dep, list);
    }
  }

  let resolved = 0;
  while (queue.length > 0) {
    const key = queue.shift()!;
    resolved += 1;
    for (const child of dependents.get(key) ?? []) {
      const next = (inDegree.get(child) ?? 0) - 1;
      inDegree.set(child, next);
      if (next === 0) queue.push(child);
    }
  }

  if (resolved !== nodes.size) {
    const remaining: string[] = [];
    for (const [k, v] of inDegree) if (v > 0) remaining.push(k);
    throw new WorkflowCycleError(remaining);
  }

  return {
    workflowId: workflow.id,
    nodes,
    externalInputs: [...externalInputsSet],
    size: nodes.size,
    readyKeys(done) {
      const ready: string[] = [];
      for (const node of nodes.values()) {
        if (done.has(node.step.key)) continue;
        if (node.depKeys.every((k) => done.has(k))) ready.push(node.step.key);
      }
      return ready;
    },
  };
}
