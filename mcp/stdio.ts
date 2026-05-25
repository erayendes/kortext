/**
 * Stdio entry — what `kortext mcp` spawns.
 *
 * Reads from stdin / writes JSON-RPC frames to stdout. CRITICAL: nothing
 * besides MCP frames may go to stdout — every log line is routed to stderr.
 * The CLI sets `console.log = console.error` defensively before this loads.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getDb } from '../server/db/client.ts';
import { runtimeLayout } from '../server/paths.ts';
import { loadWorkflowsFromDir } from '../server/engine/workflow-loader.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { ApprovalQueue } from '../server/orchestrator/approval-queue.ts';
import { createKortextMcpServer } from './server.ts';

export async function runStdioServer(opts: { cwd?: string } = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const log = (msg: string) => process.stderr.write(`[kortext-mcp] ${msg}\n`);

  const { schemaVersion, repositories: repos } = getDb();
  log(`db ready (schema v${schemaVersion})`);

  // v3.1: load workflows + personas from the kortext npm package itself,
  // not from the project's cwd.
  const runtime = runtimeLayout();
  const workflowsDir = runtime.workflowsDir;
  const agentsDir = runtime.agentsDir;
  const workflows = loadWorkflowsFromDir(workflowsDir);
  const personas = loadPersonasFromDir(agentsDir);
  log(
    `loaded ${workflows.list().length} workflow(s), ${personas.list().length} persona(s)`,
  );

  const queue = new ApprovalQueue({ repos });
  const server = createKortextMcpServer({
    repos,
    workflows,
    personas,
    queue,
    workspaceRoot: cwd,
    workflowsDir,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('mcp server connected on stdio');

  const shutdown = (signal: string) => {
    log(`received ${signal}, closing`);
    void server.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
