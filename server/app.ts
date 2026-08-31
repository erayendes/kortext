import express from 'express';
import type Database from 'better-sqlite3';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createProject, deriveCode, listProjects, removeProject, scaffoldProject } from './projects.js';
import { analysisComplete, docPath, listDocs, setFrontmatterStatus } from './docs.js';
import { pickDirectoryNative } from './pick-directory.js';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { detectEngines, selectedEngine, setSetting, ENGINES } from './engines.js';
import { abortRuns, advance, explainDoc, failStaleJobs, listJobs, nextStep, reviseDoc, runPlanning, runningJob } from './runner.js';
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
    // Cards show per-group progress (core 5/14 · foundation 1/3) — counted the
    // same way the group headers count: approved | not-applicable | log = settled.
    const projects = listProjects(db).map((p) => {
      const docCounts = {
        core: { settled: 0, total: 0 },
        foundation: { settled: 0, total: 0 },
      };
      try {
        for (const d of listDocs(db, p, pkgRoot)) {
          const g = docCounts[d.group];
          g.total++;
          if (d.status === 'approved' || d.status === 'not-applicable' || d.status === 'log') {
            g.settled++;
          }
        }
      } catch {
        /* repo may be gone; the card still renders */
      }
      return { ...p, docCounts };
    });
    res.json({ projects });
  });

  app.post('/api/projects', (req, res) => {
    const { name, repoPath, kind, code, brief } = req.body ?? {};
    try {
      const project = createProject(db, { name, repoPath, kind, code, brief }, pkgRoot);
      // Nothing runs on Add — the project lands paused and the user presses
      // Start on the project screen (Start = the unpause endpoint).
      db.prepare('UPDATE projects SET paused = 1 WHERE id = ?').run(project.id);
      res.status(201).json({ project: { ...project, paused: 1 } });
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

  // Pause = the automatic chain stops starting new steps (a running one
  // finishes); continue flips it back and kicks the chain.
  app.post('/api/projects/:id/pause', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const paused = req.body?.paused ? 1 : 0;
    db.prepare('UPDATE projects SET paused = ? WHERE id = ?').run(paused, project.id);
    if (paused) abortRuns(project.id);
    else kickChain({ ...project, paused: 0 });
    res.json({ paused: !!paused });
  });

  // Restart: wipe the produced files and re-run the analysis from scratch.
  app.post('/api/projects/:id/restart', async (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    try {
      abortRuns(project.id);
      // Give SIGTERM a moment so a dying CLI can't rewrite the wiped files.
      await new Promise((r) => setTimeout(r, 1500));
      rmSync(join(project.repo_path, '.kortext'), { recursive: true, force: true });
      rmSync(join(project.repo_path, '.kopeng'), { recursive: true, force: true });
      db.prepare('DELETE FROM jobs WHERE project_id = ?').run(project.id);
      scaffoldProject(project.repo_path, pkgRoot, { skipBrief: project.kind === 'existing' });
      // Restart lands in the same ready state as a fresh Add: nothing runs
      // until the user presses Start.
      db.prepare('UPDATE projects SET paused = 1 WHERE id = ?').run(project.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Cancel: the user is done with kortext for this project — remove every
  // trace from the repo (.kortext/, .kopeng/, AGENTS.md) and the registry row.
  app.post('/api/projects/:id/cancel', async (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    try {
      abortRuns(project.id);
      await new Promise((r) => setTimeout(r, 1500));
      rmSync(join(project.repo_path, '.kortext'), { recursive: true, force: true });
      rmSync(join(project.repo_path, '.kopeng'), { recursive: true, force: true });
      rmSync(join(project.repo_path, 'AGENTS.md'), { force: true });
      removeProject(db, project.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
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

  // Built panel (ui/dist) with SPA fallback; in dev the vite server proxies /api here.
  const uiDist = join(pkgRoot, 'ui', 'dist');
  if (existsSync(uiDist)) {
    app.use(express.static(uiDist));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(uiDist, 'index.html')));
  }

  return app;
}
