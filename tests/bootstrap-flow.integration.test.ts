import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProjectAndLaunch } from '../server/blueprint/create-project.ts';
import {
  readBlueprintStatus,
  resolveBlueprintPaths,
  writeBlueprint,
  writeProjectMeta,
  type ProjectMeta,
} from '../server/blueprint/io.ts';
import { initCommand } from '../server/cli/init.ts';
import { bootstrapGit } from '../server/cli/bootstrap-git.ts';

/**
 * Integration smoke test for the bootstrap heart of the wizard flow.
 *
 * Unit tests stub init / bootstrapGit / io out; this proves the wired path
 * against a REAL filesystem + REAL git: createProjectAndLaunch with the REAL
 * initCommand, REAL bootstrapGit, and REAL blueprint io produces a build-ready
 * directory (`.kortext/` scaffold, git repo on `main` with a `development`
 * branch, approved BRD + project.json). Only startProject is stubbed — we don't
 * want to spawn a daemon in a test.
 *
 * Requires `git` on PATH; that's a project prerequisite, so a missing git
 * failing this test is acceptable for an integration test.
 */

let tmp: string;

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe('bootstrap flow (real fs + real git)', () => {
  it('createProjectAndLaunch yields a git+scaffold build-ready dir', () => {
    tmp = mkdtempSync(join(tmpdir(), 'kx-bootstrap-'));

    const meta: ProjectMeta = {
      name: 'Smoke Project',
      code: 'SMOKE',
      type: 'new',
      platforms: ['web'],
      githubRepo: null,
      executor: 'mock',
      executorBinary: null,
      createdAt: Date.now(),
    };

    const result = createProjectAndLaunch(
      {
        projectDir: tmp,
        meta,
        blueprintBody: '# BRD\nSome requirements.\n',
      },
      {
        packageRoot: process.cwd(),
        init: (dir) => initCommand({ targetDir: dir, force: false }),
        bootstrapGit: (dir) => bootstrapGit(dir),
        writeBlueprint,
        writeProjectMeta,
        startProject: () => ({
          ok: true,
          url: 'http://localhost:3299/',
          slug: 'smoke',
          port: 3299,
        }),
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return; // narrow for TS
    expect(result.handoffUrl).toBe('http://localhost:3299/');

    // Real git work tree on `main` with a `development` branch.
    expect(
      execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: tmp,
        encoding: 'utf8',
      }).trim(),
    ).toBe('true');
    expect(() =>
      execFileSync('git', ['rev-parse', '--verify', 'refs/heads/development'], {
        cwd: tmp,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    ).not.toThrow();
    expect(
      execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: tmp,
        encoding: 'utf8',
      }).trim(),
    ).toBe('main');

    // Real scaffold on disk.
    expect(existsSync(join(tmp, '.kortext'))).toBe(true);

    // BRD written + reads back as approved; project.json present.
    const paths = resolveBlueprintPaths(tmp);
    expect(existsSync(paths.blueprintPath)).toBe(true);
    expect(readBlueprintStatus(paths.blueprintPath)).toBe('approved');
    expect(existsSync(paths.projectJsonPath)).toBe(true);
  });
});
