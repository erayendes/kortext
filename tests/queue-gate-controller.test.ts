import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { ApprovalQueue } from '../server/orchestrator/approval-queue.ts';
import { QueueGateController } from '../server/orchestrator/queue-gate-controller.ts';
import type { ApprovalGate } from '../server/engine/workflow-parser.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-qgc-'));
  const bundle = openDb({ path: join(tmpRoot, 'qgc.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

function makeRun(): number {
  return repos.runs.createRun({
    workflow_id: 'wf',
    item_id: null,
    status: 'running',
    worktree_path: null,
    triggered_by: 'test',
  }).id;
}

const gate: ApprovalGate = {
  phase: 'Legal Review',
  afterStepIndex: 0,
  body: 'compliance step',
  approver: '+prime',
  persona: '+compliance-expert',
  artifactPath: '.kortext/references/LEGAL.md',
};

describe('QueueGateController', () => {
  it('enqueues a question with artifact metadata and a human-readable prompt', async () => {
    const queue = new ApprovalQueue({ repos, pollIntervalMs: 10 });
    const controller = new QueueGateController(queue);
    const runId = makeRun();

    // Answer asynchronously to mimic a human poking the REST endpoint.
    const promise = controller.pauseAtGate({ gate, runId, workflowId: 'wf' });
    setTimeout(() => {
      const open = queue.findOpenForRun(runId);
      if (open) queue.answer(open.id, 'approve', 'tester');
    }, 25);

    const decision = await promise;
    expect(decision).toEqual({ decision: 'approve' });

    // The enqueued question carried the metadata + a human-readable prompt.
    const answered = repos.pendingQuestions.get(
      repos.auditLog
        .list({ resource_type: 'pending_question' })
        .map((e) => Number(e.resource_id))[0]!,
    );
    expect(answered?.artifact_path).toBe('.kortext/references/LEGAL.md');
    expect(answered?.persona).toBe('+compliance-expert');
    expect(answered?.phase).toBe('Legal Review');
    expect(answered?.question).toContain('+compliance-expert');
    expect(answered?.question).toContain('LEGAL.md');
    expect(answered?.choices).toEqual(['approve', 'revise']);
  });

  it('maps a non-approve answer to a reject decision carrying the answer as reason', async () => {
    const queue = new ApprovalQueue({ repos, pollIntervalMs: 10 });
    const controller = new QueueGateController(queue);
    const runId = makeRun();

    const promise = controller.pauseAtGate({ gate, runId, workflowId: 'wf' });
    setTimeout(() => {
      const open = queue.findOpenForRun(runId);
      if (open) queue.answer(open.id, 'revise', 'tester');
    }, 25);

    const decision = await promise;
    expect(decision).toEqual({ decision: 'reject', reason: 'revise' });
  });
});
