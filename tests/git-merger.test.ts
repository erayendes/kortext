import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { WorktreeManager, type WorktreeHandle } from '../server/engine/worktree.ts';
import { GitMerger } from '../server/engine/executors/git-merger.ts';

let tmpRoot: string;
let repoRoot: string;
let db: Database.Database;
let repos: Repositories;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** A git repo with main + a `development` integration branch (the item-worktree base, §5.11). */
function initRepo(root: string) {
  git(root, 'init', '--initial-branch=main');
  git(root, 'config', 'user.email', 'test@kortext.dev');
  git(root, 'config', 'user.name', 'Kortext Test');
  writeFileSync(join(root, 'README.md'), '# initial\n');
  git(root, 'add', 'README.md');
  git(root, 'commit', '-m', 'initial');
  git(root, 'branch', 'development');
}

/** Seed an item + its run, acquire a worktree from development (simulating B1). */
function seedItemWorktree(mgr: WorktreeManager, itemId: string): WorktreeHandle {
  repos.backlog.create({ id: itemId, type: 'task', title: itemId });
  const run = repos.runs.createRun({
    workflow_id: 'development-cycle',
    item_id: itemId,
    status: 'queued',
    worktree_path: null,
    triggered_by: 'test',
  });
  return mgr.acquire(run.id);
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-gitmerge-'));
  repoRoot = join(tmpRoot, 'repo');
  const bundle = openDb({ path: join(tmpRoot, 'gm.db') });
  db = bundle.db;
  repos = bundle.repositories;
  execFileSync('mkdir', ['-p', repoRoot]);
  initRepo(repoRoot);
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('GitMerger — real worktree → development merge (capstone C2, §5.9 #6)', () => {
  it('merges the item branch into development and tears the worktree down', async () => {
    const mgr = new WorktreeManager({ repoRoot, baseBranch: 'development' });
    const handle = seedItemWorktree(mgr, 'M1');

    // The item did work in its worktree.
    writeFileSync(join(handle.path, 'feature.txt'), 'shipped\n');
    git(handle.path, 'add', 'feature.txt');
    git(handle.path, 'commit', '-m', 'implement M1');

    const merger = new GitMerger({
      worktrees: mgr,
      resolveHandle: (id) => (id === 'M1' ? handle : null),
    });
    const result = await merger.close({ itemId: 'M1' });

    expect(result.ok).toBe(true);
    // development now carries the item's commit (repoRoot is on development post-merge).
    expect(git(repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('development');
    expect(existsSync(join(repoRoot, 'feature.txt'))).toBe(true);
    // the worktree was removed.
    expect(existsSync(handle.path)).toBe(false);
  });

  it('a real merge conflict → ok:false + conflict, worktree kept for the developer', async () => {
    const mgr = new WorktreeManager({ repoRoot, baseBranch: 'development' });
    const handle = seedItemWorktree(mgr, 'M2');

    // The item edits README one way…
    writeFileSync(join(handle.path, 'README.md'), '# from the item\n');
    git(handle.path, 'add', 'README.md');
    git(handle.path, 'commit', '-m', 'item edit');

    // …while development edits the same line differently → unmergeable.
    git(repoRoot, 'checkout', 'development');
    writeFileSync(join(repoRoot, 'README.md'), '# from development\n');
    git(repoRoot, 'add', 'README.md');
    git(repoRoot, 'commit', '-m', 'dev edit');

    const merger = new GitMerger({
      worktrees: mgr,
      resolveHandle: () => handle,
    });
    const result = await merger.close({ itemId: 'M2' });

    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(existsSync(handle.path)).toBe(true); // kept so the developer can resolve
  });

  it('no worktree registered for the item → ok:false (nothing to merge)', async () => {
    const mgr = new WorktreeManager({ repoRoot, baseBranch: 'development' });
    const merger = new GitMerger({ worktrees: mgr, resolveHandle: () => null });
    const result = await merger.close({ itemId: 'GHOST' });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no worktree/i);
  });
});
