/**
 * Kortext MCP server — programmatic interface to the runtime.
 *
 * The factory `createKortextMcpServer({...})` builds and returns an
 * `McpServer` instance with all 15 tools registered. Transports (stdio for
 * `kortext mcp`, SSE for dashboard) connect to it via `.connect(transport)`.
 *
 * Why factory + deps? Tests, CLI, and HTTP host all share the same surface
 * — pass in pre-built repositories, registries, queue, etc. No singleton.
 *
 * Tool contract: every handler returns a CallToolResult with a JSON text
 * payload (so MCP clients render them as structured) plus `structuredContent`
 * when applicable. Errors throw — the SDK serializes them as JSON-RPC errors.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Repositories } from '../server/db/repositories/index.ts';
import type { WorkflowRegistry } from '../server/engine/workflow-loader.ts';
import type { PersonaRegistry } from '../server/engine/persona-registry.ts';
import type { ApprovalQueue } from '../server/orchestrator/approval-queue.ts';
import { runDoctor } from '../server/cli/doctor.ts';
import {
  startCommand,
  type StartCommandResult,
} from '../server/cli/commands.ts';
import type { ExecutorKind } from '../server/cli/executor-factory.ts';
import {
  BacklogItemTypeSchema,
  BacklogStatusSchema,
} from '../server/db/schemas.ts';

export type KortextMcpDeps = {
  repos: Repositories;
  workflows: WorkflowRegistry;
  personas: PersonaRegistry;
  queue: ApprovalQueue;
  /** Absolute path to the workspace root (cwd). */
  workspaceRoot: string;
  /** Where workflow markdown lives, used by start_pipeline. Defaults to <root>/workflows. */
  workflowsDir?: string;
  /** Blueprint absolute path. Defaults to <root>/.kortext/foundation/BRD.md. */
  blueprintPath?: string;
};

/**
 * Read the package version from the nearest package.json above this file.
 * Source path is `mcp/server.ts`; compiled path is `dist/mcp/server.js`.
 * Same walk-up pattern bin/kortext.ts uses — keeps the SERVER_INFO version
 * in sync with package.json without a hardcoded literal that drifts.
 */
function readPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  let cursor = here;
  for (let i = 0; i < 6; i++) {
    const pkgPath = join(cursor, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
        if (pkg.version) return pkg.version;
      } catch {
        // fall through
      }
    }
    const parent = resolve(cursor, '..');
    if (parent === cursor) break;
    cursor = parent;
  }
  return 'unknown';
}

const SERVER_INFO = {
  name: 'kortext',
  version: readPackageVersion(),
  title: 'Kortext autonomous agent runtime',
} as const;

const EXECUTOR_KIND = z.enum(['mock', 'claude', 'codex', 'gemini']);

/** Build the CallToolResult envelope from a JSON-serializable payload. */
function jsonResult(payload: unknown) {
  const text = JSON.stringify(payload, null, 2);
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent:
      typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)
        : { value: payload },
  };
}

/** Wrap a thrown error into a tool-error CallToolResult (`isError: true`). */
function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  };
}

export function createKortextMcpServer(deps: KortextMcpDeps): McpServer {
  const server = new McpServer(SERVER_INFO);
  const root = deps.workspaceRoot;
  const workflowsDir = deps.workflowsDir ?? resolve(root, 'workflows');
  const blueprintPath =
    deps.blueprintPath ?? resolve(root, '.kortext/foundation/BRD.md');

  registerWorkflowTools(server, deps);
  registerBacklogTools(server, deps);
  registerRunTools(server, deps, workflowsDir);
  registerApprovalTools(server, deps);
  registerContextTools(server, deps);
  registerHandoverTools(server, deps);
  registerLogTools(server, deps);
  registerBlueprintTools(server, deps, blueprintPath);
  registerStatusTool(server, deps);

  return server;
}

// ----------------------------------------------------------------------------
// list_workflows + list_personas + list_pipelines
// ----------------------------------------------------------------------------

function registerWorkflowTools(server: McpServer, deps: KortextMcpDeps): void {
  server.registerTool(
    'list_workflows',
    {
      title: 'List workflows',
      description: 'Returns every workflow definition loaded from /workflows.',
      inputSchema: {},
    },
    async () => {
      const items = deps.workflows.list().map((w) => ({
        id: w.id,
        title: w.title,
        steps: w.steps.length,
        gates: w.gates.length,
        startCommand: w.startCommand,
        nextWorkflowId: w.nextWorkflowId ?? null,
      }));
      return jsonResult({ workflows: items });
    },
  );

  server.registerTool(
    'list_personas',
    {
      title: 'List personas',
      description:
        'Returns every persona handle registered under /agents (+frontend-engineer, …).',
      inputSchema: {},
    },
    async () => {
      const items = deps.personas.list().map((p) => ({
        handle: p.handle,
        id: p.id,
        description: p.description,
      }));
      return jsonResult({ personas: items });
    },
  );

  server.registerTool(
    'list_pipelines',
    {
      title: 'List pipelines (workflows + recent runs)',
      description:
        'Per-workflow summary: workflow id/title + the most recent N runs (default 5) with their status.',
      inputSchema: {
        recent_limit: z
          .number()
          .int()
          .positive()
          .max(50)
          .optional()
          .describe('How many recent runs per workflow (default 5).'),
      },
    },
    async ({ recent_limit }) => {
      const limit = recent_limit ?? 5;
      const items = deps.workflows.list().map((w) => {
        const runs = deps.repos.runs.listRuns({
          workflow_id: w.id,
          limit,
        });
        return {
          workflow_id: w.id,
          title: w.title,
          steps: w.steps.length,
          recent_runs: runs.map((r) => ({
            id: r.id,
            status: r.status,
            triggered_by: r.triggered_by,
            created_at: r.created_at,
            ended_at: r.ended_at,
          })),
        };
      });
      return jsonResult({ pipelines: items });
    },
  );
}

// ----------------------------------------------------------------------------
// list_backlog + add_backlog_item + transition_item
// ----------------------------------------------------------------------------

function registerBacklogTools(server: McpServer, deps: KortextMcpDeps): void {
  server.registerTool(
    'list_backlog',
    {
      title: 'List backlog items',
      description:
        'Filter backlog items by type/status/owner/parent_id. Returns id, title, status, owner, parent_id.',
      inputSchema: {
        type: BacklogItemTypeSchema.optional(),
        status: BacklogStatusSchema.optional(),
        owner: z.string().optional(),
        parent_id: z.string().optional(),
        limit: z.number().int().positive().max(500).optional(),
      },
    },
    async ({ type, status, owner, parent_id, limit }) => {
      const items = deps.repos.backlog.list({
        type: type ?? null,
        status: status ?? null,
        owner: owner ?? null,
        parent_id: parent_id ?? null,
        limit: limit ?? 100,
      });
      return jsonResult({
        items: items.map((it) => ({
          id: it.id,
          type: it.type,
          title: it.title,
          status: it.status,
          owner: it.owner,
          parent_id: it.parent_id,
          version: it.version,
          updated_at: it.updated_at,
        })),
      });
    },
  );

  server.registerTool(
    'add_backlog_item',
    {
      title: 'Add a backlog item',
      description:
        'Create a new backlog row (task/bug/debt/epic/spike/hotfix). id must be unique.',
      inputSchema: {
        id: z.string().min(1).describe('Stable id, e.g. "T-042" or "BUG-7".'),
        type: BacklogItemTypeSchema,
        title: z.string().min(1),
        status: BacklogStatusSchema.optional(),
        owner: z.string().optional(),
        parent_id: z.string().optional(),
        version: z.string().optional(),
        body_md: z.string().optional(),
        frontmatter: z.record(z.unknown()).optional(),
      },
    },
    async (input) => {
      try {
        const created = deps.repos.backlog.create({
          id: input.id,
          type: input.type,
          title: input.title,
          status: input.status ?? 'to_do',
          owner: input.owner ?? null,
          parent_id: input.parent_id ?? null,
          version: input.version ?? null,
          frontmatter: input.frontmatter ?? {},
          body_md: input.body_md ?? '',
        });
        deps.repos.auditLog.append({
          actor: 'mcp',
          action: 'backlog.create',
          resource_type: 'backlog_item',
          resource_id: created.id,
          payload: { type: created.type, title: created.title },
        });
        return jsonResult({ item: created });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    'transition_item',
    {
      title: 'Transition a backlog item status',
      description: 'Set a new status on a backlog item (to_do/in_progress/blocked/review/done/cancelled).',
      inputSchema: {
        id: z.string().min(1),
        status: BacklogStatusSchema,
      },
    },
    async ({ id, status }) => {
      try {
        const updated = deps.repos.backlog.transitionStatus(id, status);
        deps.repos.auditLog.append({
          actor: 'mcp',
          action: 'backlog.transition',
          resource_type: 'backlog_item',
          resource_id: id,
          payload: { to: status },
        });
        return jsonResult({ item: updated });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );
}

// ----------------------------------------------------------------------------
// get_pipeline + start_pipeline
// ----------------------------------------------------------------------------

function registerRunTools(
  server: McpServer,
  deps: KortextMcpDeps,
  workflowsDir: string,
): void {
  server.registerTool(
    'get_pipeline',
    {
      title: 'Get a single run (with steps)',
      description:
        'Returns the run row + its ordered steps. `run_id` is the numeric run id from list_pipelines.',
      inputSchema: {
        run_id: z.number().int().positive(),
      },
    },
    async ({ run_id }) => {
      const run = deps.repos.runs.getRun(run_id);
      if (!run) return errorResult(`run not found: ${run_id}`);
      const steps = deps.repos.runs.listSteps(run_id);
      return jsonResult({ run, steps });
    },
  );

  server.registerTool(
    'start_pipeline',
    {
      title: 'Start a workflow run',
      description:
        'Runs a workflow synchronously through the worker pool and returns the final run record. Use executor="mock" for safe smoke runs; claude/codex/gemini require the binary to be configured (env KORTEXT_<KIND>_BIN or `binary`).',
      inputSchema: {
        workflow_id: z.string().min(1),
        executor: EXECUTOR_KIND.optional().describe('Default "mock".'),
        binary: z.string().optional().describe('Path to the CLI binary for non-mock executors.'),
      },
    },
    async ({ workflow_id, executor, binary }) => {
      const kind = (executor ?? 'mock') as ExecutorKind;
      let result: StartCommandResult;
      try {
        result = await startCommand({
          repos: deps.repos,
          workflowsDir,
          workflowId: workflow_id,
          executor: kind,
          executorBinary: binary,
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      if (!result.ok) {
        return errorResult(result.errorMessage);
      }
      return jsonResult({
        ok: true,
        run_id: result.runId,
        status: result.status,
        failed_step_key: result.failedStepKey ?? null,
        executor: kind,
      });
    },
  );
}

// ----------------------------------------------------------------------------
// list_pending_questions + respond_to_question
// ----------------------------------------------------------------------------

function registerApprovalTools(server: McpServer, deps: KortextMcpDeps): void {
  server.registerTool(
    'list_pending_questions',
    {
      title: 'List open approval questions',
      description: 'Returns every pending_question row with status=open, oldest first.',
      inputSchema: {},
    },
    async () => {
      const questions = deps.repos.pendingQuestions.listOpen();
      return jsonResult({ questions });
    },
  );

  server.registerTool(
    'respond_to_question',
    {
      title: 'Answer a pending question',
      description:
        'Posts an answer to a pending_question (gate, +prime decision, secret triage). Question must still be open.',
      inputSchema: {
        question_id: z.number().int().positive(),
        answer: z.string().min(1),
        answered_by: z.string().min(1).describe('Persona handle or user id, e.g. "+prime" or "mcp:client".'),
      },
    },
    async ({ question_id, answer, answered_by }) => {
      try {
        const answered = deps.queue.answer(question_id, answer, answered_by);
        return jsonResult({ question: answered });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );
}

// ----------------------------------------------------------------------------
// get_context
// ----------------------------------------------------------------------------

function registerContextTools(server: McpServer, deps: KortextMcpDeps): void {
  server.registerTool(
    'get_context',
    {
      title: 'Get a persona context',
      description:
        'Returns the context row for (persona, item_id). item_id may be omitted for the persona-level context.',
      inputSchema: {
        persona: z.string().min(1).describe('Persona handle, e.g. "+backend-developer".'),
        item_id: z.string().nullable().optional(),
      },
    },
    async ({ persona, item_id }) => {
      const ctx = deps.repos.contexts.get(persona, item_id ?? null);
      if (!ctx) return jsonResult({ context: null });
      return jsonResult({ context: ctx });
    },
  );
}

// ----------------------------------------------------------------------------
// handover
// ----------------------------------------------------------------------------

function registerHandoverTools(server: McpServer, deps: KortextMcpDeps): void {
  server.registerTool(
    'handover',
    {
      title: 'Create a handover',
      description:
        'Records an inter-persona handover (from → to) on an item. Stores the payload + optional markdown reference.',
      inputSchema: {
        from_persona: z.string().min(1),
        to_persona: z.string().min(1),
        item_id: z.string().optional(),
        reason: z.string().optional(),
        context_payload: z.record(z.unknown()).optional(),
        markdown_path: z.string().optional(),
      },
    },
    async (input) => {
      try {
        const created = deps.repos.handovers.create({
          from_persona: input.from_persona,
          to_persona: input.to_persona,
          item_id: input.item_id ?? null,
          reason: input.reason ?? null,
          context_payload: input.context_payload ?? {},
          markdown_path: input.markdown_path ?? null,
        });
        deps.repos.auditLog.append({
          actor: 'mcp',
          action: 'handover.create',
          resource_type: 'handover',
          resource_id: String(created.id),
          payload: {
            from: input.from_persona,
            to: input.to_persona,
            item_id: input.item_id ?? null,
          },
        });
        return jsonResult({ handover: created });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );
}

// ----------------------------------------------------------------------------
// get_logs
// ----------------------------------------------------------------------------

function registerLogTools(server: McpServer, deps: KortextMcpDeps): void {
  server.registerTool(
    'get_logs',
    {
      title: 'Read the audit log',
      description:
        'Returns audit_log rows newest-first. All filters optional. Use `since` (unix ms) to tail.',
      inputSchema: {
        actor: z.string().optional(),
        action: z.string().optional(),
        resource_type: z.string().optional(),
        resource_id: z.string().optional(),
        since: z.number().int().nonnegative().optional(),
        limit: z.number().int().positive().max(500).optional(),
      },
    },
    async (input) => {
      const rows = deps.repos.auditLog.list({
        actor: input.actor ?? null,
        action: input.action ?? null,
        resource_type: input.resource_type ?? null,
        resource_id: input.resource_id ?? null,
        since: input.since ?? null,
        limit: input.limit ?? 100,
      });
      return jsonResult({ entries: rows });
    },
  );
}

// ----------------------------------------------------------------------------
// read_blueprint + approve_blueprint
// ----------------------------------------------------------------------------

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

function parseBlueprintFrontmatter(source: string): {
  frontmatter: Record<string, string>;
  body: string;
  raw: string;
} {
  const m = source.match(FRONTMATTER_RE);
  if (!m) return { frontmatter: {}, body: source, raw: '' };
  const raw = m[1] ?? '';
  const frontmatter: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const kv = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (kv) frontmatter[kv[1]!] = kv[2]!.trim();
  }
  return { frontmatter, body: source.slice(m[0].length), raw };
}

function writeBlueprintStatus(filePath: string, newStatus: string): {
  previous: string | null;
  current: string;
} {
  const source = readFileSync(filePath, 'utf8');
  const { frontmatter, body, raw } = parseBlueprintFrontmatter(source);
  const previous = frontmatter.status ?? null;
  frontmatter.status = newStatus;
  const order = uniquePreservingOrder(
    [...raw.split('\n').map((l) => l.match(/^([A-Za-z0-9_]+)\s*:/)?.[1]).filter(Boolean) as string[],
     ...Object.keys(frontmatter)],
  );
  const lines = order
    .filter((k) => frontmatter[k] !== undefined)
    .map((k) => `${k}: ${frontmatter[k]}`);
  const next = `---\n${lines.join('\n')}\n---\n${body.startsWith('\n') ? body.slice(1) : body}`;
  writeFileSync(filePath, next, 'utf8');
  return { previous, current: newStatus };
}

function uniquePreservingOrder(keys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

function registerBlueprintTools(
  server: McpServer,
  deps: KortextMcpDeps,
  blueprintPath: string,
): void {
  server.registerTool(
    'read_blueprint',
    {
      title: 'Read the blueprint markdown',
      description:
        'Returns the parsed frontmatter + body of .kortext/foundation/BRD.md (the Business Requirements Document).',
      inputSchema: {},
    },
    async () => {
      if (!existsSync(blueprintPath)) {
        return errorResult(`blueprint not found: ${blueprintPath}`);
      }
      const source = readFileSync(blueprintPath, 'utf8');
      const { frontmatter, body } = parseBlueprintFrontmatter(source);
      return jsonResult({
        path: blueprintPath,
        frontmatter,
        body,
        bytes: source.length,
      });
    },
  );

  server.registerTool(
    'approve_blueprint',
    {
      title: 'Approve the blueprint',
      description:
        'Flips blueprint frontmatter status to "approved". The blueprint watcher will then trigger the configured downstream workflow.',
      inputSchema: {
        approver: z
          .string()
          .min(1)
          .optional()
          .describe('Who is approving (default "+prime").'),
      },
    },
    async ({ approver }) => {
      if (!existsSync(blueprintPath)) {
        return errorResult(`blueprint not found: ${blueprintPath}`);
      }
      try {
        const { previous, current } = writeBlueprintStatus(
          blueprintPath,
          'approved',
        );
        deps.repos.auditLog.append({
          actor: approver ?? '+prime',
          action: 'blueprint.approve',
          resource_type: 'blueprint',
          resource_id: blueprintPath,
          payload: { previous, current, via: 'mcp' },
        });
        return jsonResult({
          path: blueprintPath,
          previous_status: previous,
          current_status: current,
          approver: approver ?? '+prime',
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );
}

// ----------------------------------------------------------------------------
// get_runtime_status
// ----------------------------------------------------------------------------

function registerStatusTool(server: McpServer, deps: KortextMcpDeps): void {
  server.registerTool(
    'get_runtime_status',
    {
      title: 'Runtime snapshot',
      description:
        'Doctor report + active/queued run counts + open question count. Use this as the MCP-side health check.',
      inputSchema: {},
    },
    async () => {
      const report = runDoctor({
        workflows: deps.workflows,
        personas: deps.personas,
        repos: deps.repos,
      });
      const running = deps.repos.runs.listRuns({ status: 'running', limit: 200 });
      const queued = deps.repos.runs.listRuns({ status: 'queued', limit: 200 });
      const awaiting = deps.repos.runs.listRuns({
        status: 'awaiting_approval',
        limit: 200,
      });
      const openQuestions = deps.repos.pendingQuestions.listOpen();
      return jsonResult({
        doctor: report,
        runs: {
          running: running.length,
          queued: queued.length,
          awaiting_approval: awaiting.length,
        },
        pending_questions: openQuestions.length,
        server: SERVER_INFO,
      });
    },
  );
}
