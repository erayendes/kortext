import { Router } from 'express';
import type { Repositories } from '../db/repositories/index.ts';

/**
 * GET /api/runtime — timing summary for the footer's duration counter.
 *
 *   projectStartedAt — when this project began (project.json createdAt, else the
 *                      earliest run); the footer shows "project total".
 *   sessionStartedAt — when this daemon process booted; the footer shows the
 *                      current "session" length.
 *   running          — currently-executing run_steps (the open work), each with
 *                      its start time so the client can tick "elapsed" live.
 *   now              — server clock, so the client can reconcile clock skew.
 *
 * All durations are computed client-side from these timestamps (a live counter),
 * so this endpoint stays a cheap read.
 */
export type RuntimeRouterDeps = {
  repos: Repositories;
  /** Process boot time (Date.now() captured at server start). */
  sessionStartedAt: number;
  /** project.json createdAt, or null when not yet initialized. */
  projectCreatedAt: number | null;
};

export type RuntimeRunningStep = {
  id: number;
  label: string;
  persona: string | null;
  startedAt: number | null;
};

export function runtimeRouter(deps: RuntimeRouterDeps): Router {
  const r = Router();

  r.get('/runtime', (_req, res) => {
    const running = deps.repos.runs.listRunningSteps();
    // Fall back to the earliest run when project.json has no createdAt (e.g. a
    // project registered before the field existed).
    let projectStartedAt = deps.projectCreatedAt;
    if (projectStartedAt == null) {
      const earliest = deps.repos.runs.listRuns({ limit: 200 });
      projectStartedAt = earliest.length
        ? Math.min(...earliest.map((run) => run.created_at))
        : null;
    }
    res.json({
      now: Date.now(),
      projectStartedAt,
      sessionStartedAt: deps.sessionStartedAt,
      running: running.map((s): RuntimeRunningStep => ({
        id: s.id,
        label: s.step_name,
        persona: s.persona,
        startedAt: s.started_at,
      })),
    });
  });

  return r;
}
