import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as cp from 'node:child_process';
import { gitCommit } from '../server/engine/git-commit.ts';

const runFile = cp.execFileSync;

let repoRoot: string;

function initRepo(root: string) {
  runFile('git', ['init', '--initial-branch=main', '--quiet'], { cwd: root });
  runFile('git', ['config', 'user.email', 'test@kortext.local'], { cwd: root });
  runFile('git', ['config', 'user.name', 'Kortext Test'], { cwd: root });
  runFile('git', ['config', 'commit.gpgsign', 'false'], { cwd: root });
  // Seed an initial commit so HEAD exists.
  writeFileSync(join(root, 'README.md'), '# init\n');
  runFile('git', ['add', 'README.md'], { cwd: root });
  runFile('git', ['commit', '-m', 'init', '--quiet'], { cwd: root });
}

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), 'kortext-git-commit-'));
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

describe('gitCommit', () => {
  it('commits a new file change and returns the new HEAD sha', () => {
    initRepo(repoRoot);
    writeFileSync(join(repoRoot, 'note.md'), 'hello\n');

    const result = gitCommit({
      repoRoot,
      message: 'chore(kortext): handover T01',
      paths: ['note.md'],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sha).toMatch(/^[0-9a-f]{40}$/);
      const headSha = runFile('git', ['rev-parse', 'HEAD'], {
        cwd: repoRoot,
        encoding: 'utf8',
      }).trim();
      expect(result.sha).toBe(headSha);
      const msg = runFile('git', ['log', '-1', '--pretty=%s'], {
        cwd: repoRoot,
        encoding: 'utf8',
      }).trim();
      expect(msg).toBe('chore(kortext): handover T01');
    }
  });

  it('returns ok=false when no paths are provided', () => {
    initRepo(repoRoot);
    const result = gitCommit({ repoRoot, message: 'noop', paths: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/no paths/i);
    }
  });

  it('returns ok=false when the directory is not a git repository', () => {
    // repoRoot is a tmp dir but no git init
    writeFileSync(join(repoRoot, 'x.md'), 'x\n');
    const result = gitCommit({
      repoRoot,
      message: 'msg',
      paths: ['x.md'],
    });
    expect(result.ok).toBe(false);
  });

  it('returns ok=false when there is nothing to commit', () => {
    initRepo(repoRoot);
    // README.md is already committed by initRepo; trying to re-commit yields no diff
    const result = gitCommit({
      repoRoot,
      message: 'redundant',
      paths: ['README.md'],
    });
    expect(result.ok).toBe(false);
  });
});
