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
import { WorkflowPauseController } from '../server/orchestrator/pause-controller.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

const wfTwoSteps = parseWorkflowMarkdown(
  `# Two Step
## P
1. **+a:** first
   - Outputs: a.md
2. **+b:** second
   - Inputs: a.md
   - Outputs: b.md
`,
  'two-step',
);

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-pause-'));
  const bundle = openDb({ path: join(tmpRoot, 'pause.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('runWorkflow — soft pause', () => {
  it('holds step launches while paused, then completes on resume', async () => {
    const graph = buildGraph(wfTwoSteps);
    const controller = new WorkflowPauseController();
    controller.pause();
    const executor = new MockExecutor(() => ({ durationMs: 1 }));

    const promise = runWorkflow(graph, executor, repos, {
      concurrency: 2,
      pauseController: controller,
    });

    // While paused the run must NOT finish — race it against a short timer.
    const outcome = await Promise.race([
      promise.then(() => 'done' as const),
      new Promise<'pending'>((r) => setTimeout(() => r('pending'), 60)),
    ]);
    expect(outcome).toBe('pending');

    // No step has started — all run_steps still pending.
    const run = repos.runs.listRuns({ limit: 1 })[0]!;
    expect(repos.runs.getRun(run.id)!.status).not.toBe('succeeded');
    expect(repos.runs.listSteps(run.id).every((s) => s.status === 'pending')).toBe(true);

    // Resume → the held steps launch and the run completes.
    controller.resume();
    const result = await promise;
    expect(result.run.status).toBe('succeeded');
    expect(repos.runs.listSteps(result.run.id).every((s) => s.status === 'succeeded')).toBe(true);
  });

  it('runs straight through when never paused', async () => {
    const graph = buildGraph(wfTwoSteps);
    const controller = new WorkflowPauseController();
    const executor = new MockExecutor(() => ({ durationMs: 1 }));
    const result = await runWorkflow(graph, executor, repos, {
      concurrency: 2,
      pauseController: controller,
    });
    expect(result.run.status).toBe('succeeded');
  });
});
