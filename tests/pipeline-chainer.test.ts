import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import {
  parseWorkflowMarkdown,
  type WorkflowDefinition,
} from '../server/engine/workflow-parser.ts';
import { buildGraph } from '../server/engine/dag.ts';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import { runWorkflow } from '../server/engine/worker-pool.ts';
import { chainNextWorkflow } from '../server/orchestrator/pipeline-chainer.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

const wfA = parseWorkflowMarkdown(
  `# A (\`!start a\`)
- **Sonraki akış:** \`b-flow.md\`

## P
1. **+a:** root
   - Outputs: a.md
`,
  'a-flow',
);

const wfB = parseWorkflowMarkdown(
  `# B (\`!start b\`)

## P
1. **+b:** root
   - Outputs: b.md
`,
  'b-flow',
);

const wfNoNext = parseWorkflowMarkdown(
  `# Solo
## P
1. **+x:** root
   - Outputs: x.md
`,
  'solo',
);

function loader(map: Record<string, WorkflowDefinition>) {
  return (id: string) => map[id] ?? null;
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-chainer-'));
  const bundle = openDb({ path: join(tmpRoot, 'chainer.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

async function runOnce(def: WorkflowDefinition) {
  const graph = buildGraph(def);
  const mock = new MockExecutor(() => ({ durationMs: 1 }));
  return runWorkflow(graph, mock, repos, { concurrency: 1 });
}

describe('chainNextWorkflow', () => {
  it('skips when completed definition has no nextWorkflowId', async () => {
    const { run } = await runOnce(wfNoNext);
    const result = await chainNextWorkflow(run, wfNoNext, {
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadWorkflowById: loader({}),
    });
    expect(result.chained).toBe(false);
    if (result.chained === false) {
      expect(result.reason).toBe('no-next-workflow');
    }
  });

  it('skips when completed run did not succeed', async () => {
    // Simulate a failed run by directly creating it.
    const run = repos.runs.createRun({
      workflow_id: 'a-flow',
      item_id: null,
      status: 'failed',
      worktree_path: null,
      triggered_by: 'test',
    });
    const result = await chainNextWorkflow(run, wfA, {
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadWorkflowById: loader({ 'b-flow': wfB }),
    });
    expect(result.chained).toBe(false);
    if (result.chained === false) {
      expect(result.reason).toBe('previous-not-succeeded');
    }
  });

  it('skips when next workflow id cannot be loaded', async () => {
    const { run } = await runOnce(wfA);
    const result = await chainNextWorkflow(run, wfA, {
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadWorkflowById: loader({}),
    });
    expect(result.chained).toBe(false);
    if (result.chained === false) {
      expect(result.reason).toBe('next-workflow-not-found');
    }
  });

  it('chains successfully and records audit log', async () => {
    const { run } = await runOnce(wfA);
    const result = await chainNextWorkflow(run, wfA, {
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadWorkflowById: loader({ 'b-flow': wfB }),
    });
    expect(result.chained).toBe(true);
    if (result.chained) {
      expect(result.run.workflow_id).toBe('b-flow');
      expect(result.run.status).toBe('succeeded');
      expect(result.run.triggered_by).toBe(`chain:${wfA.id}`);
    }

    // Audit log: pipeline.chained on the previous run.
    const entries = repos.auditLog.list({ resource_id: String(run.id) });
    const chainedEntry = entries.find((e) => e.action === 'pipeline.chained');
    expect(chainedEntry).toBeDefined();
    expect(chainedEntry?.payload).toMatchObject({
      from_workflow: 'a-flow',
      to_workflow: 'b-flow',
    });
  });

  it('records pipeline.chain-skipped audit when next is not loadable', async () => {
    const { run } = await runOnce(wfA);
    await chainNextWorkflow(run, wfA, {
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadWorkflowById: loader({}),
    });
    const entries = repos.auditLog.list({ resource_id: String(run.id) });
    const skipped = entries.find((e) => e.action === 'pipeline.chain-skipped');
    expect(skipped).toBeDefined();
    expect(skipped?.payload).toMatchObject({ reason: 'next-workflow-not-found' });
  });

  it('passes itemId from previous run through the chain', async () => {
    // First create a run with an item_id, then complete it.
    const seedItem = repos.backlog.create({
      id: 'item-001',
      title: 'test item',
      type: 'task',
      status: 'in_progress',
      owner: '+a',
      parent_id: null,
      version: null,
      frontmatter: {},
      body_md: '',
    });
    const graph = buildGraph(wfA);
    const mock = new MockExecutor(() => ({ durationMs: 1 }));
    const { run } = await runWorkflow(graph, mock, repos, {
      concurrency: 1,
      itemId: seedItem.id,
    });

    const result = await chainNextWorkflow(run, wfA, {
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadWorkflowById: loader({ 'b-flow': wfB }),
    });
    expect(result.chained).toBe(true);
    if (result.chained) {
      expect(result.run.item_id).toBe(seedItem.id);
    }
  });
});
