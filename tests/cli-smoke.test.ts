import { describe, expect, it } from 'vitest';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import * as cp from 'node:child_process';

/**
 * Faz 9.3 — CLI smoke (source path).
 *
 * `tests/build-verification.test.ts` covers the compiled `dist/bin/kortext.js`
 * entry. This file covers the *source* path that contributors hit every day:
 * the `bin/kortext.js` shim falling back to tsx when no `dist/` is present,
 * and the `--version` / `--help` / unknown-command surface.
 *
 * The compiled path is exercised by Faz 9.2 — here we deliberately invoke
 * the shim entry (`bin/kortext.js`) so it picks whichever mode is available.
 * On a freshly-cloned checkout it falls through to tsx; on a built tree it
 * imports the compiled module. Both must report the same version.
 */

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const shimEntry = join(projectRoot, 'bin', 'kortext.js');

function readPackageVersion(): string {
  const pkg = JSON.parse(
    readFileSync(join(projectRoot, 'package.json'), 'utf8'),
  ) as { version: string };
  return pkg.version;
}

function runCli(args: string[]): { stdout: string; status: number } {
  // Use spawnSync (via execFileSync wrapper) so we can capture exit codes
  // and stdout together. `node bin/kortext.js …` is the same invocation
  // `npx kortext` would produce on a real install.
  const result = cp.spawnSync('node', [shimEntry, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 30_000,
  });
  return {
    stdout: (result.stdout ?? '').toString(),
    status: result.status ?? -1,
  };
}

describe('CLI smoke (shim entry)', () => {
  it('--version prints the package.json version', () => {
    const { stdout, status } = runCli(['--version']);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe(readPackageVersion());
  });

  it('-v alias works the same way', () => {
    const { stdout, status } = runCli(['-v']);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe(readPackageVersion());
  });

  it('--help lists every documented subcommand', () => {
    const { stdout, status } = runCli(['--help']);
    expect(status).toBe(0);
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
      expect(stdout).toContain(sub);
    }
  });

  it('no-arg invocation falls back to help (exit 0)', () => {
    const { status, stdout } = runCli([]);
    expect(status).toBe(0);
    // Sanity — help banner mentions the package name.
    expect(stdout.toLowerCase()).toContain('kortext');
  });

  // Exit code paths run quickly (no DB open, no spawn fanout) so are cheap
  // to assert. We don't pin specific non-zero codes — that's an internal
  // detail — only that unknown commands fail rather than silently succeed.
  it('unknown subcommand exits non-zero', () => {
    const { status } = runCli(['this-is-not-a-real-command']);
    expect(status).not.toBe(0);
  });
});
