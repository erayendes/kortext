import { Router } from 'express';
import type { Repositories } from '../db/repositories/index.ts';

/**
 * GET /api/handovers              — recent handovers (default 20, max 100)
 * GET /api/handovers/by-item/:id  — all handovers attached to a backlog item
 */
export function handoversRouter(deps: { repos: Repositories }): Router {
  const r = Router();

  r.get('/handovers', (req, res) => {
    const raw = Number(req.query.limit);
    const limit =
      Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 100) : 20;
    const handovers = deps.repos.handovers.listRecent(limit);
    res.json({ handovers });
  });

  r.get('/handovers/by-item/:id', (req, res) => {
    const itemId = req.params.id;
    if (typeof itemId !== 'string' || itemId.length === 0) {
      res.status(400).json({ error: 'invalid_item_id' });
      return;
    }
    const handovers = deps.repos.handovers.listByItem(itemId);
    res.json({ handovers });
  });

  return r;
}
