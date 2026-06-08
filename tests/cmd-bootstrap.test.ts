import { describe, it, expect, vi } from 'vitest';
import {
  launchBootstrapWizard,
  scheduleBootstrapSelfExit,
  BOOTSTRAP_PORT,
} from '../server/cli/cmd-bootstrap.ts';

function deps(over = {}) {
  return {
    packageRoot: '/pkg',
    homeDir: '/tmp/kx-bootstrap',
    init: vi.fn(() => ({ ok: true })),
    resolveCmd: vi.fn((i: any) => ({
      mode: 'prod', command: 'node', args: ['server.js'],
      cwd: i.projectPath, env: { PORT: String(i.port) },
    })),
    spawn: vi.fn(() => 4321),
    ...over,
  };
}

describe('launchBootstrapWizard', () => {
  it('inits the scratch home, spawns daemon with KORTEXT_BOOTSTRAP=1, returns url', () => {
    const d = deps();
    const res = launchBootstrapWizard(d as any);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.url).toBe(`http://localhost:${BOOTSTRAP_PORT}/`);
    expect(res.pid).toBe(4321);
    expect(d.init).toHaveBeenCalledWith('/tmp/kx-bootstrap');
    const spawnedCmd = (d.spawn as any).mock.calls[0][0];
    expect(spawnedCmd.env.KORTEXT_BOOTSTRAP).toBe('1');
  });

  it('fails when scratch-home init fails (no spawn)', () => {
    const d = deps({ init: vi.fn(() => ({ ok: false, errorMessage: 'no perm' })) });
    const res = launchBootstrapWizard(d as any);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toMatch(/no perm/);
    expect(d.spawn).not.toHaveBeenCalled();
  });

  it('reports dev-mode (no dist) as a friendly failure', () => {
    const d = deps({
      resolveCmd: vi.fn(() => ({ mode: 'dev', command: 'x', args: [], cwd: '/', env: {} })),
    });
    const res = launchBootstrapWizard(d as any);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toMatch(/serve/i);
    expect(d.spawn).not.toHaveBeenCalled();
  });
});

describe('scheduleBootstrapSelfExit', () => {
  it('schedules exit(0) after the handoff delay when this is the bootstrap daemon', () => {
    const exit = vi.fn();
    const unref = vi.fn();
    const setTimer = vi.fn((_fn: () => void, _ms: number) => ({ unref }));

    const scheduled = scheduleBootstrapSelfExit({
      isBootstrap: true,
      delayMs: 2000,
      setTimer,
      exit,
    });

    expect(scheduled).toBe(true);
    expect(setTimer).toHaveBeenCalledTimes(1);
    const [scheduledFn, delay] = setTimer.mock.calls[0]!;
    expect(delay).toBe(2000);
    // The timer is unref'd so it never keeps the process alive on its own.
    expect(unref).toHaveBeenCalledTimes(1);
    // exit only fires when the scheduled callback runs, not synchronously.
    expect(exit).not.toHaveBeenCalled();
    scheduledFn();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('does nothing when this is a real (non-bootstrap) daemon', () => {
    const exit = vi.fn();
    const setTimer = vi.fn((_fn: () => void, _ms: number) => ({ unref: vi.fn() }));

    const scheduled = scheduleBootstrapSelfExit({
      isBootstrap: false,
      setTimer,
      exit,
    });

    expect(scheduled).toBe(false);
    expect(setTimer).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });
});
