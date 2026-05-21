import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import {
  parseWorkflowMarkdown,
  loadWorkflowFromFile,
  type WorkflowDefinition,
} from '../server/engine/workflow-parser.ts';
import { buildGraph, WorkflowCycleError } from '../server/engine/dag.ts';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import { runWorkflow } from '../server/engine/worker-pool.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-engine-'));
  const bundle = openDb({ path: join(tmpRoot, 'engine.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('workflow-parser', () => {
  it('parses the real 01a-analysis-pipeline.md', () => {
    const wf = loadWorkflowFromFile(
      resolve(process.cwd(), 'workflows/01a-analysis-pipeline.md'),
    );
    expect(wf.id).toBe('01a-analysis-pipeline');
    expect(wf.title.toLowerCase()).toContain('analysis');
    expect(wf.startCommand).toBe('analysis');

    // ≥ 8 numbered steps across phases.
    expect(wf.steps.length).toBeGreaterThanOrEqual(8);

    // Specific anchor: +product-manager step in Product Analysis has 3 inputs and 1 output.
    const pm = wf.steps.find((s) => s.persona === '+product-manager');
    expect(pm).toBeDefined();
    expect(pm?.outputs).toContain('../workspace/reports/product-requirements.md');
    expect(pm?.inputs).toContain('../workspace/references/blueprint.md');
    expect(pm?.approver).toBe('+prime');

    // Gates: at least one approval gate detected (RAPOR HAZIR notes).
    expect(wf.gates.length).toBeGreaterThanOrEqual(1);
    expect(wf.gates[0]?.approver).toBe('+prime');
  });
});

describe('dag', () => {
  it('derives dependencies via inputs/outputs', () => {
    const wf = parseWorkflowMarkdown(
      `# Test (\`!start test\`)
## A
1. **+a:** make foo
   - Inputs: blueprint.md
   - Outputs: foo.md
2. **+b:** make bar
   - Inputs: foo.md
   - Outputs: bar.md
3. **+c:** consume both
   - Inputs: foo.md, bar.md
   - Outputs: out.md
`,
      'test',
    );
    const graph = buildGraph(wf);
    expect(graph.size).toBe(3);
    expect(graph.externalInputs).toEqual(['blueprint.md']);
    const cNode = [...graph.nodes.values()].find((n) => n.step.persona === '+c');
    expect(cNode?.depKeys).toHaveLength(2);
  });

  it('readyKeys honours dependency satisfaction', () => {
    const wf = parseWorkflowMarkdown(
      `# T
## P
1. **+a:** make foo
   - Outputs: foo.md
2. **+b:** consume foo
   - Inputs: foo.md
   - Outputs: bar.md
`,
      't',
    );
    const graph = buildGraph(wf);
    const aKey = [...graph.nodes.keys()][0]!;
    const bKey = [...graph.nodes.keys()][1]!;
    expect(graph.readyKeys(new Set())).toContain(aKey);
    expect(graph.readyKeys(new Set())).not.toContain(bKey);
    expect(graph.readyKeys(new Set([aKey]))).toContain(bKey);
  });

  it('detects cycles', () => {
    const wf = parseWorkflowMarkdown(
      `# T
## P
1. **+a:** loop
   - Inputs: b.md
   - Outputs: a.md
2. **+b:** loop
   - Inputs: a.md
   - Outputs: b.md
`,
      't',
    );
    expect(() => buildGraph(wf)).toThrow(WorkflowCycleError);
  });
});

describe('worker-pool', () => {
  function makeWorkflow(): WorkflowDefinition {
    // A — produces a.md
    // B1, B2, B3 — each depends on a.md; all parallel-ready after A
    // C — depends on b1.md b2.md b3.md
    return parseWorkflowMarkdown(
      `# T
## P
1. **+a:** root
   - Outputs: a.md
2. **+b1:** branch1
   - Inputs: a.md
   - Outputs: b1.md
3. **+b2:** branch2
   - Inputs: a.md
   - Outputs: b2.md
4. **+b3:** branch3
   - Inputs: a.md
   - Outputs: b3.md
5. **+c:** join
   - Inputs: b1.md, b2.md, b3.md
   - Outputs: c.md
`,
      't',
    );
  }

  it('runs to completion with concurrency=3 and respects ordering', async () => {
    const wf = makeWorkflow();
    const graph = buildGraph(wf);
    const mock = new MockExecutor((step) => ({ durationMs: step.persona?.startsWith('+b') ? 40 : 10 }));

    const { run, failedStepKey } = await runWorkflow(graph, mock, repos, { concurrency: 3 });

    expect(failedStepKey).toBeNull();
    expect(run.status).toBe('succeeded');
    expect(mock.maxConcurrent).toBeGreaterThanOrEqual(2);
    expect(mock.maxConcurrent).toBeLessThanOrEqual(3);

    // A is first, C is last.
    expect(mock.startedOrder[0]).toMatch(/\.1$/);
    expect(mock.endedOrder[mock.endedOrder.length - 1]).toMatch(/\.5$/);

    const steps = repos.runs.listSteps(run.id);
    expect(steps).toHaveLength(5);
    expect(steps.every((s) => s.status === 'succeeded')).toBe(true);
  });

  it('aborts in-flight + skips remaining on failure', async () => {
    const wf = makeWorkflow();
    const graph = buildGraph(wf);
    const mock = new MockExecutor((step) => ({
      durationMs: 20,
      fail: step.persona === '+b2',
    }));

    const { run, failedStepKey } = await runWorkflow(graph, mock, repos, { concurrency: 3 });

    expect(failedStepKey).toMatch(/\.3$/);
    expect(run.status).toBe('failed');
    expect(run.error_message).toBeTruthy();

    const steps = repos.runs.listSteps(run.id);
    const statuses = steps.map((s) => s.status);
    // A succeeded, b2 failed, c skipped (depends on b1/b2/b3 — at least b2 failed so it stays pending → skipped)
    expect(statuses).toContain('succeeded');
    expect(statuses).toContain('failed');
    expect(statuses).toContain('skipped');
  });

  it('records audit log entries for the lifecycle', async () => {
    const wf = parseWorkflowMarkdown(
      `# T
## P
1. **+only:** solo
   - Outputs: x.md
`,
      'solo',
    );
    const graph = buildGraph(wf);
    const mock = new MockExecutor(() => ({ durationMs: 5 }));
    const { run } = await runWorkflow(graph, mock, repos, { concurrency: 1, triggeredBy: 'test' });

    const entries = repos.auditLog.list({ resource_id: String(run.id) });
    const actions = entries.map((e) => e.action);
    expect(actions).toContain('pipeline.started');
    expect(actions).toContain('pipeline.succeeded');
  });
});
