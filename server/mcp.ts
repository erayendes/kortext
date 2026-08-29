import type Database from 'better-sqlite3';
import type { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Project } from './db.js';
import { completeRequest, listRequests } from './requests.js';
import { listDocs, workflowNameFor } from './docs.js';

export const WORKFLOWS = ['new-project-analysis', 'existing-project-analysis', 'planning-pipeline'] as const;
export const PERSONAS = [
  'compliance-expert',
  'growth-expert',
  'product-manager',
  'copywriter',
  'engineering-manager',
  'security-engineer',
  'designer',
  'db-admin',
  'qa-engineer',
  'operation-manager',
  'devops-engineer',
] as const;

function projectByRepoPath(db: Database.Database, repoPath: string): Project | undefined {
  return db.prepare('SELECT * FROM projects WHERE repo_path = ?').get(repoPath) as
    | Project
    | undefined;
}

function json(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export function buildMcpServer(db: Database.Database, pkgRoot: string): McpServer {
  const server = new McpServer({ name: 'kortext', version: '1.0.0' });

  server.registerTool(
    'get_workflow',
    {
      description:
        'Process definition (markdown) for a kortext workflow. Steps carry inputs/outputs/approver — follow the dependency rule in AGENTS.md. Workflows live in the kortext package, not in the project.',
      inputSchema: { name: z.enum(WORKFLOWS) },
    },
    async ({ name }) => ({
      content: [
        { type: 'text' as const, text: readFileSync(join(pkgRoot, 'workflows', `${name}.md`), 'utf8') },
      ],
    }),
  );

  server.registerTool(
    'get_persona',
    {
      description:
        "Perspective brief for an analysis persona (e.g. 'security-engineer'). Write a document through the lens of its author persona.",
      inputSchema: { handle: z.enum(PERSONAS) },
    },
    async ({ handle }) => ({
      content: [
        { type: 'text' as const, text: readFileSync(join(pkgRoot, 'agents', `${handle}.md`), 'utf8') },
      ],
    }),
  );

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
        'Registered kortext project info for repo_path: document statuses (the dependency state), pending request count, available workflows. Use to confirm you are in a kortext-managed repo and to see where the analysis stands.',
      inputSchema: { repo_path: z.string() },
    },
    async ({ repo_path }) => {
      const project = projectByRepoPath(db, repo_path);
      if (!project) return json({ error: `no kortext project registered at ${repo_path}` });
      return json({
        project,
        docs: listDocs(db, project, pkgRoot).map((d) => ({
          rel: d.rel,
          status: d.status,
          blocked: d.blocked,
          revisionPending: d.revisionPending,
        })),
        pending_requests: listRequests(db, project.id, 'pending').length,
        workflow: workflowNameFor(project.kind ?? 'new'),
        contract: 'Read AGENTS.md at the repo root and follow it. Fetch the workflow above with get_workflow.',
      });
    },
  );

  return server;
}

// Stateless streamable-HTTP: one server+transport pair per POST.
export async function handleMcpRequest(
  db: Database.Database,
  pkgRoot: string,
  req: Request,
  res: Response,
): Promise<void> {
  const server = buildMcpServer(db, pkgRoot);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
