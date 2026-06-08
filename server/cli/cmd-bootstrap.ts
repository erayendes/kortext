import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  resolveDaemonCommand, spawnDaemon, type DaemonCommand,
} from '../registry/daemon.ts';
import { initCommand } from './init.ts';

export const BOOTSTRAP_PORT = 3199;

/**
 * Grace period between the wizard flushing its handoff response and exiting.
 * Gives the browser time to receive `handoffUrl` and redirect to the real
 * project daemon before this ephemeral daemon tears itself down.
 */
export const SELF_EXIT_DELAY_MS = 2000;

export type SelfExitDeps = {
  isBootstrap: boolean;
  delayMs?: number;
  setTimer?: (fn: () => void, ms: number) => { unref?: () => void };
  exit?: (code: number) => void;
};

/**
 * Schedule the ephemeral onboarding wizard daemon to shut itself down shortly
 * after it has handed off to the real project daemon.
 *
 * The wizard is NOT registered in projects.json, so `kortext stop` (which only
 * iterates registered projects) can never reap it — if it lingered it would
 * hold port 3199 and a later `kortext start` would collide. So it must exit on
 * its own once onboarding is done.
 *
 * Guarded by `isBootstrap` (KORTEXT_BOOTSTRAP === '1' at the call site): a real
 * project daemon must NEVER self-exit here. The timer is unref'd so it doesn't,
 * by itself, keep an otherwise-idle process alive. Returns whether an exit was
 * scheduled (mainly for testing / logging).
 */
export function scheduleBootstrapSelfExit(deps: SelfExitDeps): boolean {
  if (!deps.isBootstrap) return false;
  const delayMs = deps.delayMs ?? SELF_EXIT_DELAY_MS;
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const exit = deps.exit ?? ((code: number) => process.exit(code));
  const timer = setTimer(() => exit(0), delayMs);
  timer?.unref?.();
  return true;
}

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
