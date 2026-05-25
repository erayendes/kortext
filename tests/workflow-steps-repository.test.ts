import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';

/**
 * `workflow_steps` table — projection of `workflows/*.md`. Tests pin
 * the compound (workflow_id, step_no) uniqueness, the JSON column
 * round-trip, the FK constraint against `personas.handle`, and the
 * cross-cut aggregators (`usageCounts`, `dependencies`).
 */

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-wf-steps-repo-'));
  const bundle = openDb({ path: join(tmpRoot, 'test.db') });
  db = bundle.db;
  repos = bundle.repositories;
  // Seed personas referenced by the test steps.
  repos.personas.upsert({
    handle: '+backend-developer',
    source_path: 'agents/backend-developer.md',
  });
  repos.personas.upsert({
    handle: '+qa-engineer',
    source_path: 'agents/qa-engineer.md',
  });
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('WorkflowStepsRepository', () => {
  it('upserts a step and round-trips JSON columns', () => {
    const step = repos.workflowSteps.upsert({
      workflow_id: '04-development-cycle',
      step_no: 0,
      step_name: 'implementation.1',
      persona_handle: '+backend-developer',
      inputs: ['workspace/blueprint.md'],
      outputs: ['dist/api.js'],
      gate_kind: null,
      parallel_with: [],
      source_path: 'workflows/04-development-cycle.md',
    });
    expect(step.id).toBeGreaterThan(0);
    expect(step.workflow_id).toBe('04-development-cycle');
    expect(step.step_no).toBe(0);
    expect(step.step_name).toBe('implementation.1');
    expect(step.persona_handle).toBe('+backend-developer');
    expect(step.inputs).toEqual(['workspace/blueprint.md']);
    expect(step.outputs).toEqual(['dist/api.js']);
    expect(step.parallel_with).toEqual([]);
  });

  it('upsert is idempotent on (workflow_id, step_no)', () => {
    repos.workflowSteps.upsert({
      workflow_id: 'wf-a',
      step_no: 0,
      persona_handle: '+backend-developer',
      source_path: 'workflows/wf-a.md',
    });
    repos.workflowSteps.upsert({
      workflow_id: 'wf-a',
      step_no: 0,
      persona_handle: '+qa-engineer',
      source_path: 'workflows/wf-a.md',
    });
    const rows = repos.workflowSteps.list('wf-a');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.persona_handle).toBe('+qa-engineer');
  });

  it('rejects steps that reference an unknown persona (FK)', () => {
    expect(() =>
      repos.workflowSteps.upsert({
        workflow_id: 'wf-bad',
        step_no: 0,
        persona_handle: '+ghost',
        source_path: 'workflows/wf-bad.md',
      }),
    ).toThrow(/FOREIGN KEY|constraint/i);
  });

  it('list() returns rows ordered by step_no', () => {
    repos.workflowSteps.upsert({
      workflow_id: 'wf-x',
      step_no: 2,
      persona_handle: '+backend-developer',
      source_path: 'workflows/wf-x.md',
    });
    repos.workflowSteps.upsert({
      workflow_id: 'wf-x',
      step_no: 0,
      persona_handle: '+backend-developer',
      source_path: 'workflows/wf-x.md',
    });
    repos.workflowSteps.upsert({
      workflow_id: 'wf-x',
      step_no: 1,
      persona_handle: '+qa-engineer',
      source_path: 'workflows/wf-x.md',
    });
    const stepNos = repos.workflowSteps.list('wf-x').map((s) => s.step_no);
    expect(stepNos).toEqual([0, 1, 2]);
  });

  it('listByPersona() filters across workflows', () => {
    repos.workflowSteps.upsert({
      workflow_id: 'wf-1',
      step_no: 0,
      persona_handle: '+backend-developer',
      source_path: 'workflows/wf-1.md',
    });
    repos.workflowSteps.upsert({
      workflow_id: 'wf-2',
      step_no: 0,
      persona_handle: '+backend-developer',
      source_path: 'workflows/wf-2.md',
    });
    repos.workflowSteps.upsert({
      workflow_id: 'wf-2',
      step_no: 1,
      persona_handle: '+qa-engineer',
      source_path: 'workflows/wf-2.md',
    });
    const backend = repos.workflowSteps.listByPersona('+backend-developer');
    expect(backend).toHaveLength(2);
    const qa = repos.workflowSteps.listByPersona('+qa-engineer');
    expect(qa).toHaveLength(1);
  });

  it('usageCounts() aggregates by persona handle', () => {
    repos.workflowSteps.upsert({
      workflow_id: 'wf-a',
      step_no: 0,
      persona_handle: '+backend-developer',
      source_path: 'workflows/wf-a.md',
    });
    repos.workflowSteps.upsert({
      workflow_id: 'wf-a',
      step_no: 1,
      persona_handle: '+backend-developer',
      source_path: 'workflows/wf-a.md',
    });
    repos.workflowSteps.upsert({
      workflow_id: 'wf-b',
      step_no: 0,
      persona_handle: '+qa-engineer',
      source_path: 'workflows/wf-b.md',
    });
    const counts = repos.workflowSteps.usageCounts();
    expect(counts).toEqual([
      { persona_handle: '+backend-developer', step_count: 2 },
      { persona_handle: '+qa-engineer', step_count: 1 },
    ]);
  });

  it('dependencies() unions inputs/outputs across a workflow', () => {
    repos.workflowSteps.upsert({
      workflow_id: 'wf-dep',
      step_no: 0,
      persona_handle: '+backend-developer',
      inputs: ['a.md', 'b.md'],
      outputs: ['x.md'],
      source_path: 'workflows/wf-dep.md',
    });
    repos.workflowSteps.upsert({
      workflow_id: 'wf-dep',
      step_no: 1,
      persona_handle: '+qa-engineer',
      inputs: ['b.md', 'c.md'],
      outputs: ['y.md'],
      source_path: 'workflows/wf-dep.md',
    });
    const deps = repos.workflowSteps.dependencies('wf-dep');
    expect(deps.inputs).toEqual(['a.md', 'b.md', 'c.md']);
    expect(deps.outputs).toEqual(['x.md', 'y.md']);
  });

  it('deleteByWorkflow() removes only that workflow', () => {
    repos.workflowSteps.upsert({
      workflow_id: 'keep',
      step_no: 0,
      persona_handle: '+backend-developer',
      source_path: 'workflows/keep.md',
    });
    repos.workflowSteps.upsert({
      workflow_id: 'drop',
      step_no: 0,
      persona_handle: '+backend-developer',
      source_path: 'workflows/drop.md',
    });
    repos.workflowSteps.deleteByWorkflow('drop');
    expect(repos.workflowSteps.list('keep')).toHaveLength(1);
    expect(repos.workflowSteps.list('drop')).toHaveLength(0);
  });

  it('deleteAll() wipes the table', () => {
    repos.workflowSteps.upsert({
      workflow_id: 'wf',
      step_no: 0,
      persona_handle: '+backend-developer',
      source_path: 'workflows/wf.md',
    });
    repos.workflowSteps.deleteAll();
    expect(repos.workflowSteps.list('wf')).toEqual([]);
  });
});
