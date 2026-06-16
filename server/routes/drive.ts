import { Router } from 'express';
import { DriveScheduler } from '../orchestrator/drive-scheduler.ts';

/**
 * Autonomous-driver HTTP surface (§5.16 + autonomy follow-up).
 *
 * Wires the capstone driver ({@link driveReadyItems}) to HTTP so passes can be
 * triggered manually (the dashboard "Run once" button) or automatically on a
 * timer (the dashboard "Auto" toggle). Everything sits behind a master safety
 * switch that is OFF by default (Eray's "locked, opened with a key" choice):
 *
 *   GET  /api/drive            → status { armed, armedByEnv, inFlight, scheduler, lastPass }
 *   POST /api/drive            → run one pass now (403 locked / 409 in-flight / 202)
 *   POST /api/drive/arm        → { armed } arm/disarm the master switch from the UI
 *   POST /api/drive/scheduler  → { enabled, intervalSec? } start/stop auto-drive
 *
 * Layered safety: the master env lock gates ALL passes; the scheduler is a
 * SECOND opt-in toggle on top (off by default), so auto-drive runs only when
 * BOTH are on. A single guarded `runPass` is shared by the button + the timer,
 * so manual and auto passes can never overlap (one pass at a time mutates
 * worktrees + git). Injected `enabled`/`drive` keep it unit-testable without
 * real git or agents (the composition root supplies the real `drive`).
 */
export type DriveRouterDeps = {
  /** Reads the master safety switch (KORTEXT_DRIVE_ENABLED). OFF by default. */
  enabled: () => boolean;
  /** Runs exactly one drive pass. Resolves/throws when the pass settles. */
  drive: () => Promise<unknown>;
  /** Optional sink for fire-and-forget pass + scheduler logs. Defaults to console. */
  log?: (message: string) => void;
};

type PassRecord = { at: number; ok: boolean; error?: string };

export function driveRouter(deps: DriveRouterDeps): Router {
  const r = Router();
  const log = deps.log ?? ((m: string) => console.log(`[kortext] ${m}`));

  // One pass at a time: a drive mutates worktrees + git, so overlapping passes
  // (manual + scheduled) could race the same ready items. Module-local flag
  // (the server mounts a single driveRouter), cleared in `finally`.
  let inFlight = false;
  let lastPass: PassRecord | null = null;

  // Runtime arm override (dashboard "Driver" switch). `null` = follow the env
  // default; `true`/`false` = the user explicitly armed/locked it from the UI.
  // In-memory only: a restart drops back to the env default (safe — locked
  // unless KORTEXT_DRIVE_ENABLED is set), so the UI can never *permanently*
  // weaken the fail-safe.
  let armedOverride: boolean | null = null;
  const isArmed = () => armedOverride ?? deps.enabled();

  // Guarded single-pass runner — shared by the button + the scheduler tick.
  function runPass(): 'started' | 'disabled' | 'in_progress' {
    if (!isArmed()) return 'disabled';
    if (inFlight) return 'in_progress';
    inFlight = true;
    void deps
      .drive()
      .then(() => {
        lastPass = { at: Date.now(), ok: true };
        log('drive pass complete');
      })
      .catch((err: unknown) => {
        const m = err instanceof Error ? err.message : String(err);
        lastPass = { at: Date.now(), ok: false, error: m };
        log(`drive pass failed: ${m}`);
      })
      .finally(() => {
        inFlight = false;
      });
    return 'started';
  }

  const scheduler = new DriveScheduler({ tick: () => void runPass(), log });

  function schedulerView() {
    return {
      running: scheduler.running,
      intervalSec: scheduler.intervalMs > 0 ? Math.round(scheduler.intervalMs / 1000) : null,
    };
  }

  r.get('/drive', (_req, res) => {
    res.json({
      armed: isArmed(),
      armedByEnv: deps.enabled(),
      inFlight,
      scheduler: schedulerView(),
      lastPass,
    });
  });

  // Arm / disarm the master switch from the dashboard. Disarming also stops the
  // auto-scheduler so a locked driver can never keep ticking.
  r.post('/drive/arm', (req, res) => {
    const body = req.body as { armed?: unknown };
    if (typeof body.armed !== 'boolean') {
      res.status(422).json({ error: 'validation_failed', details: ['armed must be a boolean'] });
      return;
    }
    armedOverride = body.armed;
    if (!body.armed) scheduler.stop();
    log(`drive ${body.armed ? 'armed' : 'locked'} from dashboard`);
    res.json({ armed: isArmed(), scheduler: schedulerView() });
  });

  r.post('/drive', (_req, res) => {
    const outcome = runPass();
    if (outcome === 'disabled') {
      res.status(403).json({
        error: 'drive_disabled',
        message:
          'The autonomous driver is disabled. Set KORTEXT_DRIVE_ENABLED=1 to arm the start button.',
      });
      return;
    }
    if (outcome === 'in_progress') {
      res.status(409).json({
        error: 'drive_in_progress',
        message: 'A drive pass is already running — wait for it to finish.',
      });
      return;
    }
    res.status(202).json({ status: 'started' });
  });

  r.post('/drive/scheduler', (req, res) => {
    // Auto-drive sits on top of the master lock — refuse to arm the timer if the
    // driver isn't armed. Keeps "armed?" a single source of truth (env default
    // or the dashboard override).
    if (!isArmed()) {
      res.status(403).json({
        error: 'drive_disabled',
        message: 'Arm the driver first before turning on auto-drive.',
      });
      return;
    }
    const body = req.body as { enabled?: unknown; intervalSec?: unknown };
    if (typeof body.enabled !== 'boolean') {
      res.status(422).json({ error: 'validation_failed', details: ['enabled must be a boolean'] });
      return;
    }
    if (body.enabled) {
      // Clamp to a sane floor (a real agent pass is minutes; sub-5s polling is
      // pointless and noisy). Default 60s (Eray's choice).
      const sec =
        typeof body.intervalSec === 'number' && body.intervalSec >= 5
          ? Math.floor(body.intervalSec)
          : 60;
      scheduler.start(sec * 1000);
      // Kick an immediate pass so "Auto on" feels responsive instead of waiting
      // a full interval for the first tick.
      runPass();
    } else {
      scheduler.stop();
    }
    res.json({ scheduler: schedulerView() });
  });

  return r;
}
