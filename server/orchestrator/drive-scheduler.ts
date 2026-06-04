/**
 * Periodic auto-drive scheduler (§5.16 follow-up — the autonomy timer).
 *
 * Wraps a plain `setInterval` that fires `tick` on a fixed cadence. The tick is
 * the guarded single-pass runner (it re-checks the master switch + in-flight
 * flag itself), so the scheduler stays dumb: it just keeps the heartbeat. A
 * throwing tick is swallowed so one bad pass never wedges the timer.
 *
 * Off by default; lives on top of the master `KORTEXT_DRIVE_ENABLED` lock — a
 * running scheduler whose master switch is off ticks into no-ops. Injectable +
 * fake-timer testable; the route owns the actual pass runner.
 */
export type DriveSchedulerDeps = {
  /** The guarded one-pass runner. Called on each interval. */
  tick: () => void;
  /** Optional log sink. Defaults to silent. */
  log?: (message: string) => void;
};

export class DriveScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ms = 0;

  constructor(private readonly deps: DriveSchedulerDeps) {}

  get running(): boolean {
    return this.timer !== null;
  }

  get intervalMs(): number {
    return this.ms;
  }

  /** Start (or restart) the heartbeat at `intervalMs`. Idempotent-replace. */
  start(intervalMs: number): void {
    this.stop();
    this.ms = intervalMs;
    this.timer = setInterval(() => {
      try {
        this.deps.tick();
      } catch (err) {
        this.deps.log?.(
          `auto-drive tick error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }, intervalMs);
    // Don't keep the process alive on this timer alone (mirrors server shutdown).
    (this.timer as { unref?: () => void }).unref?.();
    this.deps.log?.(`auto-drive started (every ${Math.round(intervalMs / 1000)}s)`);
  }

  /** Stop the heartbeat and reset state. Safe to call when not running. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
      this.ms = 0;
      this.deps.log?.('auto-drive stopped');
    }
  }
}
