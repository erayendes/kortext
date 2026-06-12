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
  worktreeHasChanges,
  hasMeaningfulCodeChange,
  worktreeHasMeaningfulChanges,
  worktreeHasMeaningfulCommit,
  commitWorktreeChanges,
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

describe('worktreeHasChanges (UAT #10i — did the dev-cycle produce code?)', () => {
  it('is false for a fresh worktree byte-identical to its base (a no-op run)', () => {
    git(repoRoot, 'branch', 'development');
    const mgr = new WorktreeManager({ repoRoot, baseBranch: 'development' });
    const h = mgr.acquire(makeRun());
    // No file written, no commit — exactly the fallover "read but never wrote" case.
    expect(worktreeHasChanges(h.path, h.baseBranch)).toBe(false);
    mgr.release(h, { success: true });
  });

  it('is true when the run committed new code', () => {
    git(repoRoot, 'branch', 'development');
    const mgr = new WorktreeManager({ repoRoot, baseBranch: 'development' });
    const h = mgr.acquire(makeRun());
    writeFileSync(join(h.path, 'index.html'), '<!doctype html>\n');
    git(h.path, 'add', 'index.html');
    git(h.path, 'commit', '-m', 'implement landing page');
    expect(worktreeHasChanges(h.path, h.baseBranch)).toBe(true);
    mgr.release(h, { success: true });
  });

  it('is true when the run left uncommitted changes', () => {
    git(repoRoot, 'branch', 'development');
    const mgr = new WorktreeManager({ repoRoot, baseBranch: 'development' });
    const h = mgr.acquire(makeRun());
    writeFileSync(join(h.path, 'app.js'), 'console.log(1)\n'); // unstaged
    expect(worktreeHasChanges(h.path, h.baseBranch)).toBe(true);
    mgr.release(h, { success: true });
  });
});

// ---------------------------------------------------------------------------
// UAT #10L — the #10i guard only asked "did ANYTHING change?". Live codex runs
// slipped past it by touching config/doc files (.env.example, .gitignore,
// AGENTS.md) while producing ZERO app code — the worktree "changed" but every
// gate rightly failed ("no code to review") → infinite bounce. A dev-cycle
// success now requires a MEANINGFUL code change: at least one changed file
// with an app/code extension (.html/.css/.js/.ts/…).
// ---------------------------------------------------------------------------

describe('hasMeaningfulCodeChange (UAT #10L classifier)', () => {
  it('accepts app/code files', () => {
    expect(hasMeaningfulCodeChange(['index.html'])).toBe(true);
    expect(hasMeaningfulCodeChange(['style.css'])).toBe(true);
    expect(hasMeaningfulCodeChange(['app.js'])).toBe(true);
    expect(hasMeaningfulCodeChange(['src/main.ts'])).toBe(true);
    expect(hasMeaningfulCodeChange(['api/server.py'])).toBe(true);
    // One code file among noise is enough.
    expect(hasMeaningfulCodeChange(['.gitignore', 'notes.md', 'src/App.tsx'])).toBe(true);
  });

  it('rejects config/doc-only change sets (the live codex case)', () => {
    // EXACTLY what UAT #10L found in every codex worktree:
    expect(hasMeaningfulCodeChange(['.env.example', '.gitignore', 'AGENTS.md'])).toBe(false);
    expect(hasMeaningfulCodeChange(['README.md'])).toBe(false);
    expect(hasMeaningfulCodeChange(['package.json', 'config.yml'])).toBe(false);
    expect(hasMeaningfulCodeChange([])).toBe(false);
  });
});

describe('worktreeHasMeaningfulChanges (UAT #10L — did the dev-cycle produce CODE?)', () => {
  it('is false when the run only touched config/doc files (live codex no-op)', () => {
    git(repoRoot, 'branch', 'development');
    const mgr = new WorktreeManager({ repoRoot, baseBranch: 'development' });
    const h = mgr.acquire(makeRun());
    writeFileSync(join(h.path, '.env.example'), 'PORT=3000\n');
    writeFileSync(join(h.path, 'AGENTS.md'), '# agents\n');
    git(h.path, 'add', '-A');
    git(h.path, 'commit', '-m', 'setup only');
    expect(worktreeHasMeaningfulChanges(h.path, h.baseBranch)).toBe(false);
    mgr.release(h, { success: true });
  });

  it('is true when the run committed real app code', () => {
    git(repoRoot, 'branch', 'development');
    const mgr = new WorktreeManager({ repoRoot, baseBranch: 'development' });
    const h = mgr.acquire(makeRun());
    writeFileSync(join(h.path, 'index.html'), '<!doctype html>\n');
    git(h.path, 'add', 'index.html');
    git(h.path, 'commit', '-m', 'implement landing page');
    expect(worktreeHasMeaningfulChanges(h.path, h.baseBranch)).toBe(true);
    mgr.release(h, { success: true });
  });

  it('is true for uncommitted app code too', () => {
    git(repoRoot, 'branch', 'development');
    const mgr = new WorktreeManager({ repoRoot, baseBranch: 'development' });
    const h = mgr.acquire(makeRun());
    writeFileSync(join(h.path, 'app.js'), 'console.log(1)\n'); // unstaged
    expect(worktreeHasMeaningfulChanges(h.path, h.baseBranch)).toBe(true);
    mgr.release(h, { success: true });
  });

  it('is false for a byte-identical worktree (the original #10i case still holds)', () => {
    git(repoRoot, 'branch', 'development');
    const mgr = new WorktreeManager({ repoRoot, baseBranch: 'development' });
    const h = mgr.acquire(makeRun());
    expect(worktreeHasMeaningfulChanges(h.path, h.baseBranch)).toBe(false);
    mgr.release(h, { success: true });
  });

  it('fails OPEN when git cannot answer — a genuine build is never wrongly discarded', () => {
    expect(worktreeHasMeaningfulChanges(join(tmpRoot, 'not-a-repo'), 'development')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UAT #10M — the agent writes files into its worktree but NEVER `git commit`s
// them. The merger grafts the (commit-less) feature branch onto `development`,
// which carries NOTHING → empty merge → code silently lost → fake "done". The
// engine must commit the agent's work itself before the item leaves for `test`,
// and the no-op guard must judge COMMITTED history (what the merge carries), not
// the dirty working tree (what the gates happen to read).
// ---------------------------------------------------------------------------

describe('commitWorktreeChanges (UAT #10M — engine commits the agent left-behind work)', () => {
  it('commits the uncommitted files the agent wrote and returns true', () => {
    git(repoRoot, 'branch', 'development');
    const mgr = new WorktreeManager({ repoRoot, baseBranch: 'development' });
    const h = mgr.acquire(makeRun());
    // Agent wrote real app code but (the #10M bug) never committed it.
    writeFileSync(join(h.path, 'index.html'), '<!doctype html>\n');
    writeFileSync(join(h.path, 'app.js'), 'console.log(1)\n');

    const committed = commitWorktreeChanges(h.path, 'engine: commit agent work');

    expect(committed).toBe(true);
    // Nothing left dirty — the work is now on the branch HEAD.
    expect(git(h.path, 'status', '--porcelain')).toBe('');
    expect(git(h.path, 'log', '--oneline').split('\n')[0]).toContain('engine: commit agent work');
    mgr.release(h, { success: true });
  });

  it('returns false when the worktree has nothing new to commit', () => {
    git(repoRoot, 'branch', 'development');
    const mgr = new WorktreeManager({ repoRoot, baseBranch: 'development' });
    const h = mgr.acquire(makeRun());
    // Clean worktree (no agent output at all).
    expect(commitWorktreeChanges(h.path, 'engine: nothing')).toBe(false);
    mgr.release(h, { success: true });
  });

  it('commits even when the worktree has no committer identity configured (robust in a bare CI checkout)', () => {
    // A repo with NO user.name/user.email — git commit would normally refuse.
    const bare = join(tmpRoot, 'noid');
    execFileSync('mkdir', ['-p', bare]);
    git(bare, 'init', '--initial-branch=main');
    git(bare, 'config', 'user.email', 'seed@kortext.dev');
    git(bare, 'config', 'user.name', 'Seed');
    writeFileSync(join(bare, 'README.md'), '# x\n');
    git(bare, 'add', 'README.md');
    git(bare, 'commit', '-m', 'seed');
    git(bare, 'branch', 'development');
    // Drop identity AFTER the seed commit so the worktree inherits no identity.
    execFileSync('git', ['-C', bare, 'config', '--unset', 'user.email']);
    execFileSync('git', ['-C', bare, 'config', '--unset', 'user.name']);

    const mgr = new WorktreeManager({ repoRoot: bare, baseBranch: 'development' });
    const h = mgr.acquire(makeRun());
    writeFileSync(join(h.path, 'main.js'), 'export const x = 1\n');

    expect(commitWorktreeChanges(h.path, 'engine: identity-less commit')).toBe(true);
    expect(git(h.path, 'status', '--porcelain')).toBe('');
    mgr.release(h, { success: true });
  });

  it('after an engine commit, the merge actually carries the files into development (the #10M end-to-end fix)', () => {
    git(repoRoot, 'branch', 'development');
    const mgr = new WorktreeManager({ repoRoot, baseBranch: 'development' });
    const h = mgr.acquire(makeRun());
    // Agent writes but never commits — the exact failing case.
    writeFileSync(join(h.path, 'index.html'), '<!doctype html>\n');
    expect(git(h.path, 'status', '--porcelain')).not.toBe(''); // dirty, untracked

    // Engine commits, THEN the merger releases with merge.
    commitWorktreeChanges(h.path, 'engine: commit agent work');
    mgr.release(h, { success: true, merge: true });

    // development now actually has the file (before the fix this was empty).
    git(repoRoot, 'checkout', 'development');
    expect(existsSync(join(repoRoot, 'index.html'))).toBe(true);
  });

  it('returns false (never throws) when pointed at a non-repo', () => {
    expect(commitWorktreeChanges(join(tmpRoot, 'not-a-repo'), 'x')).toBe(false);
  });
});

describe('worktreeHasMeaningfulCommit (UAT #10M — judge COMMITTED history, not the dirty tree)', () => {
  it('is FALSE when app code is only UNCOMMITTED — it would not survive the merge', () => {
    git(repoRoot, 'branch', 'development');
    const mgr = new WorktreeManager({ repoRoot, baseBranch: 'development' });
    const h = mgr.acquire(makeRun());
    // Real app code, but never committed → the merge would carry nothing.
    writeFileSync(join(h.path, 'app.js'), 'console.log(1)\n');
    expect(worktreeHasMeaningfulCommit(h.path, h.baseBranch)).toBe(false);
    mgr.release(h, { success: true });
  });

  it('is TRUE when app code is COMMITTED', () => {
    git(repoRoot, 'branch', 'development');
    const mgr = new WorktreeManager({ repoRoot, baseBranch: 'development' });
    const h = mgr.acquire(makeRun());
    writeFileSync(join(h.path, 'index.html'), '<!doctype html>\n');
    git(h.path, 'add', 'index.html');
    git(h.path, 'commit', '-m', 'implement landing page');
    expect(worktreeHasMeaningfulCommit(h.path, h.baseBranch)).toBe(true);
    mgr.release(h, { success: true });
  });

  it('is FALSE when only config/doc was committed (no app file in the merge)', () => {
    git(repoRoot, 'branch', 'development');
    const mgr = new WorktreeManager({ repoRoot, baseBranch: 'development' });
    const h = mgr.acquire(makeRun());
    writeFileSync(join(h.path, 'README.md'), '# notes\n');
    writeFileSync(join(h.path, '.gitignore'), 'node_modules\n');
    git(h.path, 'add', '-A');
    git(h.path, 'commit', '-m', 'docs only');
    expect(worktreeHasMeaningfulCommit(h.path, h.baseBranch)).toBe(false);
    mgr.release(h, { success: true });
  });

  it('fails OPEN when git cannot answer', () => {
    expect(worktreeHasMeaningfulCommit(join(tmpRoot, 'not-a-repo'), 'development')).toBe(true);
  });
});
