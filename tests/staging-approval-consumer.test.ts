/**
 * Tests for M2b — staging-approval consumer.
 *
 * consumeStagingApproval(question, deps) unit tests (in-memory SQLite).
 * Route integration test: POST /api/questions/:id/answer for staging-approval
 * phase → bug created + response still returns question.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Deployer, DeployContext, PreprodDeployContext, ProdDeployContext, DeployOutcome } from '../server/engine/deployer.ts';
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
import { ApprovalQueue } from '../server/orchestrator/approval-queue.ts';
import { consumeStagingApproval } from '../server/orchestrator/staging-approval-consumer.ts';
import { approvalRouter } from '../server/routes/approvals.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-sac-'));
  const bundle = openDb({ path: join(tmpRoot, 'sac.db') });
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

/** Build a minimal answered PendingQuestion without touching the DB. */
function makeAnswered(
  overrides: Partial<PendingQuestion> & { answer: string },
): PendingQuestion {
  return {
    id: 1,
    run_id: null,
    step_id: null,
    question: 'Approve staging?',
    choices: ['approve', 'reject'],
    status: 'answered' as const,
    answered_by: 'prime',
    answered_at: Date.now(),
    created_at: Date.now(),
    artifact_path: null,
    persona: '+prime',
    phase: 'staging-approval',
    metadata: null,
    ...overrides,
  };
}

/** Seed a complete epic: create the epic + N done children, gate run per child persona. */
function seedEpic(
  epicId: string,
  {
    version = null,
    childPersonas = [],
  }: { version?: string | null; childPersonas?: string[] } = {},
): void {
  repos.backlog.create({ id: epicId, type: 'epic', title: epicId, version });

  childPersonas.forEach((persona, i) => {
    const childId = `${epicId}-c${i}`;
    repos.backlog.create({
      id: childId,
      type: 'task',
      title: childId,
      parent_id: epicId,
    });
    repos.backlog.transitionStatus(childId, 'done');
    repos.gateRuns.create({
      item_id: childId,
      gate: 'code_review',
      persona,
      attempt: 1,
      status: 'pass',
    });
  });
}

/** Seed a gate-staging report row for an epic (status='writing'). */
function seedGateStagingReport(epicId: string, author: string): number {
  const slug = `${epicId}-${author.replace(/\+/g, '')}`;
  const row = repos.reports.create({
    scope: 'gate-staging',
    slug,
    file_path: `.kortext/reports/gate-staging_${slug}.md`,
    author,
    status: 'writing',
    related_item: epicId,
  });
  return row.id;
}

// ---------------------------------------------------------------------------
// Unit — no epicId in metadata → no-op
// ---------------------------------------------------------------------------

describe('consumeStagingApproval — no epicId in metadata', () => {
  it('null metadata → no-op (no error, no DB writes)', async () => {
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: null });
    await expect(consumeStagingApproval(q, { repos, queue })).resolves.toBeUndefined();
    expect(repos.backlog.list()).toHaveLength(0);
    expect(repos.pendingQuestions.listOpen()).toHaveLength(0);
  });

  it('metadata present but epicId missing → no-op', async () => {
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { version: 'v1.0' } });
    await expect(consumeStagingApproval(q, { repos, queue })).resolves.toBeUndefined();
    expect(repos.backlog.list()).toHaveLength(0);
  });

  it('metadata present but epicId is empty string → no-op', async () => {
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { epicId: '' } });
    await consumeStagingApproval(q, { repos, queue });
    expect(repos.backlog.list()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Unit — APPROVE branch
// ---------------------------------------------------------------------------

describe('consumeStagingApproval — approve branch', () => {
  it("approve → gate-staging reports become status='approved'", async () => {
    seedEpic('E1', { childPersonas: ['+security-engineer', '+frontend-engineer'] });
    const r1 = seedGateStagingReport('E1', '+security-engineer');
    const r2 = seedGateStagingReport('E1', '+frontend-engineer');

    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { epicId: 'E1' } });
    await consumeStagingApproval(q, { repos, queue });

    expect(repos.reports.get(r1)?.status).toBe('approved');
    expect(repos.reports.get(r2)?.status).toBe('approved');
  });

  it('approve → epic frontmatter staging_approved=true', async () => {
    seedEpic('E2', { childPersonas: ['+security-engineer'] });
    seedGateStagingReport('E2', '+security-engineer');

    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { epicId: 'E2' } });
    await consumeStagingApproval(q, { repos, queue });

    const epic = repos.backlog.get('E2');
    expect(epic?.frontmatter.staging_approved).toBe(true);
  });

  it('approve — no reports exist → frontmatter still updated, no error', async () => {
    seedEpic('E3');
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { epicId: 'E3' } });
    await expect(consumeStagingApproval(q, { repos, queue })).resolves.toBeUndefined();

    const epic = repos.backlog.get('E3');
    expect(epic?.frontmatter.staging_approved).toBe(true);
  });

  it('approve — epic not in DB → no error thrown', async () => {
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { epicId: 'GHOST' } });
    await expect(consumeStagingApproval(q, { repos, queue })).resolves.toBeUndefined();
  });

  it('approve — no version → no preprod-approval question enqueued', async () => {
    seedEpic('E4');
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { epicId: 'E4' } });
    await consumeStagingApproval(q, { repos, queue });

    expect(repos.pendingQuestions.listOpen()).toHaveLength(0);
  });

  it('approve — last epic of version → preprod-approval question enqueued', async () => {
    seedEpic('E5', { version: 'v1.0' });
    const queue = new ApprovalQueue({ repos });
    // E5 is the only epic in v1.0 — after approving it, all epics in version
    // are staging_approved, so a preprod question should fire.
    const q = makeAnswered({ answer: 'approve', metadata: { epicId: 'E5', version: 'v1.0' } });
    await consumeStagingApproval(q, { repos, queue });

    const open = repos.pendingQuestions.listOpen();
    const preprod = open.find((pq) => pq.phase === 'preprod-approval');
    expect(preprod).toBeDefined();
    expect(preprod?.persona).toBe('+prime');
    expect(preprod?.run_id).toBeNull();
    expect(preprod?.metadata?.version).toBe('v1.0');
  });

  it('approve — not the last epic of version → NO preprod-approval question', async () => {
    // Two epics in the same version; only one gets approved.
    seedEpic('E6a', { version: 'v2.0' });
    seedEpic('E6b', { version: 'v2.0' }); // E6b remains unapproved

    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({
      answer: 'approve',
      metadata: { epicId: 'E6a', version: 'v2.0' },
    });
    await consumeStagingApproval(q, { repos, queue });

    const open = repos.pendingQuestions.listOpen();
    expect(open.find((pq) => pq.phase === 'preprod-approval')).toBeUndefined();
  });

  it('approve — second epic approved → preprod question fires (both now approved)', async () => {
    seedEpic('E7a', { version: 'v3.0' });
    seedEpic('E7b', { version: 'v3.0' });

    const queue = new ApprovalQueue({ repos });

    // Approve E7a first
    const q1 = makeAnswered({
      id: 1,
      answer: 'approve',
      metadata: { epicId: 'E7a', version: 'v3.0' },
    });
    await consumeStagingApproval(q1, { repos, queue });
    expect(repos.pendingQuestions.listOpen().find((pq) => pq.phase === 'preprod-approval')).toBeUndefined();

    // Now approve E7b — triggers version completion
    const q2 = makeAnswered({
      id: 2,
      answer: 'approve',
      metadata: { epicId: 'E7b', version: 'v3.0' },
    });
    await consumeStagingApproval(q2, { repos, queue });

    const open = repos.pendingQuestions.listOpen();
    const preprod = open.find((pq) => pq.phase === 'preprod-approval');
    expect(preprod).toBeDefined();
    expect(preprod?.metadata?.version).toBe('v3.0');
  });

  it('approve — re-triggering version completion does NOT enqueue a duplicate preprod-approval', async () => {
    seedEpic('E8a', { version: 'v4.0' });
    seedEpic('E8b', { version: 'v4.0' });
    const queue = new ApprovalQueue({ repos });

    // Approve both → one preprod-approval fires.
    await consumeStagingApproval(
      makeAnswered({ id: 1, answer: 'approve', metadata: { epicId: 'E8a', version: 'v4.0' } }),
      { repos, queue },
    );
    await consumeStagingApproval(
      makeAnswered({ id: 2, answer: 'approve', metadata: { epicId: 'E8b', version: 'v4.0' } }),
      { repos, queue },
    );
    // Re-run completion (e.g. a late/duplicate answer for the same version).
    await consumeStagingApproval(
      makeAnswered({ id: 3, answer: 'approve', metadata: { epicId: 'E8a', version: 'v4.0' } }),
      { repos, queue },
    );

    const preprods = repos.pendingQuestions
      .listOpen()
      .filter((pq) => pq.phase === 'preprod-approval' && pq.metadata?.version === 'v4.0');
    expect(preprods).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Unit — REJECT branch
// ---------------------------------------------------------------------------

describe('consumeStagingApproval — reject branch', () => {
  it("reject → exactly one bug item created with parent_id=epicId", async () => {
    seedEpic('R1');
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'reject', metadata: { epicId: 'R1' } });
    await consumeStagingApproval(q, { repos, queue });

    const bugs = repos.backlog.list({ type: 'bug' });
    expect(bugs).toHaveLength(1);
    expect(bugs[0]!.parent_id).toBe('R1');
    expect(bugs[0]!.type).toBe('bug');
  });

  it('reject → bug title contains epicId', async () => {
    seedEpic('R2');
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'reject', metadata: { epicId: 'R2' } });
    await consumeStagingApproval(q, { repos, queue });

    const bug = repos.backlog.list({ type: 'bug' })[0]!;
    expect(bug.title).toContain('R2');
  });

  it('reject → bug body_md contains the rejection reason/answer text', async () => {
    seedEpic('R3');
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({
      answer: 'reject: UI broken on mobile',
      metadata: { epicId: 'R3' },
    });
    await consumeStagingApproval(q, { repos, queue });

    const bug = repos.backlog.list({ type: 'bug' })[0]!;
    expect(bug.body_md).toContain('reject: UI broken on mobile');
  });

  it('reject → gate-staging reports NOT approved', async () => {
    seedEpic('R4', { childPersonas: ['+security-engineer'] });
    const r1 = seedGateStagingReport('R4', '+security-engineer');

    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'reject', metadata: { epicId: 'R4' } });
    await consumeStagingApproval(q, { repos, queue });

    // Report stays in 'writing', never transitions to 'approved'.
    expect(repos.reports.get(r1)?.status).toBe('writing');
  });

  it('reject → no preprod-approval question enqueued', async () => {
    seedEpic('R5', { version: 'v9.9' });
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({
      answer: 'reject',
      metadata: { epicId: 'R5', version: 'v9.9' },
    });
    await consumeStagingApproval(q, { repos, queue });

    const open = repos.pendingQuestions.listOpen();
    expect(open.find((pq) => pq.phase === 'preprod-approval')).toBeUndefined();
  });

  it('reject — bug id is minted via nextBacklogId (B prefix, numeric)', async () => {
    seedEpic('R6');
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'reject', metadata: { epicId: 'R6' } });
    await consumeStagingApproval(q, { repos, queue });

    const bugs = repos.backlog.list({ type: 'bug' });
    expect(bugs[0]!.id).toMatch(/^B\d+$/);
  });

  it('reject twice → two separate bugs with ascending ids', async () => {
    seedEpic('R7a');
    seedEpic('R7b');
    const queue = new ApprovalQueue({ repos });

    await consumeStagingApproval(
      makeAnswered({ id: 1, answer: 'reject', metadata: { epicId: 'R7a' } }),
      { repos, queue },
    );
    await consumeStagingApproval(
      makeAnswered({ id: 2, answer: 'reject', metadata: { epicId: 'R7b' } }),
      { repos, queue },
    );

    const bugs = repos.backlog.list({ type: 'bug' });
    expect(bugs).toHaveLength(2);
    // Both have distinct ids
    const ids = bugs.map((b) => b.id);
    expect(new Set(ids).size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Route integration — POST /api/questions/:id/answer with staging-approval
// ---------------------------------------------------------------------------

describe('approvalRouter — staging-approval answer integration', () => {
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

  /** Enqueue a staging-approval question via the queue directly and return its id. */
  function enqueueStagingApproval(epicId: string, version?: string): number {
    const q = queue.enqueue({
      runId: null,
      question: `Approve staging for ${epicId}?`,
      choices: ['approve', 'reject'],
      persona: '+prime',
      phase: 'staging-approval',
      metadata: version ? { epicId, version } : { epicId },
    });
    return q.id;
  }

  it('rejecting a staging-approval question → bug in repos.backlog; response still has the question', async () => {
    seedEpic('RT1');
    const qId = enqueueStagingApproval('RT1');

    const res = await fetch(`${baseUrl}/api/questions/${qId}/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        answer: 'reject',
        answered_by: '+prime',
      }),
    });

    // Route still returns 200 + answered question
    expect(res.status).toBe(200);
    const body = await res.json() as { question: PendingQuestion };
    expect(body.question.status).toBe('answered');
    expect(body.question.answer).toBe('reject');

    // Allow the async consumer to run
    await new Promise((r) => setTimeout(r, 50));

    // Bug was created
    const bugs = repos.backlog.list({ type: 'bug' });
    expect(bugs).toHaveLength(1);
    expect(bugs[0]!.parent_id).toBe('RT1');
  });

  it('approving a staging-approval question → epic frontmatter updated; response still has the question', async () => {
    seedEpic('RT2');
    const qId = enqueueStagingApproval('RT2');

    const res = await fetch(`${baseUrl}/api/questions/${qId}/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        answer: 'approve',
        answered_by: '+prime',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { question: PendingQuestion };
    expect(body.question.answer).toBe('approve');

    // Allow the async consumer to run
    await new Promise((r) => setTimeout(r, 50));

    const epic = repos.backlog.get('RT2');
    expect(epic?.frontmatter.staging_approved).toBe(true);
  });

  it('non-staging-approval phase → consumer not triggered, no side-effects', async () => {
    // A regular run-scoped question (not staging-approval)
    const runId = repos.runs.createRun({
      workflow_id: 'dev',
      item_id: null,
      status: 'running',
      worktree_path: null,
      triggered_by: 'test',
    }).id;
    const q = queue.enqueue({ runId, question: 'Regular gate?', choices: ['approve'] });

    const res = await fetch(`${baseUrl}/api/questions/${q.id}/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answer: 'approve', answered_by: 'human' }),
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));

    // No bugs created, no preprod questions
    expect(repos.backlog.list({ type: 'bug' })).toHaveLength(0);
    expect(repos.pendingQuestions.listOpen().find((pq) => pq.phase === 'preprod-approval')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// checkVersionCompletion — deployPreprod integration
// ---------------------------------------------------------------------------

/** Minimal mock deployer for these tests. */
function makeVersionDeployer(opts: { preprodOk?: boolean } = {}): Deployer & {
  preprodCalls: PreprodDeployContext[];
} {
  const preprodCalls: PreprodDeployContext[] = [];
  return {
    name: 'version-mock-deployer',
    async deployStaging(_ctx: DeployContext): Promise<DeployOutcome> {
      return { ok: true, url: null };
    },
    async deployPreprod(ctx: PreprodDeployContext): Promise<DeployOutcome> {
      preprodCalls.push(ctx);
      return { ok: opts.preprodOk ?? true, url: null };
    },
    async deployProd(_ctx: ProdDeployContext): Promise<DeployOutcome> {
      return { ok: true, url: null };
    },
    preprodCalls,
  };
}

describe('checkVersionCompletion — deployPreprod fires before preprod-approval question', () => {
  it('all epics staging-approved + deployPreprod ok → preprod-approval question enqueued', async () => {
    seedEpic('D1', { version: 'v1.0' });
    const deployer = makeVersionDeployer({ preprodOk: true });
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { epicId: 'D1', version: 'v1.0' } });
    await consumeStagingApproval(q, { repos, queue, deployer });

    // deployPreprod was called
    expect(deployer.preprodCalls).toHaveLength(1);
    expect(deployer.preprodCalls[0]!.version).toBe('v1.0');

    // preprod-approval question was enqueued
    const open = repos.pendingQuestions.listOpen();
    expect(open.find((pq) => pq.phase === 'preprod-approval')).toBeDefined();
  });

  it('all epics staging-approved + deployPreprod ok:false → NO preprod-approval question', async () => {
    seedEpic('D2', { version: 'v2.0' });
    const deployer = makeVersionDeployer({ preprodOk: false });
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { epicId: 'D2', version: 'v2.0' } });
    await consumeStagingApproval(q, { repos, queue, deployer });

    // deployPreprod was called but returned not-ok
    expect(deployer.preprodCalls).toHaveLength(1);

    // preprod-approval question was NOT enqueued
    const open = repos.pendingQuestions.listOpen();
    expect(open.find((pq) => pq.phase === 'preprod-approval')).toBeUndefined();
  });

  it('no deployer passed → preprod-approval question still enqueued (backward compat)', async () => {
    seedEpic('D3', { version: 'v3.0' });
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { epicId: 'D3', version: 'v3.0' } });
    // No deployer in deps
    await consumeStagingApproval(q, { repos, queue });

    const open = repos.pendingQuestions.listOpen();
    expect(open.find((pq) => pq.phase === 'preprod-approval')).toBeDefined();
  });

  it('deployPreprod NOT called when not all epics are staging-approved', async () => {
    seedEpic('D4a', { version: 'v4.0' });
    seedEpic('D4b', { version: 'v4.0' }); // D4b remains unapproved
    const deployer = makeVersionDeployer({ preprodOk: true });
    const queue = new ApprovalQueue({ repos });
    const q = makeAnswered({ answer: 'approve', metadata: { epicId: 'D4a', version: 'v4.0' } });
    await consumeStagingApproval(q, { repos, queue, deployer });

    // deployPreprod should NOT have been called (not all epics approved yet)
    expect(deployer.preprodCalls).toHaveLength(0);
  });
});
