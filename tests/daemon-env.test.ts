import { describe, expect, it } from 'vitest';
import { buildDaemonEnv } from '../server/registry/daemon.ts';

// A project daemon launched by `kortext start` is a deliberate, single-user,
// local action — the whole point is to run the pipeline. So it arms the
// autonomous driver by default; a non-coder never has to export
// KORTEXT_DRIVE_ENABLED=1 (UAT 2026-06-08 #3). The master switch stays OFF by
// default for a bare production server (which runs node directly, NOT through
// spawnDaemon), so this scoping is safe.
describe('buildDaemonEnv', () => {
  it('arms the driver by default when the user has not set the switch', () => {
    const env = buildDaemonEnv({ PATH: '/usr/bin' }, {});
    expect(env.KORTEXT_DRIVE_ENABLED).toBe('1');
  });

  it('respects an explicit OFF from the user environment (override wins)', () => {
    const env = buildDaemonEnv({ KORTEXT_DRIVE_ENABLED: '0' }, {});
    expect(env.KORTEXT_DRIVE_ENABLED).toBe('0');
  });

  it('keeps an explicit ON', () => {
    const env = buildDaemonEnv({ KORTEXT_DRIVE_ENABLED: '1' }, {});
    expect(env.KORTEXT_DRIVE_ENABLED).toBe('1');
  });

  it('clears KORTEXT_BOOTSTRAP inherited from a wizard parent', () => {
    const env = buildDaemonEnv({ KORTEXT_BOOTSTRAP: '1' }, {});
    expect(env.KORTEXT_BOOTSTRAP).toBe('');
  });

  it('lets cmd.env win over the inherited/base values', () => {
    const env = buildDaemonEnv(
      { KORTEXT_DRIVE_ENABLED: '0', KORTEXT_PORT: '3200' },
      { KORTEXT_DRIVE_ENABLED: '1', KORTEXT_PORT: '3201' },
    );
    expect(env.KORTEXT_DRIVE_ENABLED).toBe('1');
    expect(env.KORTEXT_PORT).toBe('3201');
  });

  it('preserves other inherited env (e.g. PATH)', () => {
    const env = buildDaemonEnv({ PATH: '/opt/homebrew/bin:/usr/bin' }, {});
    expect(env.PATH).toBe('/opt/homebrew/bin:/usr/bin');
  });
});
