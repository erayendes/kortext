/**
 * Tests for the preprod-approval consumer (§5.11 chain end).
 *
 * consumePreprodApproval(question, deps) unit tests (in-memory SQLite).
 * Route integration test: POST /api/questions/:id/answer for preprod-approval
 * phase → deployProd called + response still returns question.
 */

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
import type { PendingQuestion } from '../server/db/schemas.ts';
import type { Deployer, DeployContext, PreprodDeployContext, ProdDeployContext, DeployOutcome } from '../server/engine/deployer.ts';
import { ApprovalQueue } from '../server/orchestrator/approval-queue.ts';
import { consumePreprodApproval } from '../server/orchestrator/preprod-approval-consumer.ts';
import { approvalRouter } from '../server/routes/approvals.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-pac-'));
  const bundle = openDb({ path: join(tmpRoot, 'pac.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal mock deployer for unit tests. */
function makeMockDeployer(opts: { preprodOk?: boolean; prodOk?: boolean } = {}): Deployer & {
  preprodCalls: PreprodDeployContext[];
  prodCalls: ProdDeployContext[];
} {
  const preprodCalls: PreprodDeployContext[] = [];
  const prodCalls: ProdDeployContext[] = [];
  return {
    name: 'test-mock-deployer',
    async deployStaging(_ctx: DeployContext): Promise<DeployOutcome> {
      return { ok: true, url: null };
    },
    async deployPreprod(ctx: PreprodDeployContext): Promise<DeployOutcome> {
      preprodCalls.push(ctx);
      return { ok: opts.preprodOk ?? true, url: null };
    },
    async deployProd(ctx: ProdDeployContext): Promise<DeployOutcome> {
      prodCalls.push(ctx);
      return { ok: opts.prodOk ?? true, url: null };
    },
    preprodCalls,
    prodCalls,
  };
}

/** Build a minimal answered PendingQuestion without touching the DB. */
function makeAnswered(
  overrides: Partial<PendingQuestion> & { answer: string },
): PendingQuestion {
  return {
    id: 1,
    run_id: null,
    step_id: null,
    question: 'Approve preprod?',
    choices: ['approve', 'reject'],
    status: 'answered' as const,
    answered_by: 'prime',
    answered_at: Date.now(),
    created_at: Date.now(),
    artifact_path: null,
    persona: '+prime',
    phase: 'preprod-approval',
    metadata: null,
    ...overrides,
  };
}

/** Seed epics with a version. */
function seedVersionEpics(version: string, epicIds: string[]): void {
  for (const id of epicIds) {
    repos.backlog.create({ id, type: 'epic', title: id, version });
  }
}

// ---------------------------------------------------------------------------
// Unit — no version in metadata → no-op
// ---------------------------------------------------------------------------

describe('consumePreprodApproval — no version in metadata', () => {
  it('null metadata → no-op (no error, no DB writes)', async () => {
    const deployer = makeMockDeployer();
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: null });
    await expect(consumePreprodApproval(q, { repos, queue, deployer })).resolves.toBeUndefined();
    expect(repos.backlog.list()).toHaveLength(0);
    expect(deployer.prodCalls).toHaveLength(0);
  });

  it('metadata present but version missing → no-op', async () => {
    const deployer = makeMockDeployer();
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { epicId: 'E1' } });
    await expect(consumePreprodApproval(q, { repos, queue, deployer })).resolves.toBeUndefined();
    expect(deployer.prodCalls).toHaveLength(0);
  });

  it('metadata present but version is empty string → no-op', async () => {
    const deployer = makeMockDeployer();
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { version: '' } });
    await consumePreprodApproval(q, { repos, queue, deployer });
    expect(deployer.prodCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Unit — APPROVE branch
// ---------------------------------------------------------------------------

describe('consumePreprodApproval — approve branch', () => {
  it('approve → all version epics get frontmatter.preprod_approved=true', async () => {
    seedVersionEpics('v1.0', ['E1', 'E2']);
    const deployer = makeMockDeployer();
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { version: 'v1.0' } });
    await consumePreprodApproval(q, { repos, queue, deployer });

    expect(repos.backlog.get('E1')?.frontmatter.preprod_approved).toBe(true);
    expect(repos.backlog.get('E2')?.frontmatter.preprod_approved).toBe(true);
  });

  it('approve → deployProd called exactly once with the version', async () => {
    seedVersionEpics('v1.1', ['E3']);
    const deployer = makeMockDeployer();
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { version: 'v1.1' } });
    await consumePreprodApproval(q, { repos, queue, deployer });

    expect(deployer.prodCalls).toHaveLength(1);
    expect(deployer.prodCalls[0]!.version).toBe('v1.1');
  });

  it('approve — no epics for version → no-op (no deployProd)', async () => {
    const deployer = makeMockDeployer();
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { version: 'v99.0' } });
    await consumePreprodApproval(q, { repos, queue, deployer });

    expect(deployer.prodCalls).toHaveLength(0);
  });

  it('idempotent re-trigger → no second deployProd when all already preprod_approved', async () => {
    seedVersionEpics('v2.0', ['E4', 'E5']);
    // Pre-mark both as approved (simulates a re-trigger).
    repos.backlog.updateFrontmatter('E4', { preprod_approved: true });
    repos.backlog.updateFrontmatter('E5', { preprod_approved: true });

    const deployer = makeMockDeployer();
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { version: 'v2.0' } });
    await consumePreprodApproval(q, { repos, queue, deployer });

    // Guard fires: already all approved, so no deployProd.
    expect(deployer.prodCalls).toHaveLength(0);
  });

  it('idempotent — first approve calls deployProd; second approve on same version does not', async () => {
    seedVersionEpics('v3.0', ['E6']);
    const deployer = makeMockDeployer();
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { version: 'v3.0' } });

    // First call
    await consumePreprodApproval(q, { repos, queue, deployer });
    expect(deployer.prodCalls).toHaveLength(1);

    // Second call (retry / duplicate)
    await consumePreprodApproval(q, { repos, queue, deployer });
    expect(deployer.prodCalls).toHaveLength(1); // still 1
  });
});

// ---------------------------------------------------------------------------
// Unit — REJECT branch
// ---------------------------------------------------------------------------

describe('consumePreprodApproval — reject branch', () => {
  it("reject → exactly one bug item created", async () => {
    seedVersionEpics('v4.0', ['E7']);
    const deployer = makeMockDeployer();
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'reject', metadata: { version: 'v4.0' } });
    await consumePreprodApproval(q, { repos, queue, deployer });

    const bugs = repos.backlog.list({ type: 'bug' });
    expect(bugs).toHaveLength(1);
    expect(bugs[0]!.type).toBe('bug');
  });

  it('reject → bug title contains the version', async () => {
    seedVersionEpics('v5.0', ['E8']);
    const deployer = makeMockDeployer();
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'reject', metadata: { version: 'v5.0' } });
    await consumePreprodApproval(q, { repos, queue, deployer });

    const bug = repos.backlog.list({ type: 'bug' })[0]!;
    expect(bug.title).toContain('v5.0');
  });

  it('reject → bug body_md contains the rejection reason', async () => {
    seedVersionEpics('v6.0', ['E9']);
    const deployer = makeMockDeployer();
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({
      answer: 'reject: performance regression on checkout page',
      metadata: { version: 'v6.0' },
    });
    await consumePreprodApproval(q, { repos, queue, deployer });

    const bug = repos.backlog.list({ type: 'bug' })[0]!;
    expect(bug.body_md).toContain('reject: performance regression on checkout page');
  });

  it('reject → bug parent_id = first epic of that version', async () => {
    seedVersionEpics('v7.0', ['E10', 'E11']);
    const deployer = makeMockDeployer();
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'reject', metadata: { version: 'v7.0' } });
    await consumePreprodApproval(q, { repos, queue, deployer });

    const bug = repos.backlog.list({ type: 'bug' })[0]!;
    // parent_id should be one of the version epics
    expect(['E10', 'E11']).toContain(bug.parent_id);
  });

  it('reject — no epics for version → bug still created, parent_id=null', async () => {
    const deployer = makeMockDeployer();
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'reject', metadata: { version: 'v99.9' } });
    await consumePreprodApproval(q, { repos, queue, deployer });

    const bugs = repos.backlog.list({ type: 'bug' });
    expect(bugs).toHaveLength(1);
    expect(bugs[0]!.parent_id).toBeNull();
  });

  it('reject → deployProd NOT called', async () => {
    seedVersionEpics('v8.0', ['E12']);
    const deployer = makeMockDeployer();
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'reject', metadata: { version: 'v8.0' } });
    await consumePreprodApproval(q, { repos, queue, deployer });

    expect(deployer.prodCalls).toHaveLength(0);
  });

  it('reject → bug id minted via nextBacklogId (B prefix, numeric)', async () => {
    seedVersionEpics('v9.0', ['E13']);
    const deployer = makeMockDeployer();
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'reject', metadata: { version: 'v9.0' } });
    await consumePreprodApproval(q, { repos, queue, deployer });

    const bug = repos.backlog.list({ type: 'bug' })[0]!;
    expect(bug.id).toMatch(/^B\d+$/);
  });
});

// ---------------------------------------------------------------------------
// Route integration — POST /api/questions/:id/answer with preprod-approval
// ---------------------------------------------------------------------------

describe('approvalRouter — preprod-approval answer integration', () => {
  let server: Server;
  let baseUrl: string;
  let queue: ApprovalQueue;

  beforeEach(async () => {
    queue = new ApprovalQueue({ repos });
    const deployer = makeMockDeployer();
    const app = express();
    app.use(express.json());
    app.use('/api', approvalRouter({ repos, queue, deployer }));
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  /** Enqueue a preprod-approval question and return its id. */
  function enqueuePreprodApproval(version: string): number {
    const q = queue.enqueue({
      runId: null,
      question: `Promote version ${version} to production?`,
      choices: ['approve', 'reject'],
      persona: '+prime',
      phase: 'preprod-approval',
      metadata: { version },
    });
    return q.id;
  }

  it('rejecting a preprod-approval question → bug created; response has the question', async () => {
    seedVersionEpics('v10.0', ['RT1']);
    const qId = enqueuePreprodApproval('v10.0');

    const res = await fetch(`${baseUrl}/api/questions/${qId}/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answer: 'reject', answered_by: '+prime' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { question: PendingQuestion };
    expect(body.question.status).toBe('answered');
    expect(body.question.answer).toBe('reject');

    // Allow async consumer
    await new Promise((r) => setTimeout(r, 50));

    const bugs = repos.backlog.list({ type: 'bug' });
    expect(bugs).toHaveLength(1);
    expect(bugs[0]!.title).toContain('v10.0');
  });

  it('approving a preprod-approval question → epic preprod_approved=true; response has the question', async () => {
    seedVersionEpics('v11.0', ['RT2']);
    const qId = enqueuePreprodApproval('v11.0');

    const res = await fetch(`${baseUrl}/api/questions/${qId}/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answer: 'approve', answered_by: '+prime' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { question: PendingQuestion };
    expect(body.question.answer).toBe('approve');

    await new Promise((r) => setTimeout(r, 50));

    const epic = repos.backlog.get('RT2');
    expect(epic?.frontmatter.preprod_approved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unit — deployProd failure → bug creation
// ---------------------------------------------------------------------------

describe('consumePreprodApproval — deployProd failure opens a bug', () => {
  it('deployProd returning ok:false → a type:bug item is created', async () => {
    seedVersionEpics('v20.0', ['EF1']);
    const deployer = makeMockDeployer({ prodOk: false });
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { version: 'v20.0' } });

    await consumePreprodApproval(q, { repos, queue, deployer });

    const bugs = repos.backlog.list({ type: 'bug' });
    expect(bugs).toHaveLength(1);
    expect(bugs[0]!.type).toBe('bug');
  });

  it('deployProd ok:false → bug title contains "Prod release failed" and the version', async () => {
    seedVersionEpics('v20.1', ['EF2']);
    const deployer = makeMockDeployer({ prodOk: false });
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { version: 'v20.1' } });

    await consumePreprodApproval(q, { repos, queue, deployer });

    const bug = repos.backlog.list({ type: 'bug' })[0]!;
    expect(bug.title).toMatch(/Prod release failed/i);
    expect(bug.title).toContain('v20.1');
  });

  it('deployProd ok:false → bug body contains the failure reason', async () => {
    seedVersionEpics('v20.2', ['EF3']);
    const deployer: ReturnType<typeof makeMockDeployer> = {
      ...makeMockDeployer(),
      name: 'failing-mock',
      async deployProd(_ctx) {
        return { ok: false, reason: 'merge conflict on README.md' };
      },
    };
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { version: 'v20.2' } });

    await consumePreprodApproval(q, { repos, queue, deployer });

    const bug = repos.backlog.list({ type: 'bug' })[0]!;
    expect(bug.body_md).toContain('merge conflict on README.md');
  });

  it('deployProd ok:false → bug parent_id = first version epic', async () => {
    seedVersionEpics('v20.3', ['EF4', 'EF5']);
    const deployer = makeMockDeployer({ prodOk: false });
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { version: 'v20.3' } });

    await consumePreprodApproval(q, { repos, queue, deployer });

    const bug = repos.backlog.list({ type: 'bug' })[0]!;
    expect(['EF4', 'EF5']).toContain(bug.parent_id);
  });

  it('deployProd ok:false → preprod_approved markers were STILL set (approval side-effects kept)', async () => {
    seedVersionEpics('v20.4', ['EF6']);
    const deployer = makeMockDeployer({ prodOk: false });
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { version: 'v20.4' } });

    await consumePreprodApproval(q, { repos, queue, deployer });

    // Approval side-effect (frontmatter update) still happened even though deploy failed.
    expect(repos.backlog.get('EF6')?.frontmatter.preprod_approved).toBe(true);
  });

  it('deployProd ok:true → no bug created', async () => {
    seedVersionEpics('v20.5', ['EF7']);
    const deployer = makeMockDeployer({ prodOk: true });
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { version: 'v20.5' } });

    await consumePreprodApproval(q, { repos, queue, deployer });

    const bugs = repos.backlog.list({ type: 'bug' });
    expect(bugs).toHaveLength(0);
  });
});
