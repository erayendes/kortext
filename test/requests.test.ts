import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { openDb } from '../server/db.js';
import { buildApp } from '../server/app.js';
import { createProject } from '../server/projects.js';
import { cancelRequest, completeRequest, createRequest, listRequests } from '../server/requests.js';

const pkgRoot = process.cwd();

test('request queue lifecycle: create → pending → done / cancelled', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Q', repoPath: join(work, 'q'), mode: 'new' }, pkgRoot);
  const r1 = createRequest(db, p.id, 'revise', { doc: 'references/STACK.md', notes: ['use pg'] });
  const r2 = createRequest(db, p.id, 'report', { report_type: 'risk' });
  assert.throws(() => createRequest(db, p.id, 'nonsense', {}));
  assert.equal(listRequests(db, p.id, 'pending').length, 2);
  assert.equal(completeRequest(db, r1.id), true);
  assert.equal(completeRequest(db, r1.id), false); // already done
  assert.equal(cancelRequest(db, r2.id), true);
  assert.equal(listRequests(db, p.id, 'pending').length, 0);
  rmSync(work, { recursive: true, force: true });
});

test('scaffold copies contract, workflows, personas, doc skeletons', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const repo = join(work, 'acme');
  createProject(db, { name: 'Acme', repoPath: repo, mode: 'new' }, pkgRoot);
  assert.ok(existsSync(join(repo, 'AGENTS.md')));
  assert.ok(existsSync(join(repo, '.kortext', 'workflows', 'new-project-analysis.md')));
  assert.ok(existsSync(join(repo, '.kortext', 'agents', 'product-manager.md')));
  assert.ok(existsSync(join(repo, '.kortext', 'references', 'STACK.md')));
  assert.ok(existsSync(join(repo, '.kortext', 'foundation', 'PRD.md')));
  assert.ok(existsSync(join(repo, '.kortext', 'memory', 'handover.md')));
  rmSync(work, { recursive: true, force: true });
});

test('MCP over HTTP: agent pulls pending requests and completes one', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const repo = join(work, 'acme');
  const p = createProject(db, { name: 'Acme', repoPath: repo, mode: 'new' }, pkgRoot);
  const req = createRequest(db, p.id, 'revise', { doc: 'references/STACK.md', notes: ['x'] });

  const app = buildApp(db, pkgRoot, join(work, 'db.sqlite'));
  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;

  const client = new Client({ name: 'test-agent', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/mcp`)));

  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['complete_request', 'get_pending_requests', 'get_project_context']);

  const pending = await client.callTool({
    name: 'get_pending_requests',
    arguments: { repo_path: repo },
  });
  const parsed = JSON.parse((pending.content as { text: string }[])[0].text);
  assert.equal(parsed.requests.length, 1);
  assert.equal(parsed.requests[0].type, 'revise');

  const done = await client.callTool({
    name: 'complete_request',
    arguments: { request_id: req.id },
  });
  assert.equal(JSON.parse((done.content as { text: string }[])[0].text).completed, true);
  assert.equal(listRequests(db, p.id, 'pending').length, 0);

  await client.close();
  server.close();
  rmSync(work, { recursive: true, force: true });
});
