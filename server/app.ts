import express from 'express';
import type Database from 'better-sqlite3';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  createProject,
  listProjects,
  removeProject,
  scaffoldProject,
  setArchived,
  uninstallContract,
} from './projects.js';
import {
  analysisComplete,
  docPath,
  listDocs,
  loadDocMap,
  markRequestHandled,
  setFrontmatterStatus,
} from './docs.js';
import { pickDirectoryNative } from './pick-directory.js';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import {
  detectEngines,
  engineFor,
  forgetDetectedEngines,
  selectedEngine,
  setSetting,
  ENGINES,
} from './engines.js';
import {
  abortRuns,
  advance,
  explainDoc,
  failStaleJobs,
  listJobs,
  nextStep,
  proposeRevision,
  removeRunLogs,
  recheckDependents,
  reviseDoc,
  runPlanning,
  runningDoc,
  runningJob,
} from './runner.js';
import { isChecking, readReadiness } from './readiness.js';
import { readFileSync, writeFileSync } from 'node:fs';
import type { Project } from './db.js';

export function buildApp(db: Database.Database, pkgRoot: string, dbPath: string): express.Express {
  failStaleJobs(db);
  const app = express();
  app.use(express.json());

  const kickChain = (project: Project) => {
    const engine = engineFor(db, project);
    if (engine) void advance(db, project, engine, pkgRoot);
  };

  // Read once at boot: this is the version of the code actually running, which
  // is not the version on disk after an upgrade the process never picked up.
  const version = (() => {
    try {
      return JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')).version as string;
    } catch {
      return '';
    }
  })();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, db: dbPath, version });
  });

  app.get('/api/projects', (_req, res) => {
    // Cards show one count (9/15) — settled the same way the group headers
    // count it: approved | not-applicable.
    const projects = listProjects(db).map((p) => {
      const docCounts = { settled: 0, total: 0 };
      try {
        for (const d of listDocs(db, p, pkgRoot)) {
          docCounts.total++;
          if (d.status === 'approved' || d.status === 'not-applicable') docCounts.settled++;
        }
      } catch {
        /* repo may be gone; the card still renders */
      }
      return { ...p, docCounts };
    });
    res.json({ projects });
  });

  app.post('/api/projects', (req, res) => {
    const { name, repoPath, kind, code, brief, docLang, engine } = req.body ?? {};
    try {
      const project = createProject(
        db,
        { name, repoPath, kind, code, brief, docLang, engine },
        pkgRoot,
      );
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
    forgetDetectedEngines(); // the user is looking at this list; read the disk again
    if (!ENGINES.some((e) => e.id === id)) return res.status(400).json({ error: 'unknown engine' });
    setSetting(db, 'engine', String(id));
    res.json({ selected: id });
  });

  // A project's own engine — changed mid-flight when a quota runs out. Only the
  // steps that start after it see the change; a running one finishes on the old CLI.
  app.put('/api/projects/:id/engine', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const { id } = req.body ?? {};
    if (!ENGINES.some((e) => e.id === id)) return res.status(400).json({ error: 'unknown engine' });
    db.prepare('UPDATE projects SET engine = ? WHERE id = ?').run(String(id), project.id);
    res.json({ engine: id });
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
    const engine = engineFor(db, project);
    if (!engine) return res.status(409).json({ error: 'no agent CLI installed' });
    const step = nextStep(db, project, pkgRoot);
    if (!step) {
      return res.status(409).json({
        error: runningJob(db, project.id) ? 'a step is already running' : 'nothing to run',
      });
    }
    void advance(db, project, engine, pkgRoot);
    res.status(202).json({ started: step.output });
  });

  // The readiness gate's standing verdict. Null until the brief is approved and
  // the gate has run once; `checking` covers the minute the judgment is out.
  app.get('/api/projects/:id/readiness', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    // No CLI, no analysis — say so here rather than letting Start do nothing.
    if (!engineFor(db, project)) {
      return res.json({
        readiness: {
          ready: false,
          stage: 'no-engine',
          questions: [
            'Kortext drives your own agent CLI; none is installed yet.',
            'Install one — claude, codex or gemini — then pick it in the header and press Start.',
          ],
          briefHash: '',
          checkedAt: new Date().toISOString(),
        },
        checking: false,
      });
    }
    res.json({ readiness: readReadiness(project), checking: isChecking(project.id) });
  });

  // Native folder chooser (macOS osascript; other platforms return null and
  // the UI falls back to a typed path).
  app.post('/api/pick-directory', (_req, res) => {
    void pickDirectoryNative().then((path) => res.json({ path }));
  });

  // Archive is a shelf, not a bin: the row and the repo both stay.
  app.post('/api/projects/:id/archive', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const archived = req.body?.archived !== false;
    setArchived(db, project.id, archived);
    res.json({ archived: archived ? 1 : 0 });
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
      // Pause FIRST. Aborting alone is not enough: the stopped steps settle, the
      // chain loop wakes, sees the documents still unwritten and starts them
      // again inside the very window we are waiting through — leaving CLIs
      // running for a project that is about to be wiped.
      db.prepare('UPDATE projects SET paused = 1 WHERE id = ?').run(project.id);
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
  // trace kortext wrote (.kortext/, .kopeng/, the AGENTS.md block and the
  // CLAUDE.md pointer) and the registry row. A hand-written AGENTS.md or
  // CLAUDE.md is the user's own file and survives.
  app.post('/api/projects/:id/cancel', async (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    try {
      // Pause before aborting, for the reason restart gives above.
      db.prepare('UPDATE projects SET paused = 1 WHERE id = ?').run(project.id);
      abortRuns(project.id);
      await new Promise((r) => setTimeout(r, 1500));
      rmSync(join(project.repo_path, '.kortext'), { recursive: true, force: true });
      rmSync(join(project.repo_path, '.kopeng'), { recursive: true, force: true });
      uninstallContract(project.repo_path);
      removeRunLogs(project.id);
      removeProject(db, project.id);
      // The row is gone, so nothing can pause the loop any more; anything that
      // slipped through between the abort and here is killed now.
      abortRuns(project.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  const projectOr404 = (id: string, res: express.Response): Project | undefined => {
    const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(id)) as
      Project | undefined;
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
    const { rel, content, settleRequests } = req.body ?? {};
    // A save with no content is a client bug, not an instruction to empty an
    // approved document: the frontmatter would go with the text, the document
    // would read as unwritten, and the chain would spend a run replacing what
    // the human had already approved.
    if (typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ error: 'content is required' });
    }
    try {
      writeFileSync(docPath(project, String(rel)), content, 'utf8');
      // Saving the agent's draft IS the answer to the demands that produced it.
      // Without this the change landed on disk and the request still stood, so
      // the document never left "Needs you" — the loop had no way to close.
      if (settleRequests) {
        for (const r of listDocs(db, project, pkgRoot).find((d) => d.rel === String(rel))
          ?.revisionRequests ?? []) {
          markRequestHandled(
            project,
            r.from,
            String(rel),
            r.reason,
            `applied — prime saved the change into ${rel}`,
          );
        }
      }
      // An edit changes the evidence, so the chain has to look again — editing
      // the brief is the whole way out of a closed gate, and a save that
      // changed nothing downstream is a no-op re-scan.
      kickChain(project);
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
      // Approving a document that was rewritten leaves every approved reader of
      // it standing on the old text. Judge each — silent on the first pass,
      // because nothing downstream is approved yet.
      const engine = engineFor(db, project);
      if (engine) recheckDependents(db, project, String(rel), engine, pkgRoot);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Human asked for changes: re-run the producing step with the notes.
  // The engine drafts the change another document demanded. The demands live in
  // the documents themselves, so the panel sends only the file — reading which
  // ones still stand is the server's job, not the caller's.
  app.post('/api/projects/:id/docs/propose', async (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const engine = engineFor(db, project);
    if (!engine) return res.status(409).json({ error: 'no agent CLI installed' });
    const { rel } = req.body ?? {};
    try {
      docPath(project, String(rel)); // validates rel
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
    const notes =
      listDocs(db, project, pkgRoot)
        .find((d) => d.rel === String(rel))
        ?.revisionRequests.map((r) => r.reason) ?? [];
    if (notes.length === 0) {
      return res.status(409).json({ error: `nothing is asking ${rel} to change` });
    }
    try {
      const { proposal } = await proposeRevision(project, String(rel), notes, engine, pkgRoot);
      res.json({ proposal });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/projects/:id/docs/revise', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const engine = engineFor(db, project);
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
    // The call is fire-and-forget, so anything that would make it refuse has to
    // be answered here — otherwise the panel reports success, clears the notes
    // and the answers are gone.
    if (!loadDocMap(pkgRoot, project.kind ?? 'new').has(String(rel))) {
      return res.status(409).json({ error: `${rel} is prime's own document — edit it here` });
    }
    if (runningDoc(db, project.id, String(rel))) {
      return res.status(409).json({ error: `${rel} is being rewritten — wait for it to land` });
    }
    void reviseDoc(db, project, String(rel), notes.map(String), engine, pkgRoot);
    res.status(202).json({ started: rel });
  });

  // One demand, one decision — taken from either end. The document that made
  // the request shows it too, so answering a question in STACK.md and settling
  // what STACK.md asked of the brief are the same sitting.
  app.post('/api/projects/:id/docs/decide-request', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const { target, from, reason, decision, instruction } = req.body ?? {};
    const rel = String(target ?? '');
    const doc = listDocs(db, project, pkgRoot).find((d) => d.rel === rel);
    if (!doc) return res.status(404).json({ error: `no such document: ${rel}` });
    const request = doc.revisionRequests.find(
      (r) => r.from === String(from ?? '') && r.reason === String(reason ?? ''),
    );
    if (!request) return res.status(409).json({ error: 'that request is already settled' });

    const said = String(instruction ?? '').trim();
    if (decision === 'dismiss') {
      markRequestHandled(
        project,
        request.from,
        rel,
        request.reason,
        said ? `dismissed by prime — ${said}` : 'dismissed by prime — no change made',
      );
      return res.json({ dismissed: 1 });
    }
    // Applying means the document is rewritten, so it needs an author. The
    // brief has none: it is prime's own, and its own drawer drafts the change.
    if (!doc.hasProducingStep) {
      return res
        .status(409)
        .json({ error: `${rel} is prime's own document — open it and draft the change there` });
    }
    const engine = engineFor(db, project);
    if (!engine) return res.status(409).json({ error: 'no agent CLI installed' });
    if (runningDoc(db, project.id, rel)) {
      return res.status(409).json({ error: `${rel} is being rewritten — wait for it to land` });
    }
    const notes = [`[${request.from} asks] ${request.reason}`];
    if (said) notes.push(`[prime decides] ${said}`);
    markRequestHandled(
      project,
      request.from,
      rel,
      request.reason,
      said
        ? `applied — the agent rewrote ${rel}; prime said: ${said}`
        : `applied — the agent rewrote ${rel}`,
    );
    setFrontmatterStatus(docPath(project, rel), 'draft');
    void reviseDoc(db, project, rel, notes, engine, pkgRoot);
    res.status(202).json({ started: rel, notes: notes.length });
  });

  // Line-anchored Q&A — synchronous, nothing persisted.
  app.post('/api/projects/:id/docs/explain', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const engine = engineFor(db, project);
    if (!engine) return res.status(409).json({ error: 'no agent CLI installed' });
    const { rel, excerpt, question } = req.body ?? {};
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'question required' });
    }
    const history = Array.isArray(req.body?.history)
      ? req.body.history.map((h: { q?: unknown; a?: unknown }) => ({
          q: String(h.q ?? ''),
          a: String(h.a ?? ''),
        }))
      : [];
    explainDoc(
      project,
      String(rel ?? ''),
      String(excerpt ?? ''),
      question,
      history,
      engine,
      pkgRoot,
    )
      .then((r) => res.json(r))
      .catch((err) => res.status(500).json({ error: (err as Error).message }));
  });

  // "Kopeng'e aktar": split the work into .kopeng/ files (one big plan job).
  app.post('/api/projects/:id/transfer', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const engine = engineFor(db, project);
    if (!engine) return res.status(409).json({ error: 'no agent CLI installed' });
    if (!analysisComplete(db, project, pkgRoot)) {
      return res.status(409).json({ error: 'analysis is not complete yet' });
    }
    if (runningJob(db, project.id))
      return res.status(409).json({ error: 'a job is already running' });
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
      status =
        readFileSync(join(dir, 'project.yaml'), 'utf8')
          .match(/^status:\s*(.+)$/m)?.[1]
          ?.trim() ?? null;
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
      writeFileSync(
        p,
        /^status:/m.test(body)
          ? body.replace(/^status:.*$/m, 'status: approved')
          : `status: approved
${body}`,
        'utf8',
      );
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

  // A missing /api route used to reach the SPA fallback, and the panel reported
  // "Unexpected token '<'" instead of the route it could not find.
  app.use('/api', (req, res) =>
    res.status(404).json({ error: `no such endpoint: ${req.method} ${req.originalUrl}` }),
  );

  // Built panel (ui/dist) with SPA fallback; in dev the vite server proxies /api here.
  const uiDist = join(pkgRoot, 'ui', 'dist');
  if (existsSync(uiDist)) {
    app.use(express.static(uiDist));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(uiDist, 'index.html')));
  }

  return app;
}
