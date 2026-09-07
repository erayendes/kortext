import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { dirname } from 'node:path';

/** Is a kortext already answering on this port? */
export async function serverUp(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(700),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* Wait for the detached server health check, including initial SQLite startup. */
export async function waitForServer(port: number, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await serverUp(port)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 150));
  }
}

/**
 * Detach into a separate process group and redirect output to a log file.
 * Unref the child so the parent can exit without stopping the server.
 */
export function respawnDetached(entry: string, args: string[], logPath: string): void {
  mkdirSync(dirname(logPath), { recursive: true });
  const log = openSync(logPath, 'a');
  const child = spawn(process.execPath, [entry, ...args], {
    detached: true,
    stdio: ['ignore', log, log],
    env: { ...process.env, KORTEXT_CHILD: '1' },
  });
  child.unref();
}
