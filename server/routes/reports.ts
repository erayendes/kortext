import { Router } from 'express';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { Repositories } from '../db/repositories/index.ts';
import { ReportStatusSchema, type ReportStatus } from '../db/schemas.ts';

export type ReportsRouterDeps = {
  repos: Repositories;
  /** Project root used to resolve file_path → absolute path for body reads. */
  projectRoot: string;
};

/**
 * GET /api/reports[?scope=&status=&related_item=&limit=&offset=]
 *   - lists rows from reports_index, most-recent first
 *
 * GET /api/reports/:id
 *   - returns the single row plus the markdown body (best-effort: body may
 *     be null if the file was deleted out of band).
 */
export function reportsRouter(deps: ReportsRouterDeps): Router {
  const r = Router();

  r.get('/reports', (req, res) => {
    let status: ReportStatus | null = null;
    if (typeof req.query.status === 'string' && req.query.status.length > 0) {
      const parsed = ReportStatusSchema.safeParse(req.query.status);
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_status' });
        return;
      }
      status = parsed.data;
    }

    const scope =
      typeof req.query.scope === 'string' && req.query.scope.length > 0
        ? req.query.scope
        : null;
    const relatedItem =
      typeof req.query.related_item === 'string' && req.query.related_item.length > 0
        ? req.query.related_item
        : null;

    const rawLimit = Number(req.query.limit);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(Math.floor(rawLimit), 200)
        : 100;
    const rawOffset = Number(req.query.offset);
    const offset =
      Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;

    const reports = deps.repos.reports.list({
      scope,
      status,
      relatedItem,
      limit,
      offset,
    });
    res.json({ reports });
  });

  r.get('/reports/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'invalid_id' });
      return;
    }
    const report = deps.repos.reports.get(id);
    if (!report) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    // Defensive: ensure file_path stays inside projectRoot (no traversal).
    const root = resolve(deps.projectRoot);
    const abs = resolve(root, report.file_path);
    let body: string | null = null;
    if (abs.startsWith(`${root}/`) || abs === root) {
      if (existsSync(abs)) {
        try {
          body = readFileSync(abs, 'utf8');
        } catch {
          body = null;
        }
      }
    }

    res.json({ report, body });
  });

  return r;
}
