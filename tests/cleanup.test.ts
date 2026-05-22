import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import {
  cleanupQuarantine,
  cleanupBranches,
} from '../server/cli/cleanup.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function initRepo(root: string) {
  mkdirSync(root, { recursive: true });
  git(root, 'init', '--initial-branch=main');
  git(root, 'config', 'user.email', 'test@kortext.dev');
  git(root, 'config', 'user.name', 'Kortext Test');
  writeFileSync(join(root, 'README.md'), '# initial\n');
  git(root, 'add', 'README.md');
  git(root, 'commit', '-m', 'initial');
}

function ageDir(path: string, daysAgo: number): void {
  const ts = (Date.now() - daysAgo * 86400 * 1000) / 1000;
  utimesSync(path, ts, ts);
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-cleanup-'));
  const bundle = openDb({ path: join(tmpRoot, 'cleanup.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('cleanupQuarantine', () => {
  it('deletes quarantine directories older than the threshold', async () => {
    const root = join(tmpRoot, 'quarantine');
    mkdirSync(root, { recursive: true });
    const oldDir = join(root, 'run-1-2026-01-01_00-00-00');
    const newDir = join(root, 'run-2-2026-05-20_00-00-00');
    mkdirSync(oldDir);
    mkdirSync(newDir);
    ageDir(oldDir, 60); // 60 days old
    ageDir(newDir, 2); // 2 days old

    const result = await cleanupQuarantine({
      quarantineRoot: root,
      olderThanDays: 30,
      dryRun: false,
    });
    expect(result.deleted).toEqual([oldDir]);
    expect(result.kept).toEqual([newDir]);
  });

  it('reports without deleting when dryRun is true', async () => {
    const root = join(tmpRoot, 'quarantine');
    mkdirSync(root, { recursive: true });
    const oldDir = join(root, 'run-3-old');
    mkdirSync(oldDir);
    ageDir(oldDir, 90);

    const result = await cleanupQuarantine({
      quarantineRoot: root,
      olderThanDays: 30,
      dryRun: true,
    });
    expect(result.deleted).toEqual([oldDir]);
    // Filesystem unchanged.
    const stillThere = execFileSync('ls', [root], { encoding: 'utf8' }).trim();
    expect(stillThere).toContain('run-3-old');
  });

  it('returns empty result when quarantine root does not exist', async () => {
    const result = await cleanupQuarantine({
      quarantineRoot: join(tmpRoot, 'does-not-exist'),
      olderThanDays: 30,
      dryRun: false,
    });
    expect(result.deleted).toEqual([]);
    expect(result.kept).toEqual([]);
  });
});

describe('cleanupBranches', () => {
  it('deletes kortext/run-<id> branches for terminal runs only', async () => {
    const repoRoot = join(tmpRoot, 'repo');
    initRepo(repoRoot);

    // Two runs: one succeeded, one running.
    const finished = repos.runs.createRun({
      workflow_id: 'wf',
      item_id: null,
      status: 'queued',
      worktree_path: null,
      triggered_by: 'test',
    });
    repos.runs.transitionRun(finished.id, 'running');
    repos.runs.transitionRun(finished.id, 'succeeded');

    const inflight = repos.runs.createRun({
      workflow_id: 'wf',
      item_id: null,
      status: 'queued',
      worktree_path: null,
      triggered_by: 'test',
    });
    repos.runs.transitionRun(inflight.id, 'running');

    // Create both branches in the repo.
    git(repoRoot, 'branch', `kortext/run-${finished.id}`);
    git(repoRoot, 'branch', `kortext/run-${inflight.id}`);

    const result = await cleanupBranches({
      repoRoot,
      repos,
      dryRun: false,
    });

    expect(result.deleted).toContain(`kortext/run-${finished.id}`);
    expect(result.kept).toContain(`kortext/run-${inflight.id}`);

    const branches = git(repoRoot, 'branch', '--list', 'kortext/*');
    expect(branches).not.toContain(`run-${finished.id}`);
    expect(branches).toContain(`run-${inflight.id}`);
  });

  it('reports without deleting when dryRun is true', async () => {
    const repoRoot = join(tmpRoot, 'repo2');
    initRepo(repoRoot);

    const run = repos.runs.createRun({
      workflow_id: 'wf',
      item_id: null,
      status: 'queued',
      worktree_path: null,
      triggered_by: 'test',
    });
    repos.runs.transitionRun(run.id, 'running');
    repos.runs.transitionRun(run.id, 'failed');
    git(repoRoot, 'branch', `kortext/run-${run.id}`);

    const result = await cleanupBranches({
      repoRoot,
      repos,
      dryRun: true,
    });
    expect(result.deleted).toContain(`kortext/run-${run.id}`);
    // Still exists.
    const branches = git(repoRoot, 'branch', '--list', 'kortext/*');
    expect(branches).toContain(`run-${run.id}`);
  });
});
