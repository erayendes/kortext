import { Router } from 'express';
import type { Repositories } from '../db/repositories/index.ts';

/**
 * GET /api/backlog        — list backlog items (filters: type, status, owner, parent_id)
 * GET /api/backlog/:id    — single item
 *
 * Faz 6.4 Board uses this to render kanban columns.
 */
export function backlogRouter(deps: { repos: Repositories }): Router {
  const r = Router();

  r.get('/backlog', (req, res) => {
    const items = deps.repos.backlog.list({
      type: pickStr(req.query.type) as never,
      status: pickStr(req.query.status) as never,
      owner: pickStr(req.query.owner),
      parent_id: pickStr(req.query.parent_id),
      limit: clampLimit(req.query.limit, 100, 500),
    });
    res.json({ items });
  });

  r.get('/backlog/:id', (req, res) => {
    const id = req.params.id;
    if (typeof id !== 'string' || id.length === 0) {
      res.status(400).json({ error: 'invalid_id' });
      return;
    }
    const item = deps.repos.backlog.get(id);
    if (!item) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ item });
  });

  return r;
}

function pickStr(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function clampLimit(raw: unknown, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}
