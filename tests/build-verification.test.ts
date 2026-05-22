import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
      'init',
      'serve',
      'start',
      'approve',
      'status',
      'logs',
      'cleanup',
      'doctor',
      'mcp',
    ]) {
      expect(out).toContain(sub);
    }
  });
});
