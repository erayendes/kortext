import { describe, it, expect, vi } from 'vitest';
import { launchBootstrapWizard, BOOTSTRAP_PORT } from '../server/cli/cmd-bootstrap.ts';

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
