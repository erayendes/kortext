import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const spawnCalls: Array<{ env: NodeJS.ProcessEnv | undefined }> = [];
vi.mock('node:child_process', () => ({
  spawn: (_cmd: string, _args: string[], opts: { env?: NodeJS.ProcessEnv }) => {
    spawnCalls.push({ env: opts.env });
    return { pid: 4242, unref: () => {} };
  },
}));

import { resolveDaemonCommand, isPidAlive, spawnDaemon } from '../server/registry/daemon.ts';

describe('resolveDaemonCommand', () => {
  it('prod: runs the compiled server with KORTEXT_PORT + cwd=project', () => {
    const cmd = resolveDaemonCommand({
      packageRoot: '/pkg', projectPath: '/proj/tf', port: 3201,
      existsImpl: () => true, // dist present → prod
    });
    expect(cmd.mode).toBe('prod');
    expect(cmd.command).toContain('node'); // process.execPath
    expect(cmd.args[0]).toBe('/pkg/dist/server/index.js');
    expect(cmd.cwd).toBe('/proj/tf');
    expect(cmd.env.KORTEXT_PORT).toBe('3201');
  });
  it('dev: flags that source mode needs `kortext serve` (no single-process daemon)', () => {
    const cmd = resolveDaemonCommand({
      packageRoot: '/pkg', projectPath: '/proj/tf', port: 3201,
      existsImpl: () => false, // no dist → dev
    });
    expect(cmd.mode).toBe('dev');
  });
});

describe('spawnDaemon env isolation', () => {
  let tmp: string;
  afterEach(() => {
    spawnCalls.length = 0;
    delete process.env.KORTEXT_BOOTSTRAP;
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  // Regression: a real project daemon spawned from inside the wizard daemon
  // (which has KORTEXT_BOOTSTRAP=1 in its env) must NOT inherit the flag —
  // otherwise the real daemon treats itself as the wizard and never auto-starts.
  it('does not leak KORTEXT_BOOTSTRAP=1 into a normal project daemon', () => {
    tmp = mkdtempSync(join(tmpdir(), 'kx-daemon-'));
    process.env.KORTEXT_BOOTSTRAP = '1'; // simulate running inside the wizard
    spawnDaemon({
      mode: 'prod', command: 'node', args: ['index.js'], cwd: tmp,
      env: { KORTEXT_PORT: '3201' }, // serve.ts never sets KORTEXT_BOOTSTRAP
    });
    expect(spawnCalls[0]?.env?.KORTEXT_BOOTSTRAP).not.toBe('1');
  });

  // The wizard's own launch still wins: cmd.env (spread last) keeps the flag.
  it('preserves KORTEXT_BOOTSTRAP=1 when the cmd explicitly sets it (wizard)', () => {
    tmp = mkdtempSync(join(tmpdir(), 'kx-daemon-'));
    spawnDaemon({
      mode: 'prod', command: 'node', args: ['index.js'], cwd: tmp,
      env: { KORTEXT_PORT: '3199', KORTEXT_BOOTSTRAP: '1' },
    });
    expect(spawnCalls[0]?.env?.KORTEXT_BOOTSTRAP).toBe('1');
  });
});

describe('isPidAlive', () => {
  it('true for the current process, false for an impossible pid', () => {
    expect(isPidAlive(process.pid)).toBe(true);
    expect(isPidAlive(2_147_483_646)).toBe(false);
  });
  it('treats null as not alive', () => {
    expect(isPidAlive(null)).toBe(false);
  });
});
