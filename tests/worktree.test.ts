import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import {
  WorktreeManager,
  WorktreeLimitError,
  WorktreeError,
} from '../server/engine/worktree.ts';

let tmpRoot: string;
let repoRoot: string;
let db: Database.Database;
let repos: Repositories;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function initRepo(root: string) {
  git(root, 'init', '--initial-branch=main');
  git(root, 'config', 'user.email', 'test@kortext.dev');
  git(root, 'config', 'user.name', 'Kortext Test');
  writeFileSync(join(root, 'README.md'), '# initial\n');
  git(root, 'add', 'README.md');
  git(root, 'commit', '-m', 'initial');
}

function makeRun(): number {
  return repos.runs.createRun({
    workflow_id: 'test-wf',
    item_id: null,
    status: 'queued',
    worktree_path: null,
    triggered_by: 'test',
  }).id;
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-worktree-'));
  repoRoot = join(tmpRoot, 'repo');
  const bundle = openDb({ path: join(tmpRoot, 'wt.db') });
  db = bundle.db;
  repos = bundle.repositories;
  // create the repo dir
  rmSync(repoRoot, { recursive: true, force: true });
  // mkdir -p
  execFileSync('mkdir', ['-p', repoRoot]);
  initRepo(repoRoot);
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('WorktreeManager', () => {
  it('acquires a worktree on a fresh branch from base', () => {
    const mgr = new WorktreeManager({
      repoRoot,
      artifacts: repos.runtimeArtifacts,
    });
    const runId = makeRun();

    const handle = mgr.acquire(runId);

    expect(handle.runId).toBe(runId);
    expect(handle.baseBranch).toBe('main');
    expect(handle.branch).toBe(`kortext/run-${runId}`);
    expect(handle.path).toContain(`.kortext/data/worktrees/run-${runId}`);
    expect(existsSync(handle.path)).toBe(true);

    // worktree should be on the new branch
    const branchAtWorktree = git(handle.path, 'rev-parse', '--abbrev-ref', 'HEAD');
    expect(branchAtWorktree).toBe(`kortext/run-${runId}`);

    // artifact recorded
    const artifacts = repos.runtimeArtifacts.listByRun(runId, 'worktree');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.path).toBe(handle.path);
  });

  it('reuses an existing acquire on the same run', () => {
    const mgr = new WorktreeManager({ repoRoot, artifacts: repos.runtimeArtifacts });
    const runId = makeRun();
    const h1 = mgr.acquire(runId);
    const h2 = mgr.acquire(runId);
    expect(h2.path).toBe(h1.path);
    expect(mgr.list()).toHaveLength(1);
  });

  it('releases a worktree on success without merge (default)', () => {
    const mgr = new WorktreeManager({ repoRoot, artifacts: repos.runtimeArtifacts });
    const runId = makeRun();
    const h = mgr.acquire(runId);
    // do some work in the worktree
    writeFileSync(join(h.path, 'work.txt'), 'hi');
    git(h.path, 'add', 'work.txt');
    git(h.path, 'commit', '-m', 'work');

    mgr.release(h, { success: true });

    expect(existsSync(h.path)).toBe(false);
    // base branch unchanged (no merge)
    const log = git(repoRoot, 'log', '--oneline', 'main');
    expect(log.split('\n').length).toBe(1);
    // branch deleted
    const branches = git(repoRoot, 'branch', '--list', `kortext/run-${runId}`);
    expect(branches).toBe('');
  });

  it('merges worktree branch on success when merge requested', () => {
    const mgr = new WorktreeManager({ repoRoot, artifacts: repos.runtimeArtifacts });
    const runId = makeRun();
    const h = mgr.acquire(runId);
    writeFileSync(join(h.path, 'feature.txt'), 'feature');
    git(h.path, 'add', 'feature.txt');
    git(h.path, 'commit', '-m', 'feature commit');

    mgr.release(h, { success: true, merge: true });

    expect(existsSync(h.path)).toBe(false);
    // base branch now has the feature.txt file
    expect(existsSync(join(repoRoot, 'feature.txt'))).toBe(true);
    const log = git(repoRoot, 'log', '--oneline', 'main');
    expect(log).toContain('feature commit');
  });

  it('quarantines worktree on failure', () => {
    const mgr = new WorktreeManager({ repoRoot, artifacts: repos.runtimeArtifacts });
    const runId = makeRun();
    const h = mgr.acquire(runId);
    writeFileSync(join(h.path, 'bad.txt'), 'broken');
    git(h.path, 'add', 'bad.txt');
    git(h.path, 'commit', '-m', 'bad commit');

    mgr.release(h, { success: false });

    // original worktree dir is gone
    expect(existsSync(h.path)).toBe(false);
    // quarantine entry exists under .kortext/data/worktrees-quarantine
    const qRoot = join(repoRoot, '.kortext', 'data', 'worktrees-quarantine');
    expect(existsSync(qRoot)).toBe(true);
    // contains a dir starting with run-<id>-
    const found = execFileSync('ls', [qRoot], { encoding: 'utf8' })
      .trim()
      .split('\n');
    expect(found.some((d) => d.startsWith(`run-${runId}-`))).toBe(true);
    // branch NOT deleted — for postmortem
    const branches = git(repoRoot, 'branch', '--list', `kortext/run-${runId}`);
    expect(branches).toContain(`kortext/run-${runId}`);
    // bad.txt did NOT make it to main
    expect(existsSync(join(repoRoot, 'bad.txt'))).toBe(false);
  });

  it('enforces maxConcurrent', () => {
    const mgr = new WorktreeManager({
      repoRoot,
      artifacts: repos.runtimeArtifacts,
      maxConcurrent: 2,
    });
    const a = makeRun();
    const b = makeRun();
    const c = makeRun();
    mgr.acquire(a);
    mgr.acquire(b);
    expect(() => mgr.acquire(c)).toThrow(WorktreeLimitError);
    expect(mgr.list()).toHaveLength(2);
  });

  it('frees a slot when a worktree is released', () => {
    const mgr = new WorktreeManager({
      repoRoot,
      artifacts: repos.runtimeArtifacts,
      maxConcurrent: 1,
    });
    const r1 = makeRun();
    const r2 = makeRun();
    const h1 = mgr.acquire(r1);
    mgr.release(h1, { success: true });
    // now we can acquire another
    expect(() => mgr.acquire(r2)).not.toThrow();
  });

  it('uses configured base branch', () => {
    // create another branch
    git(repoRoot, 'checkout', '-b', 'develop');
    writeFileSync(join(repoRoot, 'on-develop.txt'), 'dev');
    git(repoRoot, 'add', 'on-develop.txt');
    git(repoRoot, 'commit', '-m', 'dev commit');
    git(repoRoot, 'checkout', 'main');

    const mgr = new WorktreeManager({
      repoRoot,
      artifacts: repos.runtimeArtifacts,
      baseBranch: 'develop',
    });
    const runId = makeRun();
    const h = mgr.acquire(runId);
    expect(h.baseBranch).toBe('develop');
    // worktree should contain on-develop.txt
    expect(existsSync(join(h.path, 'on-develop.txt'))).toBe(true);
  });

  it('throws WorktreeError when base branch is missing', () => {
    const mgr = new WorktreeManager({
      repoRoot,
      artifacts: repos.runtimeArtifacts,
      baseBranch: 'nope',
    });
    const runId = makeRun();
    expect(() => mgr.acquire(runId)).toThrow(WorktreeError);
  });

  it('reads the work done inside the worktree from outside via git', () => {
    const mgr = new WorktreeManager({ repoRoot, artifacts: repos.runtimeArtifacts });
    const runId = makeRun();
    const h = mgr.acquire(runId);
    writeFileSync(join(h.path, 'note.md'), '# hello');
    // we should be able to read the file from outside
    expect(readFileSync(join(h.path, 'note.md'), 'utf8')).toBe('# hello');
    mgr.release(h, { success: true });
  });
});
