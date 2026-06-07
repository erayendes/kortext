/**
 * Tests for WorkflowDeployer.deployProd — real development→main merge + version tag.
 *
 * Uses a real temp git repo (mirrors git-merger.test.ts fixture pattern).
 * When repoRoot is NOT supplied, the deployer falls back to prior workflow/no-op behavior.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import { parseWorkflowMarkdown } from '../server/engine/workflow-parser.ts';
import { WorkflowDeployer } from '../server/engine/executors/workflow-deployer.ts';

let tmpRoot: string;
let repoRoot: string;
let db: Database.Database;
let repos: Repositories;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** Minimal git repo with main + development branches. */
function initRepo(root: string) {
  git(root, 'init', '--initial-branch=main');
  git(root, 'config', 'user.email', 'test@kortext.dev');
  git(root, 'config', 'user.name', 'Kortext Test');
  writeFileSync(join(root, 'README.md'), '# initial\n');
  git(root, 'add', 'README.md');
  git(root, 'commit', '-m', 'initial');
  git(root, 'branch', 'development');
}

const deploymentWf = parseWorkflowMarkdown(
  `# Deployment Cycle
## Deploy
1. **+devops-engineer:** deploy
   - Outputs: deploy.md
`,
  'deployment-cycle',
);

function makeDeployer(root: string) {
  return new WorkflowDeployer({
    repos,
    executor: new MockExecutor(() => ({ durationMs: 1 })),
    loadDeploymentWorkflow: () => deploymentWf,
    repoRoot: root,
  });
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-gpd-'));
  repoRoot = join(tmpRoot, 'repo');
  const bundle = openDb({ path: join(tmpRoot, 'gpd.db') });
  db = bundle.db;
  repos = bundle.repositories;
  execFileSync('mkdir', ['-p', repoRoot]);
  initRepo(repoRoot);
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. Happy path
// ---------------------------------------------------------------------------

describe('deployProd — happy path', () => {
  it('development+main exist → ok:true, main HEAD is merge commit, tag v1.0 on HEAD, development intact', async () => {
    // Add a commit to development so it's ahead of main.
    git(repoRoot, 'checkout', 'development');
    writeFileSync(join(repoRoot, 'feature.ts'), 'export const x = 1;\n');
    git(repoRoot, 'add', 'feature.ts');
    git(repoRoot, 'commit', '-m', 'implement feature');
    git(repoRoot, 'checkout', 'main');

    const deployer = makeDeployer(repoRoot);
    const out = await deployer.deployProd({ version: 'v1.0' });

    expect(out.ok).toBe(true);

    // main HEAD should be a merge commit (two parents)
    const parents = git(repoRoot, 'log', '--pretty=%P', '-1', 'main');
    expect(parents.split(' ').length).toBe(2); // merge commit has two parent SHAs

    // annotated tag v1.0 should exist pointing to HEAD
    const taggedSha = git(repoRoot, 'rev-parse', 'v1.0^{}');
    const headSha = git(repoRoot, 'rev-parse', 'HEAD');
    expect(taggedSha).toBe(headSha);

    // tag should be annotated (type = tag object)
    const tagType = git(repoRoot, 'cat-file', '-t', 'v1.0');
    expect(tagType).toBe('tag');

    // development branch still exists and is intact
    const devSha = git(repoRoot, 'rev-parse', 'refs/heads/development');
    expect(devSha).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 2. Idempotency — tag already exists
// ---------------------------------------------------------------------------

describe('deployProd — idempotency (tag exists)', () => {
  it('pre-existing tag → ok:true, HEAD unchanged, no error', async () => {
    // Start with development ahead
    git(repoRoot, 'checkout', 'development');
    writeFileSync(join(repoRoot, 'f.ts'), 'x\n');
    git(repoRoot, 'add', 'f.ts');
    git(repoRoot, 'commit', '-m', 'work');
    git(repoRoot, 'checkout', 'main');

    const deployer = makeDeployer(repoRoot);
    // First call — creates the merge + tag
    await deployer.deployProd({ version: 'v1.0' });
    const headAfterFirst = git(repoRoot, 'rev-parse', 'HEAD');

    // Second call — tag already exists → idempotent
    const out2 = await deployer.deployProd({ version: 'v1.0' });
    expect(out2.ok).toBe(true);

    const headAfterSecond = git(repoRoot, 'rev-parse', 'HEAD');
    expect(headAfterSecond).toBe(headAfterFirst); // HEAD unchanged
  });
});

// ---------------------------------------------------------------------------
// 3. Conflict
// ---------------------------------------------------------------------------

describe('deployProd — merge conflict', () => {
  it('diverged main & development on same file → ok:false, conflict:true, main at pre-call sha, no tag', async () => {
    // development edits README one way
    git(repoRoot, 'checkout', 'development');
    writeFileSync(join(repoRoot, 'README.md'), '# from development\n');
    git(repoRoot, 'add', 'README.md');
    git(repoRoot, 'commit', '-m', 'dev edit');

    // main edits the same file differently → real conflict
    git(repoRoot, 'checkout', 'main');
    writeFileSync(join(repoRoot, 'README.md'), '# from main\n');
    git(repoRoot, 'add', 'README.md');
    git(repoRoot, 'commit', '-m', 'main edit');

    const mainShaBefore = git(repoRoot, 'rev-parse', 'HEAD');

    const deployer = makeDeployer(repoRoot);
    const out = await deployer.deployProd({ version: 'v1.0' });

    expect(out.ok).toBe(false);
    expect(out.conflict).toBe(true);

    // main should be back at pre-call sha (merge aborted)
    const mainShaAfter = git(repoRoot, 'rev-parse', 'main');
    expect(mainShaAfter).toBe(mainShaBefore);

    // no tag should exist
    const tags = spawnSync('git', ['tag', '-l', 'v1.0'], { cwd: repoRoot, encoding: 'utf8' });
    expect(tags.stdout.trim()).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 4. development missing
// ---------------------------------------------------------------------------

describe('deployProd — development branch missing', () => {
  it('no development branch → ok:false, reason mentions "development"', async () => {
    // Delete development branch
    git(repoRoot, 'branch', '-D', 'development');

    const deployer = makeDeployer(repoRoot);
    const out = await deployer.deployProd({ version: 'v1.0' });

    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/development/i);
  });
});

// ---------------------------------------------------------------------------
// 5. First release — no main branch
// ---------------------------------------------------------------------------

describe('deployProd — first release (no main)', () => {
  it('only development exists → creates main, merges, tags, ok:true', async () => {
    // Create a repo where only development exists
    const soloRoot = join(tmpRoot, 'solo');
    execFileSync('mkdir', ['-p', soloRoot]);
    git(soloRoot, 'init', '--initial-branch=development');
    git(soloRoot, 'config', 'user.email', 'test@kortext.dev');
    git(soloRoot, 'config', 'user.name', 'Kortext Test');
    writeFileSync(join(soloRoot, 'README.md'), '# initial\n');
    git(soloRoot, 'add', 'README.md');
    git(soloRoot, 'commit', '-m', 'initial on development');

    const deployer = new WorkflowDeployer({
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadDeploymentWorkflow: () => deploymentWf,
      repoRoot: soloRoot,
    });

    const out = await deployer.deployProd({ version: 'v1.0' });

    expect(out.ok).toBe(true);

    // main should exist now
    const mainSha = git(soloRoot, 'rev-parse', 'refs/heads/main');
    expect(mainSha).toBeTruthy();

    // tag should exist
    const tagType = git(soloRoot, 'cat-file', '-t', 'v1.0');
    expect(tagType).toBe('tag');
  });
});

// ---------------------------------------------------------------------------
// 7. Branch restore — server must not be left on `main`
// ---------------------------------------------------------------------------

describe('deployProd — restores the original branch', () => {
  it('successful merge → repo is back on the ORIGINAL branch (development), not main', async () => {
    // Start the deploy from `development` (where the long-running server lives).
    git(repoRoot, 'checkout', 'development');
    writeFileSync(join(repoRoot, 'feature.ts'), 'export const x = 1;\n');
    git(repoRoot, 'add', 'feature.ts');
    git(repoRoot, 'commit', '-m', 'implement feature');

    const deployer = makeDeployer(repoRoot);
    const out = await deployer.deployProd({ version: 'v1.0' });

    expect(out.ok).toBe(true);
    expect(git(repoRoot, 'symbolic-ref', '--short', 'HEAD')).toBe('development');

    // The merge + tag still landed on main.
    const tagType = git(repoRoot, 'cat-file', '-t', 'v1.0');
    expect(tagType).toBe('tag');
  });

  it('merge conflict → back on the ORIGINAL branch AND conflict:true', async () => {
    // development & main edit the same file → real conflict, started from development.
    git(repoRoot, 'checkout', 'development');
    writeFileSync(join(repoRoot, 'README.md'), '# from development\n');
    git(repoRoot, 'add', 'README.md');
    git(repoRoot, 'commit', '-m', 'dev edit');

    git(repoRoot, 'checkout', 'main');
    writeFileSync(join(repoRoot, 'README.md'), '# from main\n');
    git(repoRoot, 'add', 'README.md');
    git(repoRoot, 'commit', '-m', 'main edit');

    // Go back to development as the starting branch before deploying.
    git(repoRoot, 'checkout', 'development');

    const deployer = makeDeployer(repoRoot);
    const out = await deployer.deployProd({ version: 'v1.0' });

    expect(out.ok).toBe(false);
    expect(out.conflict).toBe(true);
    expect(git(repoRoot, 'symbolic-ref', '--short', 'HEAD')).toBe('development');
  });

  it('non-merge failure (checkout fails) → ok:false, conflict:false', async () => {
    // A file committed to main only; the same path left UNTRACKED while on
    // development makes `git checkout main` fail BEFORE any merge runs.
    git(repoRoot, 'checkout', 'main');
    writeFileSync(join(repoRoot, 'mainonly.txt'), 'main-file\n');
    git(repoRoot, 'add', 'mainonly.txt');
    git(repoRoot, 'commit', '-m', 'main-only file');

    git(repoRoot, 'checkout', 'development');
    writeFileSync(join(repoRoot, 'feature.ts'), 'x\n');
    git(repoRoot, 'add', 'feature.ts');
    git(repoRoot, 'commit', '-m', 'dev work');
    // Untracked collision with the committed main file → checkout main aborts.
    writeFileSync(join(repoRoot, 'mainonly.txt'), 'untracked-collision\n');

    const deployer = makeDeployer(repoRoot);
    const out = await deployer.deployProd({ version: 'v1.0' });

    expect(out.ok).toBe(false);
    expect(out.conflict).toBe(false);
    // Still on development (checkout never succeeded, restore is a no-op here).
    expect(git(repoRoot, 'symbolic-ref', '--short', 'HEAD')).toBe('development');
    // No tag created.
    const tags = spawnSync('git', ['tag', '-l', 'v1.0'], { cwd: repoRoot, encoding: 'utf8' });
    expect(tags.stdout.trim()).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 6. No repoRoot → falls back to prior workflow behavior
// ---------------------------------------------------------------------------

describe('deployProd — no repoRoot (workflow fallback)', () => {
  it('no repoRoot → workflow run driven, no git operations', async () => {
    const deployer = new WorkflowDeployer({
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadDeploymentWorkflow: () => deploymentWf,
      // repoRoot intentionally omitted
    });

    const out = await deployer.deployProd({ version: 'v1.0' });

    // The workflow ran successfully
    expect(out.ok).toBe(true);
    // A workflow run was driven
    const runs = repos.runs.listRuns({ workflow_id: 'deployment-cycle', limit: 10 });
    expect(runs.length).toBeGreaterThan(0);
    expect(runs[0]?.triggered_by).toContain('v1.0');
  });

  it('no repoRoot + no workflow → ok:false (existing behavior)', async () => {
    const deployer = new WorkflowDeployer({
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadDeploymentWorkflow: () => null,
    });

    const out = await deployer.deployProd({ version: 'v1.0' });
    expect(out.ok).toBe(false);
  });
});
