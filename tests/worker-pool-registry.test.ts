import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { parseWorkflowMarkdown } from '../server/engine/workflow-parser.ts';
import { buildGraph } from '../server/engine/dag.ts';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import { runWorkflow } from '../server/engine/worker-pool.ts';
import { RunRegistry } from '../server/engine/run-registry.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

const oneStepWf = parseWorkflowMarkdown(
  `# One Step
## P
1. **+a:** only step
   - Outputs: a.md
`,
  'one-step',
);

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-wpreg-'));
  const bundle = openDb({ path: join(tmpRoot, 'wpreg.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('runWorkflow — RunRegistry wiring (capstone W1, §5.9 #9/#10)', () => {
  it('register: a live item-run is cancellable mid-flight and ends failed', async () => {
    // FK: runs.item_id → backlog_items(id). Seed the item before the run.
    repos.backlog.create({ id: 'ITEM-1', type: 'task', title: 'ITEM-1' });
    const registry = new RunRegistry();
    const graph = buildGraph(oneStepWf);
    const executor = new MockExecutor(() => ({ durationMs: 1000 })); // slow

    // Start without awaiting — the run registers + the step goes in-flight.
    const runPromise = runWorkflow(graph, executor, repos, {
      concurrency: 1,
      itemId: 'ITEM-1',
      registry,
    });

    // Stay well inside the 1000ms step, then cancel by item (block's mechanism).
    await delay(30);
    const cancelled = registry.cancelForItem('ITEM-1');
    expect(cancelled).toHaveLength(1); // the live run was found in the registry

    const result = await runPromise;
    expect(result.run.status).toBe('failed'); // aborted mid-step → failed
  });

  it('unregister: a run that finishes on its own leaves the registry empty', async () => {
    repos.backlog.create({ id: 'ITEM-2', type: 'task', title: 'ITEM-2' });
    const registry = new RunRegistry();
    const graph = buildGraph(oneStepWf);
    const executor = new MockExecutor(() => ({ durationMs: 1 })); // fast

    const result = await runWorkflow(graph, executor, repos, {
      concurrency: 1,
      itemId: 'ITEM-2',
      registry,
    });
    expect(result.run.status).toBe('succeeded');

    // The finished run must have unregistered itself — no stale cancellable entry.
    expect(registry.cancelForItem('ITEM-2')).toEqual([]);
  });

  it('no registry option → unchanged behavior (regression-free)', async () => {
    repos.backlog.create({ id: 'ITEM-3', type: 'task', title: 'ITEM-3' });
    const graph = buildGraph(oneStepWf);
    const result = await runWorkflow(graph, new MockExecutor(() => ({ durationMs: 1 })), repos, {
      concurrency: 1,
      itemId: 'ITEM-3',
    });
    expect(result.run.status).toBe('succeeded');
  });
});
