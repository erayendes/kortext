import type { PauseController } from '../engine/worker-pool.ts';

/**
 * Process-wide soft-pause switch shared by every run in this daemon (the Setup /
 * dashboard pause button). When paused, the worker-pool scheduler holds new step
 * launches; in-flight steps keep running. `waitWhilePaused` lets a paused-and-idle
 * scheduler block until `resume()` wakes it.
 *
 * In-memory by design: a restart re-orphans running runs anyway, so there's no
 * paused state worth persisting.
 */
export class WorkflowPauseController implements PauseController {
  private _paused = false;
  private resumeWaiters: Array<() => void> = [];

  paused(): boolean {
    return this._paused;
  }

  pause(): void {
    this._paused = true;
  }

  resume(): void {
    this._paused = false;
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    for (const wake of waiters) wake();
  }

  /** Resolves immediately when not paused; otherwise when resume() fires. Rejects on abort. */
  waitWhilePaused(signal?: AbortSignal): Promise<void> {
    if (!this._paused) return Promise.resolve();
    if (signal?.aborted) return Promise.reject(new Error('waitWhilePaused aborted'));
    return new Promise<void>((resolve, reject) => {
      const onResume = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      const onAbort = () => {
        this.resumeWaiters = this.resumeWaiters.filter((w) => w !== onResume);
        reject(new Error('waitWhilePaused aborted'));
      };
      this.resumeWaiters.push(onResume);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}
