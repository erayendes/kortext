import { closeSync, mkdirSync, openSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const LOCK_DEADLINE_MS = 2000;
const RETRY_INTERVAL_MS = 25;

/** Sync sleep using Atomics.wait (does NOT require a SharedArrayBuffer cross-origin flag). */
function syncSleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Acquire a synchronous exclusive file lock, run `fn`, release the lock.
 * Lock file: `<dir>/projects.json.lock` (O_EXCL / atomic create).
 * Stale-lock breaker: if the existing lock file's mtime predates the
 * acquisition start by more than the deadline, it is forcibly removed.
 */
export function withRegistryLock<T>(dir: string, fn: () => T): T {
  mkdirSync(dir, { recursive: true });
  const lockPath = join(dir, 'projects.json.lock');
  const startMs = Date.now();
  const deadline = startMs + LOCK_DEADLINE_MS;

  let acquired = false;
  while (!acquired) {
    try {
      const fd = openSync(lockPath, 'wx'); // O_WRONLY | O_CREAT | O_EXCL
      closeSync(fd);
      acquired = true;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw err; // unexpected error — bubble up

      const now = Date.now();
      if (now >= deadline) {
        // Before giving up, check whether the lock is stale.
        try {
          const mtime = statSync(lockPath).mtimeMs;
          if (mtime < startMs - LOCK_DEADLINE_MS) {
            // Stale: predates the entire acquisition window — reclaim.
            unlinkSync(lockPath);
            continue;
          }
        } catch {
          // Lock disappeared between the openSync failure and statSync — retry.
          continue;
        }
        throw new Error(
          `kortext registry lock timeout after ${LOCK_DEADLINE_MS}ms — ` +
            `stale lock file at ${lockPath}? Remove it manually if the process died.`,
        );
      }

      syncSleep(RETRY_INTERVAL_MS);
    }
  }

  try {
    return fn();
  } finally {
    try {
      unlinkSync(lockPath);
    } catch {
      // ENOENT — already gone; ignore.
    }
  }
}
