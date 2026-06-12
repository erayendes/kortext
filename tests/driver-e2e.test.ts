import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { ItemLifecycle } from '../server/engine/item-lifecycle.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import type { Executor, ExecutorContext, ExecutorResult } from '../server/engine/executor.ts';
import type { WorkflowStep } from '../server/engine/workflow-parser.ts';
import { parseWorkflowMarkdown } from '../server/engine/workflow-parser.ts';
import { buildGraph } from '../server/engine/dag.ts';
import { ApprovalQueue } from '../server/orchestrator/approval-queue.ts';
import { MockPreviewServer } from '../server/engine/executors/mock-preview-server.ts';
import { createComposition } from '../server/orchestrator/composition.ts';
import { driveReadyItems } from '../server/orchestrator/driver.ts';

let tmpRoot: string;
let repoRoot: string;
let agentsDir: string;
let db: Database.Database;
let repos: Repositories;

const devCycleWf = parseWorkflowMarkdown(
  `# Development Cycle
## Build
1. **+backend-developer:** implement the item
   - Outputs: impl.md
`,
  'development-cycle',
);

const deploymentWf = parseWorkflowMarkdown(
  `# Deployment Cycle
## Deploy
1. **+devops-engineer:** deploy development to staging
   - Outputs: deploy.md
`,
  'deployment-cycle',
);

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function initRepo(root: string) {
  git(root, 'init', '--initial-branch=main');
  git(root, 'config', 'user.email', 'test@kortext.dev');
  git(root, 'config', 'user.name', 'Kortext Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(root, 'README.md'), '# initial\n');
  git(root, 'add', 'README.md');
  git(root, 'commit', '-m', 'initial');
  git(root, 'branch', 'development');
}

function makeLifecycle() {
  return new ItemLifecycle({ repos, personas: loadPersonasFromDir(agentsDir) });
}

/**
 * An executor that mimics a real coding agent: a development-cycle step writes a
 * file into the item's worktree and commits it there, so closure has a real diff
 * to merge into development. The guard keys off the workflow id — ONLY the
 * development-cycle build commits, and only inside its own worktree — so the
 * deployment-cycle step (which runs in the repo root, no worktree) never writes
 * to or commits in the host repo.
 */
class WorktreeWritingExecutor implements Executor {
  readonly name = 'worktree-writer';
  async execute(step: WorkflowStep, ctx: ExecutorContext): Promise<ExecutorResult> {
    if (ctx.signal.aborted) return { ok: false, errorMessage: 'aborted' };
    // A test-cycle gate step: write a passing machine-readable verdict report to
    // the declared output path so the STRICT gate (#4) reads a `verdict: pass`.
    if (ctx.workflowId.startsWith('gate:')) {
      const declared = step.outputs[0];
      if (declared) {
        const rel = declared.replace('<slug>', 'NOT').replace('<ts>', '2026-06-09_10-00-00');
        const abs = join(ctx.worktreePath, rel);
        mkdirSync(join(abs, '..'), { recursive: true });
        writeFileSync(abs, '---\nverdict: pass\n---\nall acceptance criteria met\n');
      }
      return { ok: true, outputSummary: `gate ${step.key}` };
    }
    // Only the dev-cycle build commits, and only inside a per-item worktree
    // (path under the test repo's worktree root, never the host repo root).
    const inItemWorktree =
      ctx.workflowId === 'development-cycle' && ctx.worktreePath.startsWith(repoRoot + '/.kortext');
    if (inItemWorktree) {
      // .js, not .txt — the #10L no-op guard requires a real app/code file.
      const file = join(ctx.worktreePath, `feature-${step.key.replace(/[^\w.-]/g, '_')}.js`);
      writeFileSync(file, `// built by ${step.persona ?? 'agent'}\n`);
      git(ctx.worktreePath, 'add', '-A');
      git(ctx.worktreePath, 'commit', '-m', `implement ${step.key}`);
    }
    return { ok: true, outputSummary: `built ${step.key}` };
  }
}

/**
 * UAT #10M — the REAL failing agent: it writes real app code into the worktree
 * but NEVER `git commit`s it (exactly what live codex did). Without the engine-
 * side commit, the merge grafts a commit-less branch onto development → empty
 * merge → code lost. With the fix, runItem commits the worktree before `test`
 * and the file reaches development.
 */
class WritesButNeverCommitsExecutor implements Executor {
  readonly name = 'writes-no-commit';
  async execute(step: WorkflowStep, ctx: ExecutorContext): Promise<ExecutorResult> {
    if (ctx.signal.aborted) return { ok: false, errorMessage: 'aborted' };
    if (ctx.workflowId.startsWith('gate:')) {
      const declared = step.outputs[0];
      if (declared) {
        const rel = declared.replace('<slug>', 'NOT').replace('<ts>', '2026-06-09_10-00-00');
        const abs = join(ctx.worktreePath, rel);
        mkdirSync(join(abs, '..'), { recursive: true });
        writeFileSync(abs, '---\nverdict: pass\n---\nall acceptance criteria met\n');
      }
      return { ok: true, outputSummary: `gate ${step.key}` };
    }
    const inItemWorktree =
      ctx.workflowId === 'development-cycle' && ctx.worktreePath.startsWith(repoRoot + '/.kortext');
    if (inItemWorktree) {
      // Writes a real app file but DELIBERATELY does not commit — the #10M bug.
      writeFileSync(join(ctx.worktreePath, 'index.html'), '<!doctype html>\n<h1>built</h1>\n');
      mkdirSync(join(ctx.worktreePath, 'src'), { recursive: true });
      writeFileSync(join(ctx.worktreePath, 'src', 'main.js'), 'console.log("hi")\n');
    }
    return { ok: true, outputSummary: `built ${step.key}` };
  }
}

function makeComposition(executor: Executor = new WorktreeWritingExecutor()) {
  return createComposition({
    repos,
    executor,
    queue: new ApprovalQueue({ repos, pollIntervalMs: 15 }),
    repoRoot,
    baseBranch: 'development',
    loadDeploymentWorkflow: () => deploymentWf,
    // Deterministic preview substrate — the real spawn path is covered by
    // dev-server-preview.test.ts; here we focus on the lifecycle pull-through.
    previewServer: new MockPreviewServer(),
  });
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-drv-'));
  repoRoot = join(tmpRoot, 'repo');
  agentsDir = join(tmpRoot, 'agents');
  mkdirSync(repoRoot, { recursive: true });
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, 'backend-developer.md'),
    '# backend-developer\n\n- description: builds.\n\n## identity\nbody\n',
  );
  initRepo(repoRoot);
  const bundle = openDb({ path: join(tmpRoot, 'drv.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('driveReadyItems — end-to-end pull-through (capstone composition 4, §5.14 step 4)', () => {
  it('drives a lone gate-free item to_do → done in one pass (real git merge, mock agent)', async () => {
    const c = makeComposition();
    const lc = makeLifecycle();
    lc.create({ id: 'E1', type: 'task', title: 'E1' }); // to_do, no parent, no gates

    const result = await driveReadyItems({
      composition: c,
      lifecycle: lc,
      graph: buildGraph(devCycleWf),
    });

    // The item walked the whole lifecycle in one pass.
    expect(repos.backlog.get('E1')?.status).toBe('done');
    expect(result.implemented.map((r) => r.itemId)).toContain('E1');
    expect(result.reviewed.find((r) => r.itemId === 'E1')?.outcome).toBe('done');

    // The work merged into development (a real merge commit exists).
    const devLog = git(repoRoot, 'log', '--oneline', 'development');
    expect(devLog).toMatch(/Merge kortext\/run-\d+ into development/);

    // The ledger is cleaned up after the item closed.
    expect(c.resolution.resolveRunId('E1')).toBeNull();
    expect(c.resolution.resolveHandle('E1')).toBeNull();
    // No preview left running.
    expect(c.previewManager.urlFor('E1')).toBeNull();

    // Handover-on-close: a successful merge writes a handover record. Regression
    // guard — the production driver must thread composition.handoverEngine into
    // runClosure (it's an optional dep, so a missing thread fails silently).
    expect(repos.handovers.listByItem('E1').length).toBeGreaterThanOrEqual(1);
  });

  it('drives a gated item through its test gate to done (mock agent passes the gate)', async () => {
    const c = makeComposition();
    const lc = makeLifecycle();
    lc.create({ id: 'E2', type: 'task', title: 'E2' });
    // Planning selected one test gate for this item.
    repos.backlog.setReviewGates('E2', ['code_review']);

    const result = await driveReadyItems({
      composition: c,
      lifecycle: lc,
      graph: buildGraph(devCycleWf),
    });

    expect(repos.backlog.get('E2')?.status).toBe('done');
    // The gate actually ran (a gate_run row exists and passed).
    const gateRuns = repos.gateRuns.listForItem('E2');
    expect(gateRuns).toHaveLength(1);
    expect(gateRuns[0]?.gate).toBe('code_review');
    expect(gateRuns[0]?.status).toBe('pass');
    expect(result.tested.find((r) => r.itemId === 'E2')?.outcome).toBe('review');
  });

  it('drives an epic child to done and triggers the staging deploy on epic completion', async () => {
    const c = makeComposition();
    const lc = makeLifecycle();
    // The epic is the parent; it is mid-flight (in_progress) so the driver
    // doesn't pick it up as a ready to_do — only its child runs.
    lc.create({ id: 'EP', type: 'epic', title: 'epic' });
    lc.transition('EP', 'start', 'x'); // in_progress
    lc.create({ id: 'EC', type: 'task', title: 'child', parent_id: 'EP' });

    const result = await driveReadyItems({
      composition: c,
      lifecycle: lc,
      graph: buildGraph(devCycleWf),
    });

    expect(repos.backlog.get('EC')?.status).toBe('done');
    // Epic completion fired → a real deployment-cycle run was driven for the epic.
    const reviewed = result.reviewed.find((r) => r.itemId === 'EC');
    expect(reviewed?.outcome).toBe('done');
    const deployRuns = repos.runs.listRuns({ workflow_id: 'deployment-cycle', limit: 10 });
    expect(deployRuns).toHaveLength(1);
    expect(deployRuns[0]?.triggered_by).toContain('EP');
    expect(deployRuns[0]?.status).toBe('succeeded');
  });

  // UAT #10M regression — the agent writes real app code but never commits it.
  // The engine must commit the worktree before `test` so the merge actually
  // carries the files into development. Before the fix, development was empty
  // (commit-less branch → empty merge → fake "done").
  it('an agent that writes but never commits still lands its code in development (UAT #10M)', async () => {
    const c = makeComposition(new WritesButNeverCommitsExecutor());
    const lc = makeLifecycle();
    lc.create({ id: 'M1', type: 'task', title: 'M1' }); // to_do, no gates

    await driveReadyItems({ composition: c, lifecycle: lc, graph: buildGraph(devCycleWf) });

    expect(repos.backlog.get('M1')?.status).toBe('done');
    // The crux: development actually contains the agent's files, not an empty merge.
    git(repoRoot, 'checkout', 'development');
    const tree = git(repoRoot, 'ls-tree', '-r', '--name-only', 'development');
    expect(tree).toContain('index.html');
    expect(tree).toContain('src/main.js');
  });

  // The agent wrote NOTHING (or only uncommitted junk that yields no commit):
  // the engine commit produces no commit, the committed-only no-op guard fires,
  // and the item bounces instead of an empty merge being dressed up as "done".
  it('an empty agent run never produces an empty merge marked done (UAT #10M)', async () => {
    class NoOpExecutor implements Executor {
      readonly name = 'noop';
      async execute(step: WorkflowStep, ctx: ExecutorContext): Promise<ExecutorResult> {
        if (ctx.workflowId.startsWith('gate:')) return { ok: true };
        return { ok: true, outputSummary: `read-only ${step.key}` }; // writes nothing
      }
    }
    const c = makeComposition(new NoOpExecutor());
    const lc = makeLifecycle();
    lc.create({ id: 'M2', type: 'task', title: 'M2' });

    await driveReadyItems({ composition: c, lifecycle: lc, graph: buildGraph(devCycleWf) });

    // Not done — bounced back to in_progress for retry; no empty merge.
    expect(repos.backlog.get('M2')?.status).toBe('in_progress');
    const devLog = git(repoRoot, 'log', '--oneline', 'development');
    expect(devLog).not.toMatch(/Merge kortext\/run-\d+ into development/);
    const noop = repos.auditLog.list({ action: 'backlog.implementation.noop', resource_id: 'M2' });
    expect(noop.length).toBe(1);
  });

  it('a clean pass with nothing ready is a no-op (empty result, no runs)', async () => {
    const c = makeComposition();
    const lc = makeLifecycle();
    const result = await driveReadyItems({
      composition: c,
      lifecycle: lc,
      graph: buildGraph(devCycleWf),
    });
    expect(result.implemented).toEqual([]);
    expect(result.tested).toEqual([]);
    expect(result.reviewed).toEqual([]);
    expect(repos.runs.listRuns({ limit: 10 })).toHaveLength(0);
  });
});
