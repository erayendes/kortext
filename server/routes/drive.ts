import { Router } from 'express';

/**
 * POST /api/drive — the manual "start button" trigger (§5.16).
 *
 * Wires the capstone driver ({@link driveReadyItems}) to an HTTP entry point so
 * one drive pass can be kicked off on demand. This is the first slice that can
 * take production blast-radius off zero, so it ships behind a safety switch that
 * is OFF by default (Eray's "locked, opened with a key" choice):
 *
 *   - switch off            → 403 drive_disabled  (the button is inert)
 *   - switch on, in flight  → 409 drive_in_progress (single pass at a time)
 *   - switch on, idle       → 202 started + run one pass in the background
 *
 * The pass is fire-and-forget (the blueprint-trigger pattern in server/index.ts):
 * the response returns immediately while the drive runs, and the
 * result/error is logged. `enabled` and `drive` are injected so the switch +
 * in-flight guard are unit-testable without real git or agents — the real
 * end-to-end pull-through is proven by driver-e2e.test.ts (§5.13 injection
 * discipline; the composition root supplies the real `drive`).
 */
export type DriveRouterDeps = {
  /** Reads the safety switch (KORTEXT_DRIVE_ENABLED). OFF by default. */
  enabled: () => boolean;
  /** Runs exactly one drive pass. Resolves/throws when the pass settles. */
  drive: () => Promise<unknown>;
  /** Optional sink for the fire-and-forget pass result. Defaults to console. */
  log?: (message: string) => void;
};

export function driveRouter(deps: DriveRouterDeps): Router {
  const r = Router();
  const log = deps.log ?? ((m: string) => console.log(`[kortext] ${m}`));

  // One pass at a time: a drive mutates worktrees + git, so overlapping passes
  // could race on the same ready items. The guard is a module-local flag (the
  // server mounts a single driveRouter), cleared in `finally` so a crashed pass
  // never wedges the button shut.
  let inFlight = false;

  r.post('/drive', (_req, res) => {
    if (!deps.enabled()) {
      res.status(403).json({
        error: 'drive_disabled',
        message:
          'The autonomous driver is disabled. Set KORTEXT_DRIVE_ENABLED=1 to arm the start button.',
      });
      return;
    }
    if (inFlight) {
      res.status(409).json({
        error: 'drive_in_progress',
        message: 'A drive pass is already running — wait for it to finish.',
      });
      return;
    }

    inFlight = true;
    void deps
      .drive()
      .then(() => log('drive pass complete'))
      .catch((err: unknown) =>
        log(`drive pass failed: ${err instanceof Error ? err.message : String(err)}`),
      )
      .finally(() => {
        inFlight = false;
      });

    res.status(202).json({ status: 'started' });
  });

  return r;
}
