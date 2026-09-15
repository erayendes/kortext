import express from 'express';
import type Database from 'better-sqlite3';
import { existsSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import {
  createProject,
  listProjects,
  removeProject,
  scaffoldOptional,
  scaffoldProject,
  setArchived,
  uninstallContract,
} from './projects.js';
import {
  analysisComplete,
  asked,
  deliverRequests,
  discardOutgoing,
  docPath,
  docVersion,
  listDocs,
  loadDocMap,
  listVersions,
  markRequestHandled,
  readVersion,
  removeRequest,
  recordVersion,
  setFrontmatterStatus,
  templateFor,
  unfilledPlaceholders,
} from './docs.js';
import { renderDesignPreview, writeDesignPreview } from './design-preview.js';
import { pickDirectoryNative } from './pick-directory.js';
import { readdirSync } from 'node:fs';
import {
  detectEngines,
  engineFor,
  forgetDetectedEngines,
  onPath,
  selectedEngine,
  setSetting,
  ENGINES,
} from './engines.js';
import {
  abortRuns,
  advance,
  explainDoc,
  failStaleJobs,
  hasActiveRuns,
  listJobs,
  runStep,
  nextStep,
  proposeRevision,
  removeRunLogs,
  recheckDependents,
  reviseDoc,
  resumeStoppedRevisions,
  runPlanning,
  runningDoc,
  writingDoc,
  runningJob,
} from './runner.js';
import { isChecking, readReadiness } from './readiness.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { logRootDir, type Project } from './db.js';
import { channelOf, distTags, isNewer, selfUpdate } from './update.js';

export function buildApp(db: Database.Database, pkgRoot: string, dbPath: string): express.Express {
  failStaleJobs(db);
  const app = express();

  // Reject non-loopback Host/Origin values to prevent DNS rebinding and cross-site requests
  // from reading or deleting project files. Simple POST requests do not require a preflight.
  // Allow local development ports and normalize hostname case while preserving bracketed IPv6.
  const isLocal = (value: string | undefined): boolean => {
    if (!value) return false;
    const host = value
      .replace(/^\w+:\/\//, '')
      .replace(/:\d+$/, '')
      .toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  };
  app.use((req, res, next) => {
    if (!isLocal(req.headers.host)) {
      return res.status(403).json({ error: 'kortext answers on localhost only' });
    }
    // Same-origin fetches from the panel send no Origin on GET and the panel's
    // own origin on the rest; a cross-site request always carries the attacker's.
    const origin = req.headers.origin;
    if (origin !== undefined && !isLocal(origin)) {
      return res.status(403).json({ error: 'cross-origin requests are refused' });
    }
    next();
  });

  app.use(express.json());

  let updating = false;
  let resetting = 0;
  // The whole package is replaced: block every API reader/writer, including
  // polling's scaffold, until npm finishes. Health uses only boot-time data.
  app.use('/api', (req, res, next) => {
    if (updating && req.path !== '/health') {
      return res.status(409).json({ error: 'kortext is updating — wait for it to finish' });
    }
    next();
  });

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

  // The menu bar app polls with its own user agent; the panel hides its
  // download line while one has been heard from lately.
  let companionSeenAt = 0;
  app.use('/api', (req, _res, next) => {
    if (req.get('user-agent')?.startsWith('Kortext-mac/')) companionSeenAt = Date.now();
    next();
  });
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, db: dbPath, version, companion: Date.now() - companionSeenAt < 30_000 });
  });

  const stepRunning = () =>
    resetting > 0 ||
    hasActiveRuns() ||
    !!db.prepare("SELECT 1 FROM jobs WHERE status = 'running' LIMIT 1").get();

  // Refuse shutdown while work is active; closing the browser tab does not stop the server.
  app.post('/api/quit', (_req, res) => {
    if (stepRunning()) {
      return res.status(409).json({ error: 'a step is running — wait for it, then quit' });
    }
    res.json({ ok: true });
    // Flush the response before exiting so the client can confirm shutdown.
    setTimeout(() => process.exit(0), 100);
  });

  // Offer self-update only for package paths under node_modules, excluding normal dev checkouts.
  const managed = pkgRoot.includes(`${sep}node_modules${sep}`);

  // Both channels, and whether the running one has moved on; `?fresh=1` skips the hour's cache.
  app.get('/api/version', async (req, res) => {
    const tags = managed ? await distTags(req.query.fresh === '1') : {};
    const want = tags[channelOf(version)];
    res.json({
      current: version,
      latest: tags.latest ?? null,
      beta: tags.beta ?? null,
      stale: !!want && isNewer(want, version),
    });
  });

  // Installing replaces files on disk; the running process keeps its boot-time version until restarted.
  app.post('/api/version/update', async (req, res) => {
    if (!managed) return res.status(400).json({ error: 'not an npm install — update it yourself' });
    // Wait for active work before npm replaces files read by the runner.
    if (stepRunning()) {
      return res.status(409).json({ error: 'a step is running — wait for it, then update' });
    }
    updating = true;
    try {
      // `tag` picks the channel; without one the running channel is kept. `latest` walks a beta back.
      const tag = req.body?.tag;
      const result = await selfUpdate(
        tag === 'beta' || tag === 'latest' ? tag : channelOf(version),
      );
      res.status(result.ok ? 200 : 500).json(result);
    } finally {
      updating = false;
    }
  });

  app.get('/api/projects', (_req, res) => {
    // Count approved and not-applicable documents as settled.
    const projects = listProjects(db).map((p) => {
      const docCounts = { settled: 0, total: 0 };
      try {
        for (const d of listDocs(db, p, pkgRoot)) {
          if (d.optional && d.status === 'uninitialized' && !asked(db, p, d.rel)) continue;   // not asked for: not owed
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
    // The picker's model and effort, chosen before the project existed; the
    // same words the PUT routes accept, and only ones the CLI knows.
    const spec = ENGINES.find((e) => e.id === engine);
    const model = String(req.body?.model ?? '').trim();
    const effort = String(req.body?.effort ?? '').trim();
    if (model.length > 80 || /[\s"'`]/.test(model))
      return res.status(400).json({ error: 'a model name is one word' });
    if (effort && !spec?.efforts?.includes(effort))
      return res.status(400).json({ error: `${engine} takes no effort level "${effort}"` });
    try {
      const project = createProject(
        db,
        { name, repoPath, kind, code, brief, docLang, engine },
        pkgRoot,
      );
      // Nothing runs on Add — the project lands paused and the user presses
      // Start on the project screen (Start = the unpause endpoint).
      db.prepare('UPDATE projects SET paused = 1, model = ?, effort = ? WHERE id = ?').run(
        model,
        effort,
        project.id,
      );
      res.status(201).json({ project: { ...project, paused: 1, model, effort } });
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
    // A model name belongs to one CLI — `sonnet` means nothing to codex — so a
    // switch drops it back to the new CLI's default unless the new CLI knows it.
    const next = ENGINES.find((e) => e.id === id);
    const keeps = next?.models.includes(project.model ?? '') ?? false;
    const keepsEffort = next?.efforts?.includes(project.effort ?? '') ?? false;
    db.prepare('UPDATE projects SET engine = ?, model = ?, effort = ? WHERE id = ?').run(
      String(id),
      keeps ? project.model : '',
      keepsEffort ? project.effort : '',
      project.id,
    );
    res.json({
      engine: id,
      model: keeps ? project.model : '',
      effort: keepsEffort ? project.effort : '',
    });
  });

  // The model that CLI is told to use — free text, because each CLI names its
  // models its own way and a new one appears before this list would. Empty
  // means the CLI's own default. Like the engine, only later steps see it.
  app.put('/api/projects/:id/model', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const model = String(req.body?.model ?? '').trim();
    if (model.length > 80 || /[\s"'`]/.test(model))
      return res.status(400).json({ error: 'a model name is one word' });
    db.prepare('UPDATE projects SET model = ? WHERE id = ?').run(model, project.id);
    res.json({ model });
  });

  // Reasoning effort, from the list the CLI accepts; empty is its default.
  app.put('/api/projects/:id/effort', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const effort = String(req.body?.effort ?? '').trim();
    const spec = ENGINES.find((e) => e.id === project.engine);
    if (effort && !spec?.efforts?.includes(effort))
      return res.status(400).json({ error: `${project.engine} takes no effort level "${effort}"` });
    db.prepare('UPDATE projects SET effort = ? WHERE id = ?').run(effort, project.id);
    res.json({ effort });
  });

  app.get('/api/projects/:id/jobs', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    // `paused` rides along so a panel learns of a pause made elsewhere — the menu bar app, another tab.
    res.json({
      jobs: listJobs(db, project.id),
      running: runningJob(db, project.id) ?? null,
      paused: !!project.paused,
    });
  });

  // Start the chain asynchronously; the panel polls jobs and documents for progress.
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

  app.post('/api/projects/:id/docs/retry', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const rel = String(req.body?.rel ?? '');
    const job = listJobs(db, project.id).find((j) => j.doc_rel === rel);
    if (!job || !['failed', 'stopped'].includes(job.status)) {
      return res.status(409).json({ error: 'no failed attempt to retry' });
    }
    if (project.paused || runningDoc(db, project.id, rel)) {
      return res
        .status(409)
        .json({ error: 'Continue the project and wait for this document to finish' });
    }
    const engine = engineFor(db, project);
    if (!engine) return res.status(409).json({ error: 'no agent CLI installed' });
    if (job.kind === 'recheck') {
      void advance(db, project, engine, pkgRoot);
    } else {
      const step = loadDocMap(pkgRoot, project.kind ?? 'new').get(rel);
      const doc = listDocs(db, project, pkgRoot).find((d) => d.rel === rel);
      if (!step || doc?.blocked)
        return res.status(409).json({ error: 'document inputs are not settled' });
      const notes = JSON.parse(job.notes) as string[];
      if (notes.length) void reviseDoc(db, project, rel, notes, engine, pkgRoot);
      else
        void runStep(db, project, step, engine, pkgRoot).then((out) => {
          if (out.ok) kickChain(project);
        });
    }
    res.status(202).json({ started: rel });
  });

  // Prime asks for an on-request document — the one press that starts it.
  app.post('/api/projects/:id/docs/request', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const rel = String(req.body?.rel ?? '');
    const step = loadDocMap(pkgRoot, project.kind ?? 'new').get(rel);
    const doc = listDocs(db, project, pkgRoot).find((d) => d.rel === rel);
    if (!step?.optional || !doc) return res.status(404).json({ error: 'not an on-request document' });
    if (doc.status !== 'uninitialized' || asked(db, project, rel))
      return res.status(409).json({ error: `${rel} was already asked for — see it in the list` });
    if (doc.blocked) return res.status(409).json({ error: 'document inputs are not settled' });
    if (project.paused || runningDoc(db, project.id, rel))
      return res.status(409).json({ error: 'Continue the project and wait for this document to finish' });
    const engine = engineFor(db, project);
    if (!engine) return res.status(409).json({ error: 'no agent CLI installed' });
    void runStep(db, project, step, engine, pkgRoot).then((out) => {
      if (out.ok) kickChain(project);
    });
    res.status(202).json({ started: rel });
  });

  // Return the latest readiness verdict and whether a check is active.
  app.get('/api/projects/:id/readiness', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    // Expose a missing CLI as an actionable readiness error.
    if (!engineFor(db, project)) {
      return res.json({
        readiness: {
          ready: false,
          stage: 'no-engine',
          questions: [
            'Kortext drives your own agent CLI; none is installed yet.',
            'Install one — claude, codex, antigravity or gemini — then pick it in the header and press Start.',
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

  // Archive without deleting the registry row or project files.
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

  // Pause aborts active runs and stops scheduling; Continue resumes interrupted work and the chain.
  app.post('/api/projects/:id/pause', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const paused = req.body?.paused ? 1 : 0;
    db.prepare('UPDATE projects SET paused = ? WHERE id = ?').run(paused, project.id);
    if (paused) abortRuns(project.id);
    else {
      const resumed = { ...project, paused: 0 };
      const engine = engineFor(db, resumed);
      // A revision the pause stopped left the document at approved or
      // not-applicable, where the chain cannot see it. Pick those up first.
      if (engine) void resumeStoppedRevisions(db, resumed, engine, pkgRoot);
      kickChain(resumed);
    }
    res.json({ paused: !!paused });
  });

  // Restart: reset analysis outputs, keeping the human's brief and independent Kopeng work.
  app.post('/api/projects/:id/restart', async (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    resetting++;
    try {
      // Pause before aborting so the chain cannot schedule more steps while cleanup waits.
      db.prepare('UPDATE projects SET paused = 1 WHERE id = ?').run(project.id);
      abortRuns(project.id);
      // Wait longer than SIGTERM-to-SIGKILL escalation before deleting files the CLI may write.
      await new Promise((r) => setTimeout(r, 2500));
      const kortext = join(project.repo_path, '.kortext');
      if (existsSync(kortext)) {
        // Leave the brief in place: deleting then restoring risks losing it on a crash.
        for (const name of readdirSync(kortext)) {
          if (name !== 'BRIEF.md') rmSync(join(kortext, name), { recursive: true, force: true });
        }
      }
      db.prepare('DELETE FROM jobs WHERE project_id = ?').run(project.id);
      db.prepare('DELETE FROM pending_rechecks WHERE project_id = ?').run(project.id);
      scaffoldProject(project.repo_path, pkgRoot, { skipBrief: project.kind === 'existing' });
      // Restart lands in the same ready state as a fresh Add: nothing runs
      // until the user presses Start.
      db.prepare('UPDATE projects SET paused = 1 WHERE id = ?').run(project.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    } finally {
      resetting--;
    }
  });

  // Cancel: the user is done with kortext for this project — remove every
  // trace of its analysis (.kortext/, the AGENTS.md block and the CLAUDE.md
  // pointer) and the registry row. Kopeng is independent and stays, as does
  // the user's own content in AGENTS.md and CLAUDE.md.
  app.post('/api/projects/:id/cancel', async (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    resetting++;
    try {
      // Pause before aborting, for the reason restart gives above.
      db.prepare('UPDATE projects SET paused = 1 WHERE id = ?').run(project.id);
      abortRuns(project.id);
      await new Promise((r) => setTimeout(r, 2500)); // as restart: outlast the SIGKILL escalation
      rmSync(join(project.repo_path, '.kortext'), { recursive: true, force: true });
      uninstallContract(project.repo_path);
      removeRunLogs(project.id, logRootDir(db));
      removeProject(db, project.id);
      // Abort any run registered during the cleanup delay.
      abortRuns(project.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    } finally {
      resetting--;
    }
  });

  const projectOr404 = (id: string, res: express.Response): Project | undefined => {
    const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(id)) as
      Project | undefined;
    if (!p) res.status(404).json({ error: 'project not found' });
    return p;
  };

  // Both actions must apply to the exact text the person reviewed. A running
  // writer is refused even if it has not changed the file yet.
  const reviewedPath = (project: Project, req: express.Request, res: express.Response) => {
    const { rel, expectedVersion } = req.body ?? {};
    const path = docPath(project, String(rel));
    if (writingDoc(db, project.id, String(rel))) {
      res.status(409).json({ error: `${rel} is being rewritten — wait for it to land` });
      return null;
    }
    if (typeof expectedVersion !== 'string') {
      res.status(428).json({ error: 'Reload the document before saving or approving it' });
      return null;
    }
    if (docVersion(readFileSync(path, 'utf8')) !== expectedVersion) {
      res.status(409).json({
        error: 'This document changed. Keep your edits, then reopen it to review the latest text.',
      });
      return null;
    }
    return path;
  };

  app.get('/api/projects/:id/docs', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    // Restore missing document skeletons and refresh the contract block during polling.
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
      const content = readFileSync(docPath(project, rel), 'utf8');
      res.json({ rel, content, version: docVersion(content) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // What this document said before. Only writes that rewrote the prose are here.
  app.get('/api/projects/:id/docs/history', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const rel = String(req.query.rel ?? '');
    if (!docPath(project, rel)) return res.status(400).json({ error: 'rel required' });
    res.json({ versions: listVersions(db, project, rel) });
  });

  app.get('/api/projects/:id/docs/history/:versionId', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const row = readVersion(db, project, Number(req.params.versionId));
    if (!row) return res.status(404).json({ error: 'no such version' });
    res.json(row);
  });

  // Direct edit from the drawer — writes the file as-is.
  app.put('/api/projects/:id/docs/content', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const { rel, content, settleRequests } = req.body ?? {};
    // Reject empty saves to prevent accidental loss of document contents and approval state.
    if (typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ error: 'content is required' });
    }
    try {
      const path = reviewedPath(project, req, res);
      if (!path) return;
      const wasApproved =
        listDocs(db, project, pkgRoot).find((d) => d.rel === String(rel))?.status === 'approved';
      const priorText = readFileSync(path, 'utf8');
      writeFileSync(path, content, 'utf8');
      recordVersion(
        db,
        project,
        String(rel),
        content,
        settleRequests ? 'proposal' : 'prime',
        priorText,
      );
      writeDesignPreview(project);
      // Saving a requested proposal settles its incoming revision requests.
      if (settleRequests) {
        for (const r of listDocs(db, project, pkgRoot).find((d) => d.rel === String(rel))
          ?.revisionRequests ?? []) {
          removeRequest(project, String(rel), r.from, r.reason);
        }
      }
      // Re-evaluate readiness and producibility after edits.
      kickChain(project);
      // Recheck approved readers against the updated source document.
      if (wasApproved) {
        const engine = engineFor(db, project);
        recheckDependents(db, project, String(rel), engine, pkgRoot);
      }
      const saved = readFileSync(path, 'utf8');
      res.json({ ok: true, content: saved, version: docVersion(saved) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Render the current DESIGN.md tokens on each preview request.
  app.get('/api/projects/:id/docs/design-preview', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const path = join(project.repo_path, '.kortext', 'DESIGN.md');
    if (!existsSync(path)) return res.status(404).json({ error: 'no DESIGN.md in this project' });
    const html = renderDesignPreview(readFileSync(path, 'utf8'), project.name);
    // Also left on disk, so the page is shareable without the panel running.
    try {
      writeDesignPreview(project);
    } catch {
      /* read-only repo still gets the page in the browser */
    }
    res.type('html').send(html);
  });

  // Prime approval: draft → approved (frontmatter is the source of truth).
  app.post('/api/projects/:id/docs/approve', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const { rel, force } = req.body ?? {};
    try {
      const path = reviewedPath(project, req, res);
      if (!path) return;
      const doc = listDocs(db, project, pkgRoot).find((d) => d.rel === String(rel));
      if (doc?.status !== 'draft' || doc.openQuestions || doc.outgoing.length > 0) {
        return res.status(409).json({
          error:
            'Only a draft with no open questions and no unsent change requests can be approved',
        });
      }
      // Template lines the agent never replaced. A real test approved a
      // DATABASE.md still carrying `### Table: `[table_name]``, which then reads
      // as an approved database design. Prime can still insist.
      if (!force) {
        const left = unfilledPlaceholders(
          readFileSync(path, 'utf8'),
          templateFor(pkgRoot, doc.rel),
        );
        if (left.length > 0) {
          return res.status(409).json({
            error: 'This document still carries template placeholders',
            placeholders: left,
          });
        }
      }
      setFrontmatterStatus(path, 'approved');
      // Every request this document sends went out with prime's Send before
      // approval could pass; this sweep is for documents approved before
      // requests travelled.
      deliverRequests(project, String(rel));
      // Approving edits the file, so without this the recorded head no longer
      // matches what is on disk and the panel refuses to diff — the diff would
      // vanish the moment prime approved, although the body never changed.
      recordVersion(db, project, String(rel), readFileSync(path, 'utf8'), 'prime', null);
      writeDesignPreview(project);
      kickChain(project);
      // Recheck already-approved readers; there are none on the initial pass.
      const engine = engineFor(db, project);
      recheckDependents(db, project, String(rel), engine, pkgRoot);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Draft the incoming revision requests from the documents, rather than accepting notes from the client.
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
      const { proposal } = await proposeRevision(db, project, String(rel), notes, engine, pkgRoot);
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
    // Validate before returning 202 so a rejected revision does not discard the client's notes.
    if (!loadDocMap(pkgRoot, project.kind ?? 'new').has(String(rel))) {
      return res.status(409).json({ error: `${rel} is prime's own document — edit it here` });
    }
    if (runningDoc(db, project.id, String(rel))) {
      return res.status(409).json({ error: `${rel} is being rewritten — wait for it to land` });
    }
    void reviseDoc(db, project, String(rel), notes.map(String), engine, pkgRoot);
    res.status(202).json({ started: rel });
  });

  /*
   * There is no route to settle a finding or a conflict. Both are records the
   * next writer reads, not decisions owed to prime — a conflict was already
   * decided when the change request was denied, and a finding names a file no
   * document owns. Settling them was asking prime twice.
   */

  /**
   * Settle everything owed on one document in a single decision.
   *
   * Prime's answers to the questions, the change requests they accepted and the
   * ones they denied all arrive together, because they all rewrite the same
   * document and a document is rewritten once. Sent separately, the first press
   * would start a run and the rest would come back refused.
   *
   * A denied request stays in the document, ticked, with prime's reason under
   * it: the asking is settled, the contradiction is not, and the next agent to
   * rewrite this document reads that here.
   */
  app.post('/api/projects/:id/docs/settle-requests', (req, res) => {
    const project = projectOr404(req.params.id, res);
    if (!project) return;
    const { rel, apply, deny, answers, send, discard } = req.body ?? {};
    const doc = listDocs(db, project, pkgRoot).find((d) => d.rel === String(rel ?? ''));
    if (!doc) return res.status(404).json({ error: `no such document: ${rel}` });
    const pick = (list: unknown) =>
      (Array.isArray(list) ? list : [])
        .map((r: { from?: unknown; reason?: unknown; note?: unknown }) => {
          const found = doc.revisionRequests.find(
            (x) => x.from === String(r.from ?? '') && x.reason === String(r.reason ?? ''),
          );
          return found ? { ...found, note: String(r.note ?? '').trim() } : undefined;
        })
        .filter((r): r is { from: string; reason: string; note: string } => !!r);
    const applying = pick(apply);
    const denying = pick(deny);
    const said = (Array.isArray(answers) ? answers : []).map(String).filter((a) => a.trim());
    // What this document asks of others: sent now, or dropped before it goes.
    const pickOut = (list: unknown) =>
      (Array.isArray(list) ? list : [])
        .map((r: { target?: unknown; reason?: unknown }) =>
          doc.outgoing.find(
            (x) => x.target === String(r.target ?? '') && x.reason === String(r.reason ?? ''),
          ),
        )
        .filter((r): r is { target: string; reason: string } => !!r);
    const sending = pickOut(send);
    const discarding = pickOut(discard);
    if (
      applying.length === 0 &&
      denying.length === 0 &&
      said.length === 0 &&
      sending.length === 0 &&
      discarding.length === 0
    ) {
      return res.status(409).json({ error: 'there is nothing left to settle here' });
    }
    for (const r of discarding) discardOutgoing(project, doc.rel, r.target, r.reason);
    // Accepted where it was asked: the line lands at the target with that
    // written under it, and the target opens with it already ticked. Prime
    // decided once; the target's own Apply carries it into one rewrite with
    // everything else owed there, and prime can still untick it.
    if (sending.length > 0) deliverRequests(project, doc.rel, sending, `accepted on ${doc.rel}`);
    // A refusal goes into the document's `## Decisions`, reason under it. That
    // line IS the record — the next agent to rewrite this document reads it
    // there, and the build phase inherits it from there.
    for (const r of denying) {
      markRequestHandled(project, doc.rel, r.from, r.reason, r.note || 'no change made');
    }
    // Denials, sends and discards change nothing in the text; nothing to rewrite.
    if (applying.length === 0 && said.length === 0)
      return res.json({
        applied: 0,
        denied: denying.length,
        sent: sending.length,
        discarded: discarding.length,
      });

    if (!doc.hasProducingStep) {
      return res
        .status(409)
        .json({ error: `${doc.rel} is prime's own document — open it and draft the change there` });
    }
    const engine = engineFor(db, project);
    if (!engine) return res.status(409).json({ error: 'no agent CLI installed' });
    if (runningDoc(db, project.id, doc.rel)) {
      return res.status(409).json({ error: `${doc.rel} is being rewritten — wait for it to land` });
    }
    setFrontmatterStatus(docPath(project, doc.rel), 'draft');
    void reviseDoc(
      db,
      project,
      doc.rel,
      [
        ...said,
        ...applying.flatMap((r) =>
          r.note
            ? [`[${r.from} asks] ${r.reason}`, `[prime decides] ${r.note}`]
            : [`[${r.from} asks] ${r.reason}`],
        ),
      ],
      engine,
      pkgRoot,
    ).catch((err) => console.error(`settle-requests follow-up failed for ${doc.rel}:`, err));
    res.status(202).json({
      applied: applying.length,
      denied: denying.length,
      answered: said.length,
      sent: sending.length,
      discarded: discarding.length,
    });
  });

  // Return line-anchored Q&A without modifying documents; CLI output is logged.
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
      db,
      project,
      String(rel ?? ''),
      String(excerpt ?? ''),
      question,
      history,
      engine,
      pkgRoot,
    )
      // The answer carries its author: the project's own CLI, which is not
      // always the one the global setting names.
      .then((r) => res.json({ ...r, answeredBy: engine.id }))
      .catch((err) => res.status(500).json({ error: (err as Error).message }));
  });

  // Export the completed analysis as a Kopeng plan.
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
    // A plan is approvable when the split finished and left tasks behind — a
    // failed split leaves project.yaml too, and an empty plan approved is a
    // handshake over nothing.
    const last = listJobs(db, project.id).find((j) => j.doc_rel === '.kopeng/');
    if (last && last.status !== 'done') {
      return res
        .status(409)
        .json({ error: `the last split ${last.status}: ${last.error ?? 'retry it first'}` });
    }
    let tasks = 0;
    try {
      tasks = readdirSync(join(project.repo_path, '.kopeng', 'tasks')).filter((f) =>
        f.endsWith('.md'),
      ).length;
    } catch {
      /* no tasks dir */
    }
    if (tasks === 0) return res.status(409).json({ error: 'the plan has no tasks to approve' });
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
    // The handover, counted rather than gated: a conflict or a finding is work
    // deferred to the build phase, and prime should see how much of it there is
    // without being asked to settle any of it here.
    scaffoldOptional(project.repo_path, pkgRoot, project.kind ?? 'new');
    const all = listDocs(db, project, pkgRoot);
    const docs = all.filter((d) => d.status !== 'uninitialized');
    // What can still be asked for: an on-request document not yet written, whose
    // inputs all stand — an input ruled not-applicable takes the offer with it.
    const nap = new Set(all.filter((d) => d.status === 'not-applicable').map((d) => d.rel));
    const onRequest = all
      .filter((d) => d.optional && d.status === 'uninitialized' && !d.blocked && !asked(db, project, d.rel))
      .filter((d) => !d.inputs.some((i) => nap.has(i)))
      .map((d) => d.rel);
    res.json({
      analysisComplete: analysisComplete(db, project, pkgRoot),
      onRequest,
      kopengInstalled: onPath('kopeng'),
      transferred,
      documents: docs.length,
      handedOver: docs.reduce(
        (n, d) => n + d.denied.length + d.conflicts.length + d.warnings.length,
        0,
      ),
    });
  });

  // Return JSON for unknown API routes instead of serving the HTML application shell.
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
