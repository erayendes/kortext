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

/**
 * Poll until the background server answers. A first run pays for the SQLite
 * binding and the schema, so the wait is generous; the caller reports the log
 * file rather than a bare failure when it runs out.
 */
export async function waitForServer(port: number, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await serverUp(port)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 150));
  }
}

/**
 * Runs this entry file again as a process detached from the terminal: its own
 * process group, no inherited stdio, unref'd so the parent can exit. Closing
 * the window sends SIGHUP to the parent's group, which this child is no longer
 * in — that is the whole trick. Output goes to the log file because a detached
 * process writing to a closed terminal would take a signal for its trouble.
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
