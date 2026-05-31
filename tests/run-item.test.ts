import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { ItemLifecycle } from '../server/engine/item-lifecycle.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import { parseWorkflowMarkdown } from '../server/engine/workflow-parser.ts';
import { buildGraph } from '../server/engine/dag.ts';
import { RunRegistry } from '../server/engine/run-registry.ts';
import { runItem, runReadyItems } from '../server/orchestrator/run-item.ts';

let tmpRoot: string;
let agentsDir: string;
let db: Database.Database;
let repos: Repositories;

// The development-cycle workflow a ready item runs (implement → exit to `test`).
const devCycleWf = parseWorkflowMarkdown(
  `# Development Cycle
## Build
1. **+backend-developer:** implement the item
   - Outputs: impl.md
`,
  'development-cycle',
);

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-ri-'));
  agentsDir = join(tmpRoot, 'agents');
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, 'backend-developer.md'),
    '# backend-developer\n\n- description: builds.\n\n## identity\nbody\n',
  );
  const bundle = openDb({ path: join(tmpRoot, 'ri.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

function makeLifecycle() {
  return new ItemLifecycle({ repos, personas: loadPersonasFromDir(agentsDir) });
}

/** A per-item worktree acquirer that records its calls + releases (mocks git). */
function mockAcquirer() {
  const calls: string[] = [];
  const released: Array<{ itemId: string; success: boolean }> = [];
  const fn = async (itemId: string) => ({
    path: `/tmp/wt/${itemId}`,
    release: async ({ success }: { success: boolean }) => {
      released.push({ itemId, success });
    },
  });
  return { fn, calls: calls, released };
}

describe('runItem — per-item run + worktree keystone (capstone B1, §5.9 #10)', () => {
  it('a ready to_do item: run carries itemId in its own worktree, item → test', async () => {
    const lc = makeLifecycle();
    lc.create({ id: 'B1', type: 'task', title: 'B1' }); // to_do
    const acq = mockAcquirer();
    const result = await runItem('B1', {
      repos,
      lifecycle: lc,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      graph: buildGraph(devCycleWf),
      acquireWorktree: async (id) => {
        acq.calls.push(id);
        return acq.fn(id);
      },
      registry: new RunRegistry(),
    });

    expect(result.outcome).toBe('implemented');
    // FK closure: the run row actually carries item_id = 'B1'.
    expect(result.run.item_id).toBe('B1');
    // Worktree: acquired for the item, and the run executed inside it.
    expect(acq.calls).toEqual(['B1']);
    expect(result.run.worktree_path).toBe('/tmp/wt/B1');
    // Lifecycle: development-cycle exit → test.
    expect(repos.backlog.get('B1')?.status).toBe('test');
    // Worktree survives for closure (NOT released on success).
    expect(acq.released).toEqual([]);
    expect(result.worktree?.path).toBe('/tmp/wt/B1');
  });

  it('an in_progress item (resumed after a bounce) runs without re-starting', async () => {
    const lc = makeLifecycle();
    lc.create({ id: 'B5', type: 'task', title: 'B5' });
    lc.transition('B5', 'start', 'x'); // already in_progress
    const acq = mockAcquirer();
    const result = await runItem('B5', {
      repos,
      lifecycle: lc,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      graph: buildGraph(devCycleWf),
      acquireWorktree: async (id) => {
        acq.calls.push(id);
        return acq.fn(id);
      },
      registry: new RunRegistry(),
    });
    expect(result.outcome).toBe('implemented');
    expect(repos.backlog.get('B5')?.status).toBe('test');
  });

  it('a dev-cycle run failure leaves the item in_progress and quarantines the worktree', async () => {
    const lc = makeLifecycle();
    lc.create({ id: 'B2', type: 'task', title: 'B2' });
    const acq = mockAcquirer();
    const result = await runItem('B2', {
      repos,
      lifecycle: lc,
      executor: new MockExecutor(() => ({ fail: true })), // build fails
      graph: buildGraph(devCycleWf),
      acquireWorktree: async (id) => {
        acq.calls.push(id);
        return acq.fn(id);
      },
      registry: new RunRegistry(),
    });
    expect(result.outcome).toBe('failed');
    expect(result.run.status).toBe('failed');
    expect(repos.backlog.get('B2')?.status).toBe('in_progress'); // stays — never reached test
    expect(acq.released).toEqual([{ itemId: 'B2', success: false }]); // quarantined
    expect(result.worktree).toBeNull();
  });

  it('refuses a non-ready item (already in review) before acquiring a worktree', async () => {
    const lc = makeLifecycle();
    lc.create({ id: 'B3', type: 'task', title: 'B3' });
    lc.transition('B3', 'start', 'x');
    lc.transition('B3', 'test', 'x');
    lc.transition('B3', 'review', 'x'); // in review
    const acq = mockAcquirer();
    await expect(
      runItem('B3', {
        repos,
        lifecycle: lc,
        executor: new MockExecutor(() => ({ durationMs: 1 })),
        graph: buildGraph(devCycleWf),
        acquireWorktree: async (id) => {
          acq.calls.push(id);
          return acq.fn(id);
        },
        registry: new RunRegistry(),
      }),
    ).rejects.toThrow(/ready item/);
    expect(acq.calls).toEqual([]); // guard fires before any worktree
  });

  it('block cancels a live item-run mid-flight (registry passthrough)', async () => {
    const lc = makeLifecycle();
    lc.create({ id: 'B4', type: 'task', title: 'B4' });
    const acq = mockAcquirer();
    const registry = new RunRegistry();
    const runPromise = runItem('B4', {
      repos,
      lifecycle: lc,
      executor: new MockExecutor(() => ({ durationMs: 1000 })), // slow build
      graph: buildGraph(devCycleWf),
      acquireWorktree: async (id) => {
        acq.calls.push(id);
        return acq.fn(id);
      },
      registry,
    });

    await delay(30);
    const cancelled = registry.cancelForItem('B4');
    expect(cancelled).toHaveLength(1); // the live item-run was found + aborted

    const result = await runPromise;
    expect(result.outcome).toBe('failed'); // aborted mid-build
    expect(repos.backlog.get('B4')?.status).toBe('in_progress'); // stays
    expect(acq.released).toEqual([{ itemId: 'B4', success: false }]); // quarantined
  });
});

describe('runReadyItems — bounded-concurrency scheduler (capstone B1, §5.9 #10)', () => {
  it('runs every ready to_do item, each reaching test', async () => {
    const lc = makeLifecycle();
    ['RA', 'RB', 'RC'].forEach((id) => lc.create({ id, type: 'task', title: id }));
    const acq = mockAcquirer();
    const results = await runReadyItems({
      repos,
      lifecycle: lc,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      graph: buildGraph(devCycleWf),
      acquireWorktree: async (id) => {
        acq.calls.push(id);
        return acq.fn(id);
      },
      registry: new RunRegistry(),
    });
    expect(results).toHaveLength(3);
    expect(acq.calls.sort()).toEqual(['RA', 'RB', 'RC']);
    expect(['RA', 'RB', 'RC'].every((id) => repos.backlog.get(id)?.status === 'test')).toBe(true);
  });

  it('never runs more than maxConcurrent builds at once', async () => {
    const lc = makeLifecycle();
    ['P1', 'P2', 'P3', 'P4', 'P5'].forEach((id) => lc.create({ id, type: 'task', title: id }));
    const acq = mockAcquirer();
    const executor = new MockExecutor(() => ({ durationMs: 30 })); // overlap window
    await runReadyItems({
      repos,
      lifecycle: lc,
      executor,
      graph: buildGraph(devCycleWf),
      acquireWorktree: async (id) => {
        acq.calls.push(id);
        return acq.fn(id);
      },
      registry: new RunRegistry(),
      maxConcurrent: 2,
    });
    expect(executor.maxConcurrent).toBeLessThanOrEqual(2); // the cap held
    expect(repos.backlog.list({ status: 'test', limit: 100 })).toHaveLength(5); // all still ran
  });

  it('ignores items that are not to_do (in_progress/test left untouched)', async () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T1', type: 'task', title: 'T1' }); // to_do
    lc.create({ id: 'IP', type: 'task', title: 'IP' });
    lc.transition('IP', 'start', 'x'); // in_progress
    lc.create({ id: 'TS', type: 'task', title: 'TS' });
    lc.transition('TS', 'start', 'x');
    lc.transition('TS', 'test', 'x'); // test
    const acq = mockAcquirer();
    const results = await runReadyItems({
      repos,
      lifecycle: lc,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      graph: buildGraph(devCycleWf),
      acquireWorktree: async (id) => {
        acq.calls.push(id);
        return acq.fn(id);
      },
      registry: new RunRegistry(),
    });
    expect(results).toHaveLength(1);
    expect(acq.calls).toEqual(['T1']); // only the to_do item
    expect(repos.backlog.get('IP')?.status).toBe('in_progress'); // untouched
    expect(repos.backlog.get('TS')?.status).toBe('test'); // untouched
  });
});
