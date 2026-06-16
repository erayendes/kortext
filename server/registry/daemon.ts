import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { buildServeCommands } from '../cli/serve.ts';

export type DaemonCommand = {
  mode: 'dev' | 'prod';
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
};

/** Resolve what to spawn for a project's daemon (the single server command). */
export function resolveDaemonCommand(input: {
  packageRoot: string;
  projectPath: string;
  port: number;
  existsImpl?: (p: string) => boolean;
}): DaemonCommand {
  const plan = buildServeCommands({
    packageRoot: input.packageRoot,
    projectDir: input.projectPath,
    mode: 'auto',
    port: input.port,
    existsImpl: input.existsImpl,
  });
  const server = plan.commands.find((c) => c.name === 'server')!;
  return { mode: plan.mode, command: server.command, args: server.args, cwd: server.cwd, env: server.env };
}

/** Liveness via the 0-signal probe (no actual signal sent). */
export function isPidAlive(pid: number | null): boolean {
  if (pid === null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'; // exists but not ours
  }
}

/**
 * Build the environment for a CLI-launched project daemon. Two non-obvious
 * defaults, both scoped to `kortext start` (a deliberate local action) — a bare
 * production server runs node directly and never goes through here:
 *   - KORTEXT_BOOTSTRAP is CLEARED so a real daemon spawned from inside the
 *     wizard daemon (which runs with KORTEXT_BOOTSTRAP=1) doesn't inherit the
 *     flag and wrongly suppress its own boot auto-start.
 *   - KORTEXT_DRIVE_ENABLED defaults to '1' (arm the autonomous driver) so a
 *     non-coder never has to export it just to make the "Run"/"Auto" buttons
 *     work. An explicit value from the user's environment (even '0') still wins.
 * `cmd.env` is spread last so a specific launch can still override anything.
 */
export function buildDaemonEnv(
  baseEnv: NodeJS.ProcessEnv,
  cmdEnv: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(baseEnv)) {
    if (typeof v === 'string') merged[k] = v;
  }
  merged.KORTEXT_BOOTSTRAP = '';
  if (merged.KORTEXT_DRIVE_ENABLED === undefined || merged.KORTEXT_DRIVE_ENABLED === '') {
    merged.KORTEXT_DRIVE_ENABLED = '1';
  }
  Object.assign(merged, cmdEnv);
  return merged;
}

/** Spawn the daemon detached, logging to <project>/.kortext/data/logs/daemon.log. Returns pid. */
export function spawnDaemon(cmd: DaemonCommand): number {
  const logDir = join(cmd.cwd, '.kortext', 'data', 'logs');
  mkdirSync(logDir, { recursive: true });
  const logFd = openSync(join(logDir, 'daemon.log'), 'a');
  const child = spawn(cmd.command, cmd.args, {
    cwd: cmd.cwd,
    env: buildDaemonEnv(process.env, cmd.env),
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  closeSync(logFd); // child inherited its own dup; release the parent's fd
  if (child.pid === undefined) throw new Error('daemon failed to spawn (no pid)');
  return child.pid;
}

/** Best-effort terminate. Returns true if a signal was delivered. */
export function killDaemon(pid: number | null): boolean {
  if (!isPidAlive(pid)) return false;
  try {
    process.kill(pid as number, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

/** Injectable shell-out so tests never touch the real `lsof`. */
export type PortScanner = (loPort: number, hiPort: number) => number[];

/**
 * Listening PIDs on a TCP port range (macOS/Linux via `lsof`). Best-effort —
 * returns [] on any error (lsof missing, no listeners, permission). Used to
 * reach daemons whose registry PID is stale but still hold a kortext port
 * (the orphan case · TODO #10).
 */
export function pidsOnPorts(
  loPort: number,
  hiPort: number,
  run: (cmd: string, args: string[]) => string = lsofRun,
): number[] {
  try {
    const spec = loPort === hiPort ? `tcp:${loPort}` : `tcp:${loPort}-${hiPort}`;
    const out = run('lsof', ['-ti', spec, '-sTCP:LISTEN']);
    return [
      ...new Set(
        out
          .split(/\s+/)
          .map((s) => Number(s))
          .filter((n) => Number.isInteger(n) && n > 0),
      ),
    ];
  } catch {
    return [];
  }
}

function lsofRun(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/** SIGTERM every listener on a single port. Returns the pids signalled. */
export function killByPort(
  port: number,
  deps: { scan?: PortScanner; kill?: (pid: number) => boolean } = {},
): number[] {
  const scan = deps.scan ?? pidsOnPorts;
  const kill = deps.kill ?? ((pid: number) => killDaemon(pid));
  const killed: number[] = [];
  for (const pid of scan(port, port)) if (kill(pid)) killed.push(pid);
  return killed;
}
