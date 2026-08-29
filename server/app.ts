import express from 'express';
import type Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createProject, listProjects, removeProject, scaffoldProject } from './projects.js';
import { cancelRequest, createRequest, listRequests } from './requests.js';
import { handleMcpRequest } from './mcp.js';
import { docPath, listDocs, setFrontmatterStatus } from './docs.js';
import { generateChangeReport, listReports } from './reports.js';
import { pickDirectoryNative } from './pick-directory.js';
import { readFileSync, writeFileSync } from 'node:fs';
import type { Project } from './db.js';

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
    const { name, repoPath, mode, brief } = req.body ?? {};
    try {
      const project = createProject(
        db,
        { name, repoPath, mode: mode === 'new' ? 'new' : 'existing', brief },
        pkgRoot,
      );
      res.status(201).json({ project });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Native folder chooser (macOS osascript; other platforms return null and
  // the UI falls back to a typed path).
  app.post('/api/pick-directory', (_req, res) => {
    void pickDirectoryNative().then((path) => res.json({ path }));
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

  const projectOr404 = (id: string, res: express.Response): Project | undefined => {
    const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(id)) as
      | Project
      | undefined;
    if (!p) res.status(404).json({ error: 'project not found' });
    return p;
  };

  app.get('/api/projects/:id/docs', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    // Self-heal: idempotent re-scaffold fills anything missing (AGENTS.md,
    // workflows, skeletons) whenever the panel looks at a project.
    try {
      scaffoldProject(project.repo_path, pkgRoot);
    } catch {
      /* repo may be gone; listing still answers */
    }
    res.json({ docs: listDocs(db, project, pkgRoot) });
  });

  app.get('/api/projects/:id/docs/content', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    try {
      const rel = String(req.query.rel ?? '');
      res.json({ rel, content: readFileSync(docPath(project, rel), 'utf8') });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Direct edit from the drawer — writes the file as-is.
  app.put('/api/projects/:id/docs/content', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const { rel, content } = req.body ?? {};
    try {
      writeFileSync(docPath(project, String(rel)), String(content ?? ''), 'utf8');
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Prime approval: draft → approved (frontmatter is the source of truth).
  app.post('/api/projects/:id/docs/approve', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const { rel } = req.body ?? {};
    try {
      setFrontmatterStatus(docPath(project, String(rel)), 'approved');
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Plan state: whether planning was requested, and whether the outputs exist.
  app.get('/api/projects/:id/plan', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const kx = (rel: string) => join(project.repo_path, '.kortext', rel);
    const todoPath = kx('memory/TODO.md');
    const todoExists = existsSync(todoPath);
    const planningPending = listRequests(db, project.id, 'pending').some((r) => r.type === 'planning');
    let todoStatus: string | null = null;
    if (todoExists) {
      todoStatus =
        (readFileSync(todoPath, 'utf8').match(/^status:\s*(.+)$/m)?.[1] ?? 'draft').trim();
    }
    res.json({
      backlogExists: existsSync(kx('foundation/backlog.yaml')),
      todoExists,
      todoStatus,
      planningPending,
    });
  });

  app.get('/api/projects/:id/reports', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    res.json({ reports: listReports(project) });
  });

  // Deterministic: generated by kortext itself, no agent involved.
  app.post('/api/projects/:id/reports/change', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    try {
      res.status(201).json({ report: generateChangeReport(db, project, pkgRoot) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
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
