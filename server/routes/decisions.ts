import { Router } from 'express';
import type { Repositories } from '../db/repositories/index.ts';
import { DecisionStatusSchema, type DecisionStatus } from '../db/schemas.ts';

/**
 * GET /api/decisions[?status=…&limit=…]  — list decisions index, most recent first
 */
export function decisionsRouter(deps: { repos: Repositories }): Router {
  const r = Router();

  r.get('/decisions', (req, res) => {
    const rawLimit = Number(req.query.limit);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(Math.floor(rawLimit), 200)
        : 100;

    let status: DecisionStatus | null = null;
    if (typeof req.query.status === 'string' && req.query.status.length > 0) {
      const parsed = DecisionStatusSchema.safeParse(req.query.status);
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_status' });
        return;
      }
      status = parsed.data;
    }

    const decisions = deps.repos.decisions.list({ status, limit });
    res.json({ decisions });
  });

  return r;
}
