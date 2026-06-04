import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
import { WorktreeManager } from '../server/engine/worktree.ts';
import { ResolutionRegistry } from '../server/orchestrator/resolution-registry.ts';

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

  it('idempotent dev-cycle exit: item concurrently advanced to test during build does not throw', async () => {
    const lc = makeLifecycle();
    lc.create({ id: 'IDEM', type: 'task', title: 'IDEM' }); // to_do
    const acq = mockAcquirer();
    // Simulate a concurrent advance: the build succeeds, but by the time the
    // dev-cycle exit fires the item is already in `test` (e.g. an overlapping
    // drive pass / scheduler retry). The exit must be idempotent — never throw
    // IllegalTransitionError('test' from 'test').
    const executor = new MockExecutor(() => {
      if (repos.backlog.get('IDEM')?.status === 'in_progress') {
        repos.backlog.transitionStatus('IDEM', 'test');
      }
      return { durationMs: 1 };
    });
    const result = await runItem('IDEM', {
      repos,
      lifecycle: lc,
      executor,
      graph: buildGraph(devCycleWf),
      acquireWorktree: async (id) => {
        acq.calls.push(id);
        return acq.fn(id);
      },
      registry: new RunRegistry(),
    });
    expect(result.outcome).toBe('implemented');
    expect(repos.backlog.get('IDEM')?.status).toBe('test');
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

describe('runItem — real worktree + resolution ledger wiring (capstone composition, §5.14 step 1)', () => {
  /** A git repo with main + a `development` integration branch (the item-worktree base, §5.11). */
  function initRepo(root: string) {
    const git = (...a: string[]) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
    git('init', '--initial-branch=main');
    git('config', 'user.email', 'test@kortext.dev');
    git('config', 'user.name', 'Kortext Test');
    git('config', 'commit.gpgsign', 'false');
    writeFileSync(join(root, 'README.md'), '# initial\n');
    git('add', 'README.md');
    git('commit', '-m', 'initial');
    git('branch', 'development');
  }

  /** A real per-item worktree acquirer: keyed by the item's run id, forked from development. */
  function realAcquirer(mgr: WorktreeManager) {
    return async (_itemId: string, runId: number) => {
      const handle = mgr.acquire(runId);
      return {
        path: handle.path,
        handle,
        release: ({ success }: { success: boolean }) => mgr.release(handle, { success }),
      };
    };
  }

  it('spawns the item run in a real worktree (base=development) and fills the resolution ledger', async () => {
    const repoRoot = join(tmpRoot, 'repo');
    mkdirSync(repoRoot, { recursive: true });
    initRepo(repoRoot);

    const mgr = new WorktreeManager({ repoRoot, baseBranch: 'development' });
    const resolution = new ResolutionRegistry();
    const lc = makeLifecycle();
    lc.create({ id: 'W1', type: 'task', title: 'W1' });

    const result = await runItem('W1', {
      repos,
      lifecycle: lc,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      graph: buildGraph(devCycleWf),
      acquireWorktree: realAcquirer(mgr),
      registry: new RunRegistry(),
      resolution,
    });

    expect(result.outcome).toBe('implemented');
    // Ledger: the item resolves to its real run id (QueueReviewApprover anchor, C3).
    expect(resolution.resolveRunId('W1')).toBe(result.run.id);
    // Exactly one run row — runItem pre-creates it and the engine reuses it (no orphan).
    expect(repos.runs.listRuns({ limit: 100 })).toHaveLength(1);

    // Ledger: the worktree handle resolves for the item (GitMerger merge+teardown, C2).
    const handle = resolution.resolveHandle('W1');
    expect(handle).not.toBeNull();
    expect(handle!.runId).toBe(result.run.id);
    expect(handle!.branch).toBe(`kortext/run-${result.run.id}`);
    expect(handle!.baseBranch).toBe('development');
    // The run row records its real worktree path.
    expect(result.run.worktree_path).toBe(handle!.path);
    // Ledger: the run-context resolves for the item (AgentGateExecutor, C5).
    expect(resolution.runContextFor('W1')).toEqual({
      runId: result.run.id,
      worktreePath: handle!.path,
    });

    // The worktree really exists on disk and survives for closure (NOT released on success).
    expect(existsSync(handle!.path)).toBe(true);
    expect(repos.backlog.get('W1')?.status).toBe('test');

    // Release the live worktree so afterEach's rmSync doesn't trip on git metadata.
    mgr.release(handle!, { success: true, merge: false });
  });

  it('a failed item run forgets the ledger entry (no stale handle is ever resolved)', async () => {
    const repoRoot = join(tmpRoot, 'repo2');
    mkdirSync(repoRoot, { recursive: true });
    initRepo(repoRoot);

    const mgr = new WorktreeManager({ repoRoot, baseBranch: 'development' });
    const resolution = new ResolutionRegistry();
    const lc = makeLifecycle();
    lc.create({ id: 'W2', type: 'task', title: 'W2' });

    const result = await runItem('W2', {
      repos,
      lifecycle: lc,
      executor: new MockExecutor(() => ({ fail: true })), // build fails → quarantine
      graph: buildGraph(devCycleWf),
      acquireWorktree: realAcquirer(mgr),
      registry: new RunRegistry(),
      resolution,
    });

    expect(result.outcome).toBe('failed');
    // The worktree was quarantined, so its ledger entry is forgotten — a later
    // resolve must not hand a merger a dangling handle.
    expect(resolution.resolveRunId('W2')).toBeNull();
    expect(resolution.resolveHandle('W2')).toBeNull();
    expect(repos.backlog.get('W2')?.status).toBe('in_progress');
  });
});
