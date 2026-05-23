import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { env } from './config/env.ts';
import { healthRouter } from './routes/health.ts';
import { dbInfoRouter } from './routes/db-info.ts';
import { approvalRouter } from './routes/approvals.ts';
import { runsRouter } from './routes/runs.ts';
import { handoversRouter } from './routes/handovers.ts';
import { decisionsRouter } from './routes/decisions.ts';
import { doctorRouter } from './routes/doctor.ts';
import { personasRouter } from './routes/personas.ts';
import { workflowsRouter } from './routes/workflows.ts';
import { backlogRouter } from './routes/backlog.ts';
import { docsRouter } from './routes/docs.ts';
import { blueprintRouter } from './routes/blueprint.ts';
import { startCommand } from './cli/commands.ts';
import { getDb } from './db/client.ts';
import { ApprovalQueue } from './orchestrator/approval-queue.ts';
import { mcpSseRouter } from '../mcp/sse.ts';
import { resumeOrphanedRuns } from './orchestrator/resume.ts';
import { loadWorkflowsFromDir } from './engine/workflow-loader.ts';
import { loadPersonasFromDir } from './engine/persona-registry.ts';
import { findUnknownPersonas } from './engine/consistency.ts';

// Open DB + run migrations before the HTTP server starts accepting traffic.
const { schemaVersion, repositories: repos } = getDb();
console.log(`[kortext] db ready (schema v${schemaVersion})`);

// Load workflow + persona definitions from disk into in-memory registries.
// Faz 5.5+: these become the source for `loadWorkflowById` and persona
// dispatch when the orchestrator is wired into the server process.
const workflowsDir = resolve(process.cwd(), 'workflows');
const agentsDir = resolve(process.cwd(), 'agents');
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
// '+prime' is the human-in-the-loop and is allowed to be missing.
const unknownPersonas = findUnknownPersonas(workflowRegistry, personaRegistry)
  .filter((f) => f.persona !== '+prime');
if (unknownPersonas.length > 0) {
  console.warn(
    `[kortext] consistency: ${unknownPersonas.length} unknown persona reference(s):`,
  );
  for (const f of unknownPersonas) {
    console.warn(`[kortext]   - ${f.workflowId} (${f.stepKey}): ${f.persona}`);
  }
}

// Reconcile zombie runs left behind by a previous crash/restart.
const resumed = resumeOrphanedRuns(repos);
if (resumed.recovered.length > 0) {
  console.log(
    `[kortext] orphan recovery: ${resumed.recovered.length} run(s) moved to cancelled — retry with 'kortext retry <id>'`,
  );
}

const approvalQueue = new ApprovalQueue({ repos });

const app = express();

app.use(express.json());
app.use('/api', healthRouter);
app.use('/api', dbInfoRouter);
app.use('/api', approvalRouter({ repos, queue: approvalQueue }));
app.use('/api', runsRouter({ repos }));
app.use('/api', handoversRouter({ repos }));
app.use('/api', decisionsRouter({ repos }));
app.use('/api', backlogRouter({ repos }));
app.use('/api', personasRouter({ personas: personaRegistry, agentsDir }));
app.use('/api', workflowsRouter({ workflows: workflowRegistry }));
app.use('/api', doctorRouter({ repos, workflows: workflowRegistry, personas: personaRegistry }));
app.use(
  '/api',
  blueprintRouter({
    workspaceRoot: process.cwd(),
    onApproved: (workflowId) => {
      // Fire-and-forget: the wizard returns 201 immediately while the
      // analysis pipeline runs in the background. Failures land in the
      // run row + audit log; the dashboard surfaces them.
      void startCommand({
        repos,
        workflowsDir,
        workflowId,
        executor: 'mock',
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
app.use(
  '/api',
  docsRouter({
    scopes: {
      references: resolve(process.cwd(), 'workspace/references'),
      reports: resolve(process.cwd(), 'workspace/reports'),
      memory: resolve(process.cwd(), 'workspace/memory'),
      rules: resolve(process.cwd(), 'rules'),
      workflows: workflowsDir,
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
  app.get(/^\/(?!api\/|mcp\/).*/, (_req, res) => {
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

const shutdown = (signal: string) => {
  console.log(`[kortext] received ${signal}, closing`);
  server.close(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
