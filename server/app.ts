import express from 'express';
import type Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createProject, deriveCode, listProjects, removeProject, scaffoldProject } from './projects.js';
import { cancelRequest, completeRequest, createRequest, listRequests } from './requests.js';
import { PERSONAS, WORKFLOWS, handleMcpRequest } from './mcp.js';
import { analysisComplete, docPath, listDocs, setFrontmatterStatus, workflowNameFor } from './docs.js';
import { generateChangeReport, listReports } from './reports.js';
import { pickDirectoryNative } from './pick-directory.js';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { detectEngines, selectedEngine, setSetting, ENGINES } from './engines.js';
import { advance, explainDoc, failStaleJobs, listJobs, nextStep, reviseDoc, runPlanning, runningJob } from './runner.js';
import { readFileSync, writeFileSync } from 'node:fs';
import type { Project } from './db.js';

export function buildApp(db: Database.Database, pkgRoot: string, dbPath: string): express.Express {
  failStaleJobs(db);
  // Projects created before the code column existed get one derived from the name.
  for (const p of db.prepare("SELECT id, name FROM projects WHERE code = ''").all() as {
    id: number;
    name: string;
  }[]) {
    db.prepare('UPDATE projects SET code = ? WHERE id = ?').run(deriveCode(p.name), p.id);
  }
  const app = express();
  app.use(express.json());

  const kickChain = (project: Project) => {
    const engine = selectedEngine(db);
    if (engine) void advance(db, project, engine, pkgRoot);
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, db: dbPath });
  });

  app.get('/api/projects', (_req, res) => {
    res.json({ projects: listProjects(db) });
  });

  app.post('/api/projects', (req, res) => {
    const { name, repoPath, kind, code, brief } = req.body ?? {};
    try {
      const project = createProject(db, { name, repoPath, kind, code, brief }, pkgRoot);
      // Initialize: an approved brief starts the chain; existing projects
      // have no brief gate — they start straight from the code.
      if (brief || project.kind === 'existing') kickChain(project);
      res.status(201).json({ project });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/engines', (_req, res) => {
    res.json({ engines: detectEngines(), selected: selectedEngine(db)?.id ?? null });
  });

  app.put('/api/engines', (req, res) => {
    const { id } = req.body ?? {};
    if (!ENGINES.some((e) => e.id === id)) return res.status(400).json({ error: 'unknown engine' });
    setSetting(db, 'engine', String(id));
    res.json({ selected: id });
  });

  app.get('/api/projects/:id/jobs', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    res.json({ jobs: listJobs(db, project.id), running: runningJob(db, project.id) ?? null });
  });

  // Kick the next producible analysis step (fire-and-forget; the panel polls
  // jobs + docs to watch it land). R2 turns approval into the trigger.
  app.post('/api/projects/:id/run-next', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const engine = selectedEngine(db);
    if (!engine) return res.status(409).json({ error: 'no agent CLI installed' });
    const step = nextStep(db, project, pkgRoot);
    if (!step) {
      return res
        .status(409)
        .json({ error: runningJob(db, project.id) ? 'a step is already running' : 'nothing to run' });
    }
    void advance(db, project, engine, pkgRoot);
    res.status(202).json({ started: step.output });
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
      // A report request carries its template along — the agent needs nothing
      // from the project folder to know the expected structure.
      let enriched = payload;
      if (type === 'report' && payload?.report_type) {
        const file = payload.report_type === 'risk' ? 'risk-report.md' : 'decision-summary.md';
        const tpl = join(pkgRoot, 'templates', 'reports', file);
        if (existsSync(tpl)) enriched = { ...payload, template: readFileSync(tpl, 'utf8') };
      }
      res.status(201).json({ request: createRequest(db, Number(req.params.id), type, enriched) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/requests/:id/cancel', (req, res) => {
    res.json({ cancelled: cancelRequest(db, Number(req.params.id)) });
  });

  app.post('/api/requests/:id/complete', (req, res) => {
    res.json({ completed: completeRequest(db, Number(req.params.id)) });
  });

  // ---- Agent-facing REST fallback ------------------------------------------
  // Mirrors the MCP tools over plain HTTP so an agent whose MCP connection
  // isn't live yet (mcp add takes effect next session) can continue with curl.
  app.get('/api/agent/context', (req, res) => {
    const repoPath = String(req.query.repo_path ?? '');
    const project = db.prepare('SELECT * FROM projects WHERE repo_path = ?').get(repoPath) as
      | Project
      | undefined;
    if (!project) return res.status(404).json({ error: `no kortext project registered at ${repoPath}` });
    res.json({
      project,
      docs: listDocs(db, project, pkgRoot).map((d) => ({
        rel: d.rel,
        status: d.status,
        blocked: d.blocked,
        revisionPending: d.revisionPending,
      })),
      pending_requests: listRequests(db, project.id, 'pending').map((r) => ({
        id: r.id,
        type: r.type,
        payload: JSON.parse(r.payload),
      })),
      workflow: workflowNameFor(project.kind ?? 'new'),
    });
  });

  app.get('/api/agent/workflow/:name', (req, res) => {
    const name = req.params.name as (typeof WORKFLOWS)[number];
    if (!WORKFLOWS.includes(name)) return res.status(404).json({ error: 'unknown workflow' });
    res.type('text/markdown').send(readFileSync(join(pkgRoot, 'workflows', `${name}.md`), 'utf8'));
  });

  app.get('/api/agent/persona/:handle', (req, res) => {
    const handle = req.params.handle as (typeof PERSONAS)[number];
    if (!PERSONAS.includes(handle)) return res.status(404).json({ error: 'unknown persona' });
    res.type('text/markdown').send(readFileSync(join(pkgRoot, 'agents', `${handle}.md`), 'utf8'));
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
      scaffoldProject(project.repo_path, pkgRoot, { skipBrief: project.kind === 'existing' });
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
      kickChain(project);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Human asked for changes: re-run the producing step with the notes.
  app.post('/api/projects/:id/docs/revise', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const engine = selectedEngine(db);
    if (!engine) return res.status(409).json({ error: 'no agent CLI installed' });
    const { rel, notes } = req.body ?? {};
    if (!Array.isArray(notes) || notes.length === 0) {
      return res.status(400).json({ error: 'notes required' });
    }
    try {
      docPath(project, String(rel)); // validates rel
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
    void reviseDoc(db, project, String(rel), notes.map(String), engine, pkgRoot);
    res.status(202).json({ started: rel });
  });

  // Line-anchored Q&A — synchronous, nothing persisted.
  app.post('/api/projects/:id/docs/explain', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const engine = selectedEngine(db);
    if (!engine) return res.status(409).json({ error: 'no agent CLI installed' });
    const { rel, excerpt, question } = req.body ?? {};
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'question required' });
    }
    const history = Array.isArray(req.body?.history)
      ? req.body.history.map((h: { q?: unknown; a?: unknown }) => ({ q: String(h.q ?? ''), a: String(h.a ?? '') }))
      : [];
    explainDoc(project, String(rel ?? ''), String(excerpt ?? ''), question, history, engine, pkgRoot)
      .then((r) => res.json(r))
      .catch((err) => res.status(500).json({ error: (err as Error).message }));
  });

  // "Kopeng'e aktar": split the work into .kopeng/ files (one big plan job).
  app.post('/api/projects/:id/transfer', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const engine = selectedEngine(db);
    if (!engine) return res.status(409).json({ error: 'no agent CLI installed' });
    if (!analysisComplete(db, project, pkgRoot)) {
      return res.status(409).json({ error: 'analysis is not complete yet' });
    }
    if (runningJob(db, project.id)) return res.status(409).json({ error: 'a job is already running' });
    const notes = Array.isArray(req.body?.notes) ? req.body.notes.map(String) : [];
    void runPlanning(db, project, engine, pkgRoot, notes);
    res.status(202).json({ started: '.kopeng/' });
  });

  // Plan summary: what the split produced + its approval status.
  app.get('/api/projects/:id/kopeng', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const dir = join(project.repo_path, '.kopeng');
    const count = (sub: string, ext: string) => {
      try {
        return readdirSync(join(dir, sub)).filter((f) => f.endsWith(ext)).length;
      } catch {
        return 0;
      }
    };
    let status: string | null = null;
    try {
      status = readFileSync(join(dir, 'project.yaml'), 'utf8').match(/^status:\s*(.+)$/m)?.[1]?.trim() ?? null;
    } catch {
      /* not produced yet */
    }
    res.json({
      exists: status !== null,
      status,
      versions: count('versions', '.yaml'),
      epics: count('epics', '.yaml'),
      tasks: count('tasks', '.md'),
    });
  });

  // Prime approves the plan — the last act of the handshake.
  app.post('/api/projects/:id/kopeng/approve', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const p = join(project.repo_path, '.kopeng', 'project.yaml');
    try {
      const body = readFileSync(p, 'utf8');
      writeFileSync(p, /^status:/m.test(body) ? body.replace(/^status:.*$/m, 'status: approved') : `status: approved
${body}`, 'utf8');
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Handshake state: analysis done? kopeng around? tasks already exported?
  app.get('/api/projects/:id/handshake', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const kopengDir = join(project.repo_path, '.kopeng');
    let transferred = false;
    try {
      transferred = readdirSync(kopengDir).length > 0;
    } catch {
      /* no .kopeng dir */
    }
    res.json({
      analysisComplete: analysisComplete(db, project, pkgRoot),
      kopengInstalled: spawnSync('which', ['kopeng'], { stdio: 'ignore' }).status === 0,
      transferred,
    });
  });

  // Plan state: whether planning was requested, and whether the outputs exist.
  app.get('/api/projects/:id/plan', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const kx = (rel: string) => join(project.repo_path, '.kortext', rel);
    const todoPath = kx('TODO.md');
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
    void handleMcpRequest(db, pkgRoot, req, res);
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
