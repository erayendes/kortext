import { Router } from 'express';
import type { WorkflowPauseController } from '../orchestrator/pause-controller.ts';

/**
 * GET  /api/pause        — { paused } current state
 * POST /api/pause        — { paused: boolean } toggle the soft pause
 *
 * Soft pause: holds new step launches across the daemon; in-flight steps finish.
 * The Setup/dashboard pause button drives this.
 */
export function pauseRouter(deps: { controller: WorkflowPauseController }): Router {
  const r = Router();

  r.get('/pause', (_req, res) => {
    res.json({ paused: deps.controller.paused() });
  });

  r.post('/pause', (req, res) => {
    const body = req.body as { paused?: unknown };
    if (typeof body.paused !== 'boolean') {
      res.status(400).json({ error: 'missing_paused' });
      return;
    }
    if (body.paused) deps.controller.pause();
    else deps.controller.resume();
    res.json({ paused: deps.controller.paused() });
  });

  return r;
}
