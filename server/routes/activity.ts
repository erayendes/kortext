import { Router } from 'express';
import type { Repositories } from '../db/repositories/index.ts';

/**
 * GET /api/activity — the global, cross-resource activity feed that powers the
 * Dashboard timeline. Returns the curated audit log (high-volume per-item
 * `backlog.patch` rows excluded; see AuditLogRepository.listFeed), newest-first.
 *
 * The per-item drawer feed stays separate (`GET /api/backlog/:id/activity`,
 * scoped + unfiltered); this one is the project-wide "what just happened".
 */
export type ActivityRouterDeps = {
  repos: Repositories;
};

export function activityRouter(deps: ActivityRouterDeps): Router {
  const r = Router();

  r.get('/activity', (req, res) => {
    const limit = clampLimit(req.query.limit, 40, 200);
    const activity = deps.repos.auditLog.listFeed({ limit });
    res.json({ activity });
  });

  return r;
}

function clampLimit(raw: unknown, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}
