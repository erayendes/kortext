import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { ApprovalQueue } from '../server/orchestrator/approval-queue.ts';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import type { Executor } from '../server/engine/executor.ts';
import { parseWorkflowMarkdown } from '../server/engine/workflow-parser.ts';
import { createComposition } from '../server/orchestrator/composition.ts';

let tmpRoot: string;
let repoRoot: string;
let db: Database.Database;
let repos: Repositories;

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

function makeComposition(executor: Executor = new MockExecutor(() => ({ durationMs: 1 }))) {
  return createComposition({
    repos,
    executor,
    queue: new ApprovalQueue({ repos, pollIntervalMs: 15 }),
    repoRoot,
    baseBranch: 'development',
    loadDeploymentWorkflow: () => deploymentWf,
    preview: { command: 'node', args: ['-e', 'setInterval(()=>{},1000)'] },
  });
}

/** A gate persona stand-in that writes a passing verdict report to the worktree. */
function passingGateExecutor(): Executor {
  return {
    name: 'gate-pass',
    async execute(step, ctx) {
      const declared = step.outputs[0];
      if (declared) {
        const rel = declared.replace('<slug>', 'NOT').replace('<ts>', '2026-06-09_10-00-00');
        const abs = join(ctx.worktreePath, rel);
        mkdirSync(join(abs, '..'), { recursive: true });
        writeFileSync(abs, '---\nverdict: pass\n---\nall good\n');
      }
      return { ok: true, outputSummary: 'gate ok' };
    },
  };
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-comp-'));
  repoRoot = join(tmpRoot, 'repo');
  mkdirSync(repoRoot, { recursive: true });
  initRepo(repoRoot);
  const bundle = openDb({ path: join(tmpRoot, 'comp.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('createComposition — wires the real adapters to the resolution ledger (capstone composition 2, §5.14)', () => {
  it('wires the five real substrate adapters (not the mocks)', () => {
    const c = makeComposition();
    expect(c.merger.name).toBe('git-merger'); // C2
    expect(c.gateExecutor.name).toBe('persona-agent'); // C5
    expect(c.approver.name).toBe('prime-approval'); // C3
    expect(c.deployer.name).toBe('workflow-deployer'); // C4
    // C1 preview + the ledgers are present.
    expect(c.previewManager).toBeTruthy();
    expect(c.resolution).toBeTruthy();
    expect(c.registry).toBeTruthy();
    expect(c.worktrees).toBeTruthy();
  });

  it('acquireWorktree provisions a real worktree keyed by the run id, with a handle', async () => {
    const c = makeComposition();
    repos.backlog.create({ id: 'A1', type: 'task', title: 'A1' });
    const run = repos.runs.createRun({
      workflow_id: 'development-cycle',
      item_id: 'A1',
      status: 'queued',
      worktree_path: null,
      triggered_by: 'test',
    });
    const lease = await c.acquireWorktree('A1', run.id);
    expect(existsSync(lease.path)).toBe(true);
    expect(lease.handle?.runId).toBe(run.id);
    expect(lease.handle?.branch).toBe(`kortext/run-${run.id}`);
    expect(lease.handle?.baseBranch).toBe('development');
    await lease.release({ success: false }); // quarantine cleanup
  });

  it('the merger resolves the item worktree from the ledger and merges it (C2)', async () => {
    const c = makeComposition();
    repos.backlog.create({ id: 'A2', type: 'task', title: 'A2' });
    const run = repos.runs.createRun({
      workflow_id: 'development-cycle',
      item_id: 'A2',
      status: 'succeeded',
      worktree_path: null,
      triggered_by: 'test',
    });
    const handle = c.worktrees.acquire(run.id);
    // The item did work in its worktree.
    writeFileSync(join(handle.path, 'feature.txt'), 'shipped\n');
    git(handle.path, 'add', 'feature.txt');
    git(handle.path, 'commit', '-m', 'implement A2');
    // The ledger is what runItem fills; here we fill it directly to test the wiring.
    c.resolution.record('A2', { runId: run.id, worktreePath: handle.path, handle });

    const merge = await c.merger.close({ itemId: 'A2' });
    expect(merge.ok).toBe(true);
    expect(existsSync(join(repoRoot, 'feature.txt'))).toBe(true); // merged into development
    expect(existsSync(handle.path)).toBe(false); // worktree torn down
  });

  it('the approver resolves the item run id from the ledger and enqueues a uat question (C3)', async () => {
    const c = makeComposition();
    repos.backlog.create({ id: 'A3', type: 'task', title: 'A3' });
    const run = repos.runs.createRun({
      workflow_id: 'development-cycle',
      item_id: 'A3',
      status: 'succeeded',
      worktree_path: null,
      triggered_by: 'test',
    });
    c.resolution.record('A3', { runId: run.id, worktreePath: '/wt/A3', handle: null });
    const item = repos.backlog.get('A3')!;

    const pending = c.approver.requestApproval({ itemId: 'A3', item, persona: '+prime' });
    // The question anchored to the item's run — answer it.
    setTimeout(() => {
      const q = c.queue.findOpenForRun(run.id)!;
      c.queue.answer(q.id, 'approve', 'prime');
    }, 25);
    const verdict = await pending;
    expect(verdict.approved).toBe(true);
  });

  it('the gate executor opens a step on the item run and runs it in the worktree (C5)', async () => {
    const c = makeComposition(passingGateExecutor());
    repos.backlog.create({ id: 'A4', type: 'task', title: 'A4' });
    const run = repos.runs.createRun({
      workflow_id: 'development-cycle',
      item_id: 'A4',
      status: 'succeeded',
      worktree_path: null,
      triggered_by: 'test',
    });
    const wt = join(tmpRoot, 'wt-A4');
    mkdirSync(wt, { recursive: true });
    c.resolution.record('A4', { runId: run.id, worktreePath: wt, handle: null });

    const before = repos.runs.listSteps(run.id).length;
    const out = await c.gateExecutor.runGate({
      itemId: 'A4',
      gate: 'code_review',
      persona: '+engineering-manager',
      attempt: 1,
    });
    expect(out.pass).toBe(true);
    // A real step row was opened on the item's run for this gate.
    expect(repos.runs.listSteps(run.id).length).toBe(before + 1);
  });

  it('the deployer drives a real deployment-cycle run for an epic (C4)', async () => {
    const c = makeComposition();
    const out = await c.deployer.deployStaging({ epicId: 'EPIC-1' });
    expect(out.ok).toBe(true);
    const runs = repos.runs.listRuns({ workflow_id: 'deployment-cycle', limit: 10 });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.triggered_by).toContain('EPIC-1');
  });
});
