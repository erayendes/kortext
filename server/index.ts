import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectLayout, runtimeLayout } from './paths.ts';
import {
  ingestBacklogFile,
  ingestBacklogPatchFile,
  writeBacklogYamlFromDb,
} from './engine/backlog-ingest.ts';
import express from 'express';
import { env } from './config/env.ts';
import { healthRouter } from './routes/health.ts';
import { dbInfoRouter } from './routes/db-info.ts';
import { approvalRouter } from './routes/approvals.ts';
import { runsRouter } from './routes/runs.ts';
import { handoversRouter } from './routes/handovers.ts';
import { activityRouter } from './routes/activity.ts';
import { decisionsRouter } from './routes/decisions.ts';
import { reportsRouter } from './routes/reports.ts';
import { doctorRouter } from './routes/doctor.ts';
import { personasRouter } from './routes/personas.ts';
import { workflowsRouter } from './routes/workflows.ts';
import { backlogRouter } from './routes/backlog.ts';
import { docsRouter } from './routes/docs.ts';
import { blueprintRouter } from './routes/blueprint.ts';
import { driveRouter } from './routes/drive.ts';
import { projectMetaRouter } from './routes/project-meta.ts';
import { hooksRouter } from './routes/hooks.ts';
import { integrationsRouter } from './routes/integrations.ts';
import { envVarsRouter } from './routes/env-vars.ts';
import { startCommand } from './cli/commands.ts';
import { readProjectMeta, resolveBlueprintPaths } from './blueprint/io.ts';
import type { ExecutorKind } from './cli/executor-factory.ts';
import { getDb } from './db/client.ts';
import { ApprovalQueue } from './orchestrator/approval-queue.ts';
import { QueueGateController } from './orchestrator/queue-gate-controller.ts';
import { MarkdownSyncService } from './services/markdown-sync.ts';
import type { SafetyGuards } from './engine/worker-pool.ts';
import { mcpSseRouter } from '../mcp/sse.ts';
import { resumeOrphanedRuns } from './orchestrator/resume.ts';
import { makeServerDrive } from './orchestrator/server-drive.ts';
import { loadWorkflowsFromDir } from './engine/workflow-loader.ts';
import { loadPersonasFromDir } from './engine/persona-registry.ts';
import { findUnknownPersonas, SYNTHETIC_PERSONA_HANDLES } from './engine/consistency.ts';
import { syncRegistriesToDb } from './engine/index-sync.ts';

// Open DB + run migrations before the HTTP server starts accepting traffic.
const { schemaVersion, repositories: repos } = getDb();
console.log(`[kortext] db ready (schema v${schemaVersion})`);

// v3.1: persona / workflow / rule definitions are loaded from inside the
// kortext npm package (not the project). Per-project copies are gone.
const runtime = runtimeLayout();
const layout = projectLayout(process.cwd());
const workflowsDir = runtime.workflowsDir;
const agentsDir = runtime.agentsDir;
const workflowRegistry = loadWorkflowsFromDir(workflowsDir);
const personaRegistry = loadPersonasFromDir(agentsDir);
const wfErrors = workflowRegistry.errors();
const personaErrors = personaRegistry.errors();
console.log(
  `[kortext] workflows loaded: ${workflowRegistry.list().length} ok, ${wfErrors.length} error(s)`,
);
for (const err of wfErrors) {
  console.warn(`[kortext]   - ${err.file}: ${err.reason}`);
}
console.log(
  `[kortext] personas loaded: ${personaRegistry.list().length} ok, ${personaErrors.length} error(s)`,
);
for (const err of personaErrors) {
  console.warn(`[kortext]   - ${err.file}: ${err.reason}`);
}
// Cross-validate: every persona handle used in workflows must resolve.
// Synthetic handles (+prime human approver, +assignee/+approver dynamic
// tokens) have no agents/*.md file and are allowed to be missing.
const unknownPersonas = findUnknownPersonas(workflowRegistry, personaRegistry)
  .filter((f) => !SYNTHETIC_PERSONA_HANDLES.includes(f.persona));
if (unknownPersonas.length > 0) {
  console.warn(
    `[kortext] consistency: ${unknownPersonas.length} unknown persona reference(s):`,
  );
  for (const f of unknownPersonas) {
    console.warn(`[kortext]   - ${f.workflowId} (${f.stepKey}): ${f.persona}`);
  }
}

// Faz 12.8: project personas + workflow steps into SQL so the dashboard
// can run cross-cut queries. Parse-time validation lives here — an
// unknown persona handle in a workflow step throws and stops boot.
const indexSync = syncRegistriesToDb(
  { personas: personaRegistry, workflows: workflowRegistry },
  repos,
);
console.log(
  `[kortext] sql index: ${indexSync.personasUpserted} persona(s), ` +
    `${indexSync.workflowStepsUpserted} workflow step(s) upserted`,
);
if (indexSync.stepsWithoutPersona.length > 0) {
  console.log(
    `[kortext] sql index: ${indexSync.stepsWithoutPersona.length} step(s) skipped — no persona handle`,
  );
}

// Reconcile zombie runs left behind by a previous crash/restart.
const resumed = resumeOrphanedRuns(repos);
if (resumed.recovered.length > 0) {
  console.log(
    `[kortext] orphan recovery: ${resumed.recovered.length} run(s) moved to cancelled — retry with 'kortext retry <id>'`,
  );
}

const approvalQueue = new ApprovalQueue({ repos });
// Same queue instance the REST routes (GET /api/questions, POST .../answer)
// are mounted on — so a human's answer lands in the exact DB view the gate
// controller polls. Onboarding analysis pauses at each +prime gate through it.
const queueGateController = new QueueGateController(approvalQueue);

// Faz 12.9 follow-up: wire the reports-index back-fill into the worker
// pool's safety guard so per-file outputs (`<scope>_<slug>_<ts>.md`)
// written by the executor land in `reports_index` without an explicit
// `writeReport` MCP call. Errors are swallowed inside `runSafetyGuards`
// — index bookkeeping must not break a pipeline.
const markdownSync = new MarkdownSyncService(repos, { root: layout.root });
const safetyGuards: SafetyGuards = {
  outputIndexer: ({ absolutePath }) => {
    markdownSync.indexReportFromPath({ absolutePath });
  },
  // When a planning step writes the canonical backlog file, ingest it into real
  // backlog rows. Keyed on the filename so other outputs are ignored.
  //   - backlog.yaml        → full ingest (create/upsert whole items)
  //   - backlog.patch.yaml  → delta merge (enrichment steps patch only the
  //                           fields they change, so a 100-item plan stays fast)
  backlogIngester: ({ absolutePath }) => {
    const base = basename(absolutePath);
    // Read the project code from .kortext/project.json. The backlog file lives at
    // <root>/.kortext/foundation/backlog.yaml, so three dirname() hops reach the
    // project workspace root (foundation → .kortext → root) — which is exactly
    // what resolveBlueprintPaths expects (it re-appends `.kortext/project.json`).
    const projectRoot = dirname(dirname(dirname(absolutePath)));
    const meta = readProjectMeta(resolveBlueprintPaths(projectRoot).projectJsonPath);
    const ingestOpts = meta?.code ? { code: meta.code } : undefined;
    if (base === 'backlog.yaml') {
      ingestBacklogFile(repos, absolutePath, ingestOpts);
      // Normalize the file from the DB (e.g. surface synthesized epics).
      writeBacklogYamlFromDb(repos, absolutePath);
    } else if (base === 'backlog.patch.yaml') {
      ingestBacklogPatchFile(repos, absolutePath);
      // Re-serialize the canonical file so the NEXT persona reads the merged,
      // fully-enriched state instead of the stale step-1 skeleton.
      writeBacklogYamlFromDb(repos, join(dirname(absolutePath), 'backlog.yaml'));
    }
  },
};

// PATH lookup defaults when the wizard doesn't supply a custom binary path.
// `claude` and `agy` are both on PATH after their respective installers run;
// callers can override via the wizard's "binary path" field if needed.
function defaultBinaryFor(executor: ExecutorKind): string | undefined {
  if (executor === 'claude') return process.env.KORTEXT_CLAUDE_BIN ?? 'claude';
  if (executor === 'antigravity')
    return process.env.KORTEXT_ANTIGRAVITY_BIN ?? 'agy';
  if (executor === 'codex') return process.env.KORTEXT_CODEX_BIN ?? 'codex';
  if (executor === 'gemini') return process.env.KORTEXT_GEMINI_BIN ?? 'gemini';
  return undefined;
}

const app = express();

app.use(express.json());
app.use('/api', healthRouter);
app.use('/api', dbInfoRouter);
app.use('/api', approvalRouter({ repos, queue: approvalQueue }));
app.use('/api', runsRouter({ repos }));
app.use('/api', handoversRouter({ repos }));
app.use('/api', activityRouter({ repos }));
app.use('/api', decisionsRouter({ repos }));
app.use('/api', reportsRouter({ repos, projectRoot: layout.root }));
app.use('/api', backlogRouter({ repos, templatesDir: runtime.templatesDir, personas: personaRegistry }));
app.use('/api', personasRouter({ personas: personaRegistry, agentsDir, repos }));
app.use('/api', workflowsRouter({ workflows: workflowRegistry, repos }));
app.use('/api', doctorRouter({ repos, workflows: workflowRegistry, personas: personaRegistry }));
// Settings panes — project-scoped config (Faz A "vitrin" wiring).
app.use('/api', projectMetaRouter({ workspaceRoot: process.cwd() }));
app.use('/api', hooksRouter({ projectRoot: process.cwd() }));
app.use('/api', integrationsRouter({ projectRoot: process.cwd() }));
app.use('/api', envVarsRouter({ projectRoot: process.cwd() }));
app.use(
  '/api',
  blueprintRouter({
    workspaceRoot: process.cwd(),
    onApproved: (workflowId) => {
      // Read the executor choice from project.json (written by the wizard).
      // Falls back to 'mock' when project.json is missing or malformed —
      // safer default than crashing the trigger.
      const projectMeta = readProjectMeta(
        resolveBlueprintPaths(process.cwd()).projectJsonPath,
      );
      const executor = projectMeta?.executor ?? 'mock';
      const executorBinary =
        projectMeta?.executorBinary ?? defaultBinaryFor(executor);

      console.log(
        `[kortext] blueprint trigger: workflow=${workflowId} executor=${executor}` +
          (executorBinary ? ` binary=${executorBinary}` : ''),
      );

      // Fire-and-forget: the wizard returns 201 immediately while the
      // analysis pipeline runs in the background. Failures land in the
      // run row + audit log; the dashboard surfaces them.
      void startCommand({
        repos,
        workflowsDir,
        workflowId,
        executor,
        executorBinary,
        agentsDir,
        safety: safetyGuards,
        // Pause at each +prime artifact-approval gate and wait for the human
        // (via the approval queue) before continuing. Same queue the REST
        // routes use, so a dashboard answer resumes the run.
        gateController: queueGateController,
        // Onboarding runs analysis → planning (which derives the backlog), then
        // stops. Building backlog items stays the gated driver's job.
        chainThroughWorkflowId: 'planning-pipeline',
      }).then((result) => {
        if (!result.ok) {
          console.warn(`[kortext] blueprint trigger failed: ${result.errorMessage}`);
        } else {
          console.log(
            `[kortext] blueprint trigger ok: workflow=${workflowId} run=${result.runId} status=${result.status}`,
          );
        }
      });
    },
  }),
);
// §5.16 — the manual "start button": POST /api/drive runs one autonomous driver
// pass (to_do → done for ready items, real git). Locked behind
// KORTEXT_DRIVE_ENABLED (OFF by default), so mounting it keeps production
// blast-radius at zero — the runtime is built lazily on the first ARMED drive,
// nothing happens at boot. Executor is resolved from project.json exactly like
// the blueprint trigger (mock fallback).
const serverDrive = makeServerDrive({
  repos,
  personas: personaRegistry,
  workflows: workflowRegistry,
  queue: approvalQueue,
  repoRoot: process.cwd(),
  agentsDir,
  enabled: () => env.KORTEXT_DRIVE_ENABLED,
  resolveExecutor: () => {
    const meta = readProjectMeta(resolveBlueprintPaths(process.cwd()).projectJsonPath);
    const kind = meta?.executor ?? 'mock';
    return { kind, binary: meta?.executorBinary ?? defaultBinaryFor(kind) };
  },
});
app.use('/api', driveRouter({ enabled: serverDrive.enabled, drive: serverDrive.drive }));

app.use(
  '/api',
  docsRouter({
    scopes: {
      foundation: layout.foundation,
      references: layout.references,
      reports: layout.reports,
      memory: layout.memory,
      // Rules + workflows are read-only paket içeriği — sourced from the
      // npm package, not the project.
      rules: runtime.rulesDir,
      workflows: runtime.workflowsDir,
    },
  }),
);
// MCP over SSE for dashboard / remote clients.
app.use(
  mcpSseRouter({
    repos,
    workflows: workflowRegistry,
    personas: personaRegistry,
    queue: approvalQueue,
    workspaceRoot: process.cwd(),
    workflowsDir,
  }),
);

// Serve the compiled dashboard (Vite output) when present. In compiled
// layout `server/index.ts` lives at `dist/server/index.js`, so the
// dashboard is `../web`. In source layout (`tsx watch`), no dist/web
// exists — Vite dev server handles the UI in its own process.
// KORTEXT_PACKAGE_ROOT is set by `kortext serve --mode=prod` so the
// resolution survives any caller cwd; otherwise we walk up from this file.
function resolveWebDist(): string | null {
  const env = process.env.KORTEXT_PACKAGE_ROOT;
  if (env) {
    const candidate = join(env, 'dist', 'web');
    return existsSync(join(candidate, 'index.html')) ? candidate : null;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  for (const rel of ['../web', '../../dist/web']) {
    const candidate = resolve(here, rel);
    if (existsSync(join(candidate, 'index.html'))) return candidate;
  }
  return null;
}

const webDist = resolveWebDist();
if (webDist) {
  console.log(`[kortext] dashboard mounted from ${webDist}`);
  app.use(express.static(webDist));
  // Hash-router SPA fallback: anything not under /api or /mcp that hasn't
  // matched yet should return index.html so deep links (e.g. /board) work.
  // We use a middleware (not `app.get(regex)`) because Express 5's path-to-
  // regexp dropped support for negative lookaheads — a plain `req.path`
  // check is both clearer and version-proof.
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api/') || req.path.startsWith('/mcp/')) return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/mcp')) return next();
    res.sendFile(join(webDist, 'index.html'));
  });
} else {
  console.log('[kortext] no dist/web found — backend-only (dev: use vite separately)');
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[kortext]', err);
  res.status(500).json({ error: 'internal_error', message: err.message });
});

const server = app.listen(env.KORTEXT_PORT, () => {
  console.log(`[kortext] server listening on http://localhost:${env.KORTEXT_PORT}`);
});
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[kortext] port ${env.KORTEXT_PORT} is already in use. Another project (or a stale daemon) is on it.\n` +
        `          Pick another port (KORTEXT_PORT=...) or run \`kortext list\` / \`kortext stop\`.`,
    );
    process.exit(1);
  }
  console.error('[kortext] server error:', err);
  process.exit(1);
});

const shutdown = (signal: string) => {
  console.log(`[kortext] received ${signal}, closing`);
  server.close(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
