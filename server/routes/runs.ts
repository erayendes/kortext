import { Router } from 'express';
import type { Repositories } from '../db/repositories/index.ts';

/**
 * GET  /api/runs              — list runs (filter: ?status=...&workflow_id=...&limit=...)
 * GET  /api/runs/:id          — run detail + ordered steps
 */
export function runsRouter(deps: { repos: Repositories }): Router {
  const r = Router();

  r.get('/runs', (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const workflowId = typeof req.query.workflow_id === 'string' ? req.query.workflow_id : null;
    const limit = clampLimit(req.query.limit);
    const runs = deps.repos.runs.listRuns({
      status: status as never, // schema validates inside repo
      workflow_id: workflowId,
      limit,
    });
    res.json({ runs });
  });

  r.get('/runs/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'invalid_id' });
      return;
    }
    const run = deps.repos.runs.getRun(id);
    if (!run) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const steps = deps.repos.runs.listSteps(id);
    res.json({ run, steps });
  });

  return r;
}

function clampLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(Math.floor(n), 200);
}
