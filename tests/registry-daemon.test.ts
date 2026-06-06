import { describe, it, expect } from 'vitest';
import { resolveDaemonCommand, isPidAlive } from '../server/registry/daemon.ts';

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

describe('isPidAlive', () => {
  it('true for the current process, false for an impossible pid', () => {
    expect(isPidAlive(process.pid)).toBe(true);
    expect(isPidAlive(2_147_483_646)).toBe(false);
  });
  it('treats null as not alive', () => {
    expect(isPidAlive(null)).toBe(false);
  });
});
