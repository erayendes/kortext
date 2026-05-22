import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { loadPersonasFromDir, type PersonaRegistry } from '../server/engine/persona-registry.ts';
import {
  loadWorkflowsFromDir,
  type WorkflowRegistry,
} from '../server/engine/workflow-loader.ts';
import { ApprovalQueue } from '../server/orchestrator/approval-queue.ts';
import { createKortextMcpServer } from '../mcp/server.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;
let personas: PersonaRegistry;
let workflows: WorkflowRegistry;
let client: Client;
let blueprintPath: string;

async function callJson(name: string, args: Record<string, unknown> = {}): Promise<any> {
  const res = await client.callTool({ name, arguments: args });
  expect(res.isError, `tool ${name} returned isError: ${JSON.stringify(res.content)}`).not.toBe(true);
  const content = (res.content as Array<{ type: string; text: string }>)[0];
  expect(content?.type).toBe('text');
  return JSON.parse(content!.text);
}

beforeEach(async () => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-mcp-'));
  const bundle = openDb({ path: join(tmpRoot, 'mcp.db') });
  db = bundle.db;
  repos = bundle.repositories;

  const personasDir = join(tmpRoot, 'agents');
  const workflowsDir = join(tmpRoot, 'workflows');
  const blueprintDir = join(tmpRoot, 'workspace', 'references');
  mkdirSync(personasDir);
  mkdirSync(workflowsDir);
  mkdirSync(blueprintDir, { recursive: true });

  writeFileSync(
    join(personasDir, 'backend-developer.md'),
    '# backend-developer\n\n- description: Builds the API\n\nYou are a backend developer.\n',
  );
  writeFileSync(
    join(workflowsDir, 'demo-pipeline.md'),
    '# demo `!start demo`\n\n## Phase one\n\n1. **+backend-developer:** ship\n   - Inputs: src\n   - Outputs: dist\n',
  );
  blueprintPath = join(blueprintDir, 'blueprint.md');
  writeFileSync(
    blueprintPath,
    '---\nstatus: draft\nowner: +prime\n---\n\n# Blueprint\n\nBody here.\n',
  );

  personas = loadPersonasFromDir(personasDir);
  workflows = loadWorkflowsFromDir(workflowsDir);
  const queue = new ApprovalQueue({ repos });

  const server = createKortextMcpServer({
    repos,
    workflows,
    personas,
    queue,
    workspaceRoot: tmpRoot,
    workflowsDir,
    blueprintPath,
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test-client', version: '0.0.1' });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
});

afterEach(async () => {
  await client.close();
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('MCP tool surface', () => {
  it('exposes all 15 tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'add_backlog_item',
        'approve_blueprint',
        'get_context',
        'get_logs',
        'get_pipeline',
        'get_runtime_status',
        'handover',
        'list_backlog',
        'list_pending_questions',
        'list_personas',
        'list_pipelines',
        'list_workflows',
        'read_blueprint',
        'respond_to_question',
        'start_pipeline',
        'transition_item',
      ].sort(),
    );
  });
});

describe('list_workflows / list_personas / list_pipelines', () => {
  it('lists the loaded workflow + persona', async () => {
    const wf = await callJson('list_workflows');
    expect(wf.workflows).toHaveLength(1);
    expect(wf.workflows[0].id).toBe('demo-pipeline');

    const p = await callJson('list_personas');
    expect(p.personas).toHaveLength(1);
    expect(p.personas[0].handle).toBe('+backend-developer');
  });

  it('list_pipelines includes recent runs', async () => {
    repos.runs.createRun({
      workflow_id: 'demo-pipeline',
      status: 'succeeded',
      triggered_by: 'test',
    });
    const out = await callJson('list_pipelines', { recent_limit: 3 });
    expect(out.pipelines).toHaveLength(1);
    expect(out.pipelines[0].recent_runs).toHaveLength(1);
    expect(out.pipelines[0].recent_runs[0].status).toBe('succeeded');
  });
});

describe('backlog tools', () => {
  it('add → list → transition cycle', async () => {
    const added = await callJson('add_backlog_item', {
      id: 'T-100',
      type: 'task',
      title: 'Test item',
    });
    expect(added.item.id).toBe('T-100');

    const list = await callJson('list_backlog', { status: 'to_do' });
    expect(list.items.some((i: { id: string }) => i.id === 'T-100')).toBe(true);

    const moved = await callJson('transition_item', { id: 'T-100', status: 'in_progress' });
    expect(moved.item.status).toBe('in_progress');
  });

  it('rejects duplicate id', async () => {
    await callJson('add_backlog_item', { id: 'T-dup', type: 'bug', title: 'A' });
    const res = await client.callTool({
      name: 'add_backlog_item',
      arguments: { id: 'T-dup', type: 'bug', title: 'B' },
    });
    expect(res.isError).toBe(true);
  });
});

describe('pipeline tools', () => {
  it('get_pipeline returns run + steps', async () => {
    const run = repos.runs.createRun({
      workflow_id: 'demo-pipeline',
      status: 'queued',
      triggered_by: 'test',
    });
    repos.runs.addStep({
      run_id: run.id,
      step_index: 0,
      step_name: 'phase-one.1',
      persona: '+backend-developer',
    });
    const out = await callJson('get_pipeline', { run_id: run.id });
    expect(out.run.id).toBe(run.id);
    expect(out.steps).toHaveLength(1);
  });

  it('get_pipeline errors when run missing', async () => {
    const res = await client.callTool({ name: 'get_pipeline', arguments: { run_id: 9999 } });
    expect(res.isError).toBe(true);
  });

  it('start_pipeline runs the mock workflow end-to-end', async () => {
    const out = await callJson('start_pipeline', {
      workflow_id: 'demo-pipeline',
      executor: 'mock',
    });
    expect(out.ok).toBe(true);
    expect(out.status).toBe('succeeded');
  });
});

describe('approval tools', () => {
  it('list_pending_questions + respond_to_question', async () => {
    const run = repos.runs.createRun({
      workflow_id: 'demo-pipeline',
      status: 'awaiting_approval',
      triggered_by: 'test',
    });
    const q = repos.pendingQuestions.create({
      run_id: run.id,
      step_id: null,
      question: 'approve?',
      choices: ['approve', 'reject'],
    });
    const list = await callJson('list_pending_questions');
    expect(list.questions.some((x: { id: number }) => x.id === q.id)).toBe(true);

    const ans = await callJson('respond_to_question', {
      question_id: q.id,
      answer: 'approve',
      answered_by: '+prime',
    });
    expect(ans.question.status).toBe('answered');
    expect(ans.question.answer).toBe('approve');
  });
});

describe('context + handover + logs', () => {
  it('get_context returns null when missing, value when set', async () => {
    const empty = await callJson('get_context', { persona: '+backend-developer' });
    expect(empty.context).toBeNull();
    repos.contexts.upsert({
      persona: '+backend-developer',
      payload: { focus: 'demo' },
    });
    const filled = await callJson('get_context', { persona: '+backend-developer' });
    expect(filled.context.payload).toEqual({ focus: 'demo' });
  });

  it('handover writes a handover row and audit entry', async () => {
    const out = await callJson('handover', {
      from_persona: '+backend-developer',
      to_persona: '+frontend-engineer',
      reason: 'API ready',
    });
    expect(out.handover.from_persona).toBe('+backend-developer');
    expect(out.handover.to_persona).toBe('+frontend-engineer');

    const logs = await callJson('get_logs', { action: 'handover.create' });
    expect(logs.entries).toHaveLength(1);
  });
});

describe('blueprint tools', () => {
  it('read_blueprint returns parsed frontmatter + body', async () => {
    const out = await callJson('read_blueprint');
    expect(out.frontmatter.status).toBe('draft');
    expect(out.frontmatter.owner).toBe('+prime');
    expect(out.body).toContain('# Blueprint');
  });

  it('approve_blueprint flips status on disk', async () => {
    const out = await callJson('approve_blueprint', { approver: '+prime' });
    expect(out.previous_status).toBe('draft');
    expect(out.current_status).toBe('approved');
    const onDisk = readFileSync(blueprintPath, 'utf8');
    expect(onDisk).toMatch(/^---\n[\s\S]*status: approved/);
    expect(onDisk).toContain('owner: +prime');
    expect(onDisk).toContain('# Blueprint');
  });
});

describe('get_runtime_status', () => {
  it('reports doctor + counters + server info', async () => {
    repos.runs.createRun({
      workflow_id: 'demo-pipeline',
      status: 'running',
      triggered_by: 'test',
    });
    const out = await callJson('get_runtime_status');
    expect(out.doctor.summary.workflowsLoaded).toBe(1);
    expect(out.runs.running).toBe(1);
    expect(out.server.name).toBe('kortext');
  });
});
