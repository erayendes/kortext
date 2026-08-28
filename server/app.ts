import express from 'express';
import type Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createProject, listProjects, removeProject } from './projects.js';
import { cancelRequest, createRequest, listRequests } from './requests.js';
import { handleMcpRequest } from './mcp.js';

export function buildApp(db: Database.Database, pkgRoot: string, dbPath: string): express.Express {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, db: dbPath });
  });

  app.get('/api/projects', (_req, res) => {
    res.json({ projects: listProjects(db) });
  });

  app.post('/api/projects', (req, res) => {
    const { name, repoPath, mode } = req.body ?? {};
    try {
      const project = createProject(
        db,
        { name, repoPath, mode: mode === 'new' ? 'new' : 'existing' },
        pkgRoot,
      );
      res.status(201).json({ project });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/projects/:id', (req, res) => {
    const removed = removeProject(db, Number(req.params.id));
    res.status(removed ? 200 : 404).json({ removed });
  });

  app.get('/api/projects/:id/requests', (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.json({ requests: listRequests(db, Number(req.params.id), status) });
  });

  app.post('/api/projects/:id/requests', (req, res) => {
    const { type, payload } = req.body ?? {};
    try {
      res.status(201).json({ request: createRequest(db, Number(req.params.id), type, payload) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/requests/:id/cancel', (req, res) => {
    res.json({ cancelled: cancelRequest(db, Number(req.params.id)) });
  });

  // MCP over streamable HTTP (stateless): agents connect with
  //   claude mcp add --transport http kortext http://localhost:<port>/mcp
  app.post('/mcp', (req, res) => {
    void handleMcpRequest(db, req, res);
  });
  app.get('/mcp', (_req, res) => res.status(405).json({ error: 'stateless server: POST only' }));

  // Built panel (ui/dist) with SPA fallback; in dev the vite server proxies /api here.
  const uiDist = join(pkgRoot, 'ui', 'dist');
  if (existsSync(uiDist)) {
    app.use(express.static(uiDist));
    app.get(/^\/(?!api\/|mcp).*/, (_req, res) => res.sendFile(join(uiDist, 'index.html')));
  }

  return app;
}
