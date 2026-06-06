import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cp from 'node:child_process';

/**
 * Faz 9.2 — Build verification smoke.
 *
 * Production readiness checks that don't need a dev runtime:
 *   1. `npm run build:server` finishes successfully (tsc + copy-migrations).
 *   2. The migration SQL files are mirrored into `dist/`. tsc itself never
 *      copies them; the post-build `scripts/copy-migrations.mjs` does. If
 *      somebody removes that step from package.json, this test fails.
 *   3. The compiled `dist/bin/kortext.js` actually runs under Node and
 *      reports the package version — proving the dual-mode shim's "compiled
 *      branch" works end-to-end on a CI machine without tsx.
 *
 * Slow by design (~3-6s on tsc). Vitest's default 5s timeout is generous
 * enough; we extend explicitly to be safe on cold CI runners.
 */

const runFile = cp.execFileSync;

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');

function readPackageVersion(): string {
  const pkg = JSON.parse(
    readFileSync(join(projectRoot, 'package.json'), 'utf8'),
  ) as { version: string };
  return pkg.version;
}

describe('build verification', () => {
  it(
    'npm run build:server produces dist/bin + dist/server with copied migrations',
    () => {
      // Run from project root so tsc / npm pick the right config.
      runFile('npm', ['run', 'build:server'], {
        cwd: projectRoot,
        // tsc + node are noisy on stdout; route to stderr-only so vitest
        // doesn't truncate output on failure.
        stdio: ['ignore', 'pipe', 'inherit'],
        timeout: 120_000,
      });

      // Compiled CLI entry exists.
      expect(existsSync(join(projectRoot, 'dist', 'bin', 'kortext.js'))).toBe(true);

      // Migrations were copied (the gotcha that motivated Faz 8.6 + this test).
      const migrationsDir = join(projectRoot, 'dist', 'server', 'db', 'migrations');
      expect(existsSync(migrationsDir)).toBe(true);
      const sqlFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
      expect(sqlFiles.length).toBeGreaterThan(0);
      // Pin the seed migration filename — drift here usually means the copy
      // script is reading from the wrong source dir.
      expect(sqlFiles).toContain('001_init.sql');
    },
    180_000,
  );

  it('compiled `kortext --version` matches package.json', () => {
    const compiledEntry = join(projectRoot, 'dist', 'bin', 'kortext.js');
    if (!existsSync(compiledEntry)) {
      // Build smoke above guards this — but if vitest re-orders cases,
      // surface a clear message instead of an ENOENT.
      throw new Error('dist/bin/kortext.js missing — build smoke must run first');
    }

    const out = runFile('node', [compiledEntry, '--version'], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 30_000,
    }).trim();

    expect(out).toBe(readPackageVersion());
  });

  it('compiled `kortext --help` lists all top-level subcommands', () => {
    const compiledEntry = join(projectRoot, 'dist', 'bin', 'kortext.js');
    const out = runFile('node', [compiledEntry, '--help'], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 30_000,
    });

    for (const sub of [
      'start',
      'stop',
      'pause',
      'list',
      'remove',
      'purge',
      'update',
      'doctor',
      'serve',
      'init',
      'dev:run',
      'mcp',
    ]) {
      expect(out).toContain(sub);
    }
  });

  it(
    'compiled `kortext init` scaffolds the v3.1 .kortext/ layout from the package root',
    () => {
      // Regression guard for the v3.0.0-release init bug: in compiled mode,
      // `server/cli/init.ts`'s old `packageRootFromHere()` walked two levels up
      // from `dist/server/cli/init.js` and landed in `dist/` — which contains
      // no template dirs. Init silently created only AGENTS.md + the DB.
      //
      // The fix is a package.json walk-up. v3.1 reshaped the scaffold:
      // personas/workflows/rules are no longer copied per-project (loaded
      // straight from the package), and the framework folder is now `.kortext/`.
      const compiledEntry = join(projectRoot, 'dist', 'bin', 'kortext.js');
      if (!existsSync(compiledEntry)) {
        throw new Error('dist/bin/kortext.js missing — build smoke must run first');
      }

      const targetDir = mkdtempSync(join(tmpdir(), 'kortext-init-smoke-'));
      try {
        runFile('node', [compiledEntry, 'init'], {
          cwd: targetDir,
          encoding: 'utf8',
          timeout: 30_000,
        });

        // v3.1 scaffold: framework folder is .kortext/, root gets the three
        // template files. References / reports / memory are seeded from
        // <package-root>/templates/.
        for (const rel of [
          join('.kortext', 'references'),
          join('.kortext', 'reports'),
          join('.kortext', 'memory'),
        ]) {
          const dir = join(targetDir, rel);
          expect(existsSync(dir)).toBe(true);
          expect(readdirSync(dir).length).toBeGreaterThan(0);
        }
        expect(existsSync(join(targetDir, 'AGENTS.md'))).toBe(true);
        expect(existsSync(join(targetDir, '.gitignore'))).toBe(true);
        expect(existsSync(join(targetDir, '.env.example'))).toBe(true);
        expect(existsSync(join(targetDir, '.kortext', 'data', 'kortext.db'))).toBe(true);

        // Personas / workflows / rules must NOT land in the project — Faz 12.2
        // moved them inside the package itself.
        expect(existsSync(join(targetDir, 'agents'))).toBe(false);
        expect(existsSync(join(targetDir, 'workflows'))).toBe(false);
        expect(existsSync(join(targetDir, 'rules'))).toBe(false);
        expect(existsSync(join(targetDir, 'workspace'))).toBe(false);

        // Spot-check one well-known reference + a memory file so a future
        // refactor that copies empty dirs would still fail loudly.
        expect(existsSync(join(targetDir, '.kortext', 'foundation', 'BRD.md'))).toBe(true);
        expect(existsSync(join(targetDir, '.kortext', 'memory', 'handover.md'))).toBe(true);
      } finally {
        rmSync(targetDir, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
