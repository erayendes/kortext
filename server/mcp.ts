import type Database from 'better-sqlite3';
import type { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import type { Project } from './db.js';
import { completeRequest, listRequests } from './requests.js';

function projectByRepoPath(db: Database.Database, repoPath: string): Project | undefined {
  return db.prepare('SELECT * FROM projects WHERE repo_path = ?').get(repoPath) as
    | Project
    | undefined;
}

function json(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export function buildMcpServer(db: Database.Database): McpServer {
  const server = new McpServer({ name: 'kortext', version: '1.0.0' });

  server.registerTool(
    'get_pending_requests',
    {
      description:
        'Pending requests from +prime for the kortext project at repo_path (your working directory): revise notes, report requests, planning triggers. Call at the start of every step.',
      inputSchema: { repo_path: z.string().describe('Absolute path of the project repo you are working in') },
    },
    async ({ repo_path }) => {
      const project = projectByRepoPath(db, repo_path);
      if (!project) return json({ error: `no kortext project registered at ${repo_path}` });
      const requests = listRequests(db, project.id, 'pending').map((r) => ({
        id: r.id,
        type: r.type,
        payload: JSON.parse(r.payload),
        created_at: r.created_at,
      }));
      return json({ project: project.name, requests });
    },
  );

  server.registerTool(
    'complete_request',
    {
      description: 'Mark a kortext request as done after you have fully handled it.',
      inputSchema: { request_id: z.number().int().describe('id from get_pending_requests') },
    },
    async ({ request_id }) => json({ completed: completeRequest(db, request_id) }),
  );

  server.registerTool(
    'get_project_context',
    {
      description:
        'Registered kortext project info for repo_path, plus pending request count. Use to confirm you are in a kortext-managed repo.',
      inputSchema: { repo_path: z.string() },
    },
    async ({ repo_path }) => {
      const project = projectByRepoPath(db, repo_path);
      if (!project) return json({ error: `no kortext project registered at ${repo_path}` });
      return json({
        project,
        pending_requests: listRequests(db, project.id, 'pending').length,
        contract: 'Read AGENTS.md at the repo root and follow it.',
      });
    },
  );

  return server;
}

// Stateless streamable-HTTP: one server+transport pair per POST.
export async function handleMcpRequest(
  db: Database.Database,
  req: Request,
  res: Response,
): Promise<void> {
  const server = buildMcpServer(db);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
