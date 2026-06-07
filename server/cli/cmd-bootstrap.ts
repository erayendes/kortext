import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  resolveDaemonCommand, spawnDaemon, type DaemonCommand,
} from '../registry/daemon.ts';
import { initCommand } from './init.ts';

export const BOOTSTRAP_PORT = 3199;

export type LaunchBootstrapDeps = {
  packageRoot: string;
  homeDir?: string;
  port?: number;
  init?: (dir: string) => { ok: boolean; errorMessage?: string };
  resolveCmd?: typeof resolveDaemonCommand;
  spawn?: (cmd: DaemonCommand) => number;
};

export type LaunchBootstrapResult =
  | { ok: true; url: string; pid: number; port: number }
  | { ok: false; message: string };

/**
 * Launch the ephemeral onboarding wizard daemon. It runs in a scratch home,
 * is NOT registered in projects.json, and exists only to host onboarding until
 * the user picks a directory (then the blueprint route spawns the real daemon).
 */
export function launchBootstrapWizard(deps: LaunchBootstrapDeps): LaunchBootstrapResult {
  const homeDir = deps.homeDir ?? join(homedir(), '.kortext', 'bootstrap');
  const port = deps.port ?? BOOTSTRAP_PORT;
  const init = deps.init ?? ((dir: string) => initCommand({ targetDir: dir, force: false }));
  const resolveCmd = deps.resolveCmd ?? resolveDaemonCommand;
  const spawnFn = deps.spawn ?? spawnDaemon;

  const scaffold = init(homeDir);
  if (!scaffold.ok) {
    return { ok: false, message: scaffold.errorMessage ?? 'bootstrap scaffold failed' };
  }

  const cmd = resolveCmd({ packageRoot: deps.packageRoot, projectPath: homeDir, port });
  if (cmd.mode === 'dev') {
    return { ok: false, message: 'Source checkout (no dist/) — use `kortext serve` for development.' };
  }
  const launchCmd: DaemonCommand = { ...cmd, env: { ...cmd.env, KORTEXT_BOOTSTRAP: '1' } };
  const pid = spawnFn(launchCmd);
  return { ok: true, url: `http://localhost:${port}/`, pid, port };
}
