import { Router } from 'express';
import { getDb } from '../db/client.ts';

export const dbInfoRouter: Router = Router();

dbInfoRouter.get('/db/info', (_req, res) => {
  const { db, schemaVersion } = getDb();
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as { name: string }[];
  res.json({
    schemaVersion,
    tableCount: tables.length,
    tables: tables.map((t) => t.name),
    dbPath: db.name,
  });
});

dbInfoRouter.get('/db/audit', (req, res) => {
  const { repositories } = getDb();
  const limit = Math.min(Number(req.query.limit ?? 50), 500);
  res.json({ items: repositories.auditLog.list({ limit }) });
});
