import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { ApprovalQueue } from '../server/orchestrator/approval-queue.ts';
import { approvalRouter } from '../server/routes/approvals.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-approval-'));
  const bundle = openDb({ path: join(tmpRoot, 'approval.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

function makeRun(): number {
  const run = repos.runs.createRun({
    workflow_id: 'x',
    item_id: null,
    status: 'running',
    worktree_path: null,
    triggered_by: 'test',
  });
  return run.id;
}

describe('ApprovalQueue', () => {
  it('enqueue creates an open pending_question', () => {
    const q = new ApprovalQueue({ repos });
    const runId = makeRun();
    const created = q.enqueue({
      runId,
      question: 'Approve report?',
      choices: ['approve', 'reject'],
    });
    expect(created.status).toBe('open');
    expect(created.run_id).toBe(runId);
    expect(created.choices).toEqual(['approve', 'reject']);
  });

  it('waitForAnswer resolves once the question is answered', async () => {
    const q = new ApprovalQueue({ repos, pollIntervalMs: 10 });
    const runId = makeRun();
    const created = q.enqueue({ runId, question: 'ok?', choices: [] });

    const promise = q.waitForAnswer(created.id);
    // Answer it from the outside.
    setTimeout(() => q.answer(created.id, 'approve', 'tester'), 25);

    const answered = await promise;
    expect(answered.status).toBe('answered');
    expect(answered.answer).toBe('approve');
    expect(answered.answered_by).toBe('tester');
  });

  it('waitForAnswer respects AbortSignal', async () => {
    const q = new ApprovalQueue({ repos, pollIntervalMs: 10 });
    const runId = makeRun();
    const created = q.enqueue({ runId, question: 'ok?', choices: [] });
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 20);
    await expect(q.waitForAnswer(created.id, { signal: ac.signal })).rejects.toThrow(
      /aborted/i,
    );
  });

  it('records audit log on enqueue and answer', () => {
    const q = new ApprovalQueue({ repos });
    const runId = makeRun();
    const created = q.enqueue({ runId, question: 'gate', choices: [] });
    q.answer(created.id, 'approve', 'reviewer');

    const entries = repos.auditLog.list({ resource_type: 'pending_question' });
    const actions = entries.map((e) => e.action);
    expect(actions).toContain('gate.awaiting-approval');
    expect(actions).toContain('gate.answered');
  });
});

describe('approvalRouter (REST)', () => {
  let server: Server;
  let baseUrl: string;
  let queue: ApprovalQueue;

  beforeEach(async () => {
    queue = new ApprovalQueue({ repos });
    const app = express();
    app.use(express.json());
    app.use('/api', approvalRouter({ repos, queue }));
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /api/questions returns open questions', async () => {
    const runId = makeRun();
    queue.enqueue({ runId, question: 'x', choices: [] });
    const res = await fetch(`${baseUrl}/api/questions`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { questions: unknown[] };
    expect(body.questions).toHaveLength(1);
  });

  it('POST /api/questions/:id/answer answers an open question', async () => {
    const runId = makeRun();
    const q = queue.enqueue({ runId, question: 'x', choices: ['approve'] });
    const res = await fetch(`${baseUrl}/api/questions/${q.id}/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answer: 'approve', answered_by: 'eray' }),
    });
    expect(res.status).toBe(200);
    const reloaded = repos.pendingQuestions.get(q.id);
    expect(reloaded?.status).toBe('answered');
    expect(reloaded?.answer).toBe('approve');
  });

  it('POST /api/runs/:id/approve answers the oldest open question for that run', async () => {
    const runId = makeRun();
    const q1 = queue.enqueue({ runId, question: 'first', choices: [] });
    queue.enqueue({ runId, question: 'second', choices: [] });

    const res = await fetch(`${baseUrl}/api/runs/${runId}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answered_by: 'eray' }),
    });
    expect(res.status).toBe(200);

    const reloaded = repos.pendingQuestions.get(q1.id);
    expect(reloaded?.status).toBe('answered');
    expect(reloaded?.answer).toBe('approve');
  });

  it('returns 404 when answering a missing question', async () => {
    const res = await fetch(`${baseUrl}/api/questions/9999/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answer: 'approve', answered_by: 'eray' }),
    });
    expect(res.status).toBe(404);
  });
});
