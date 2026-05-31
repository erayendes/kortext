import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { ApprovalQueue } from '../server/orchestrator/approval-queue.ts';
import { QueueReviewApprover } from '../server/engine/executors/queue-review-approver.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-qra-'));
  const bundle = openDb({ path: join(tmpRoot, 'qra.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

/** Seed an item + its dev-cycle run (the run the uat question anchors to). */
function seed(itemId: string): number {
  repos.backlog.create({ id: itemId, type: 'task', title: `title of ${itemId}` });
  return repos.runs.createRun({
    workflow_id: 'development-cycle',
    item_id: itemId,
    status: 'succeeded',
    worktree_path: null,
    triggered_by: 'test',
  }).id;
}

describe('QueueReviewApprover — real prime approval via ApprovalQueue (capstone C3, §5.9)', () => {
  it("an 'approve' answer → approved verdict", async () => {
    const runId = seed('R1');
    const queue = new ApprovalQueue({ repos, pollIntervalMs: 15 });
    const item = repos.backlog.get('R1')!;
    const approver = new QueueReviewApprover({ queue, resolveRunId: () => runId });

    const pending = approver.requestApproval({ itemId: 'R1', item, persona: '+prime' });
    // A human pokes the dashboard a beat later.
    setTimeout(() => {
      const q = queue.findOpenForRun(runId)!;
      queue.answer(q.id, 'approve', 'prime');
    }, 25);

    const verdict = await pending;
    expect(verdict.approved).toBe(true);
  });

  it("a 'reject' answer → not approved, reason carries the answer", async () => {
    const runId = seed('R2');
    const queue = new ApprovalQueue({ repos, pollIntervalMs: 15 });
    const item = repos.backlog.get('R2')!;
    const approver = new QueueReviewApprover({ queue, resolveRunId: () => runId });

    const pending = approver.requestApproval({ itemId: 'R2', item, persona: '+prime' });
    setTimeout(() => {
      const q = queue.findOpenForRun(runId)!;
      queue.answer(q.id, 'reject', 'prime');
    }, 25);

    const verdict = await pending;
    expect(verdict.approved).toBe(false);
    expect(verdict.reason).toBe('reject');
  });

  it('no run to anchor the approval → not approved (no question enqueued)', async () => {
    repos.backlog.create({ id: 'R3', type: 'task', title: 'R3' });
    const queue = new ApprovalQueue({ repos, pollIntervalMs: 15 });
    const item = repos.backlog.get('R3')!;
    const approver = new QueueReviewApprover({ queue, resolveRunId: () => null });

    const verdict = await approver.requestApproval({ itemId: 'R3', item, persona: '+prime' });
    expect(verdict.approved).toBe(false);
    expect(verdict.reason).toMatch(/no run/i);
    expect(repos.pendingQuestions.listOpen()).toHaveLength(0);
  });

  it('a cancelled wait (the run was blocked) → not approved', async () => {
    const runId = seed('R4');
    const queue = new ApprovalQueue({ repos, pollIntervalMs: 15 });
    const item = repos.backlog.get('R4')!;
    const ac = new AbortController();
    const approver = new QueueReviewApprover({ queue, resolveRunId: () => runId });

    const pending = approver.requestApproval({ itemId: 'R4', item, persona: '+prime', signal: ac.signal });
    setTimeout(() => ac.abort(), 25);

    const verdict = await pending;
    expect(verdict.approved).toBe(false);
  });
});
