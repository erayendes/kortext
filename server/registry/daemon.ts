import { spawn } from 'node:child_process';
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

/** Spawn the daemon detached, logging to <project>/.kortext/data/logs/daemon.log. Returns pid. */
export function spawnDaemon(cmd: DaemonCommand): number {
  const logDir = join(cmd.cwd, '.kortext', 'data', 'logs');
  mkdirSync(logDir, { recursive: true });
  const logFd = openSync(join(logDir, 'daemon.log'), 'a');
  const child = spawn(cmd.command, cmd.args, {
    cwd: cmd.cwd,
    env: { ...process.env, ...cmd.env },
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
