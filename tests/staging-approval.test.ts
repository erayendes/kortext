/**
 * Tests for Task B5 — gate-persona staging reports + prime staging-approval question.
 *
 * Reuses the epic-completion fixture pattern (openDb + MockDeployer).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import type { BacklogStatus } from '../server/db/schemas.ts';
import { MockDeployer } from '../server/engine/executors/mock-deployer.ts';
import { runEpicCompletion } from '../server/orchestrator/epic-completion.ts';
import { ApprovalQueue } from '../server/orchestrator/approval-queue.ts';
import { runStagingApproval } from '../server/orchestrator/staging-approval.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-sa-'));
  const bundle = openDb({ path: join(tmpRoot, 'sa.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

/** Create an epic with N children; return child ids (never undefined — length equals input). */
function makeEpic(epicId: string, childStatuses: BacklogStatus[]): [string, ...string[]] {
  repos.backlog.create({ id: epicId, type: 'epic', title: epicId });
  const ids = childStatuses.map((st, i) => {
    const cid = `${epicId}-c${i}`;
    repos.backlog.create({ id: cid, type: 'task', title: cid, parent_id: epicId });
    if (st !== 'to_do') repos.backlog.transitionStatus(cid, st);
    return cid;
  });
  if (ids.length === 0) throw new Error('makeEpic requires at least one child');
  return ids as [string, ...string[]];
}

/** Seed a gate_run for a child with a given persona. */
function addGateRun(itemId: string, persona: string) {
  repos.gateRuns.create({
    item_id: itemId,
    gate: 'code_review',
    persona,
    attempt: 1,
    status: 'pass',
  });
}

// ---------------------------------------------------------------------------
// 5a — gate-persona staging reports
// ---------------------------------------------------------------------------

describe('runStagingApproval — gate-persona staging reports (5a)', () => {
  it('epic with 2 children under 2 distinct personas → 2 gate-staging report rows', async () => {
    const children1 = makeEpic('SA-E1', ['done', 'done']);
    addGateRun(children1[0], '+security-engineer');
    addGateRun(children1[1]!, '+frontend-engineer');

    const queue = new ApprovalQueue({ repos });
    await runStagingApproval('SA-E1', { repos, queue });

    const reports = repos.reports.list({ scope: 'gate-staging', relatedItem: 'SA-E1' });
    expect(reports).toHaveLength(2);
    const authors = reports.map((r) => r.author).sort();
    expect(authors).toEqual(['+frontend-engineer', '+security-engineer']);
    reports.forEach((r) => {
      expect(r.scope).toBe('gate-staging');
      expect(r.status).toBe('uninitialized');
      expect(r.related_item).toBe('SA-E1');
    });
  });

  it('two children with the same persona → deduplicated to 1 report row', async () => {
    const children2 = makeEpic('SA-E2', ['done', 'done']);
    addGateRun(children2[0], '+qa-engineer');
    addGateRun(children2[1]!, '+qa-engineer');

    const queue = new ApprovalQueue({ repos });
    await runStagingApproval('SA-E2', { repos, queue });

    const reports = repos.reports.list({ scope: 'gate-staging', relatedItem: 'SA-E2' });
    expect(reports).toHaveLength(1);
    expect(reports[0]!.author).toBe('+qa-engineer');
  });

  it('children with no gate runs → 0 gate-staging reports (approval still enqueued)', async () => {
    makeEpic('SA-E3', ['done']);
    const queue = new ApprovalQueue({ repos });
    await runStagingApproval('SA-E3', { repos, queue });

    const reports = repos.reports.list({ scope: 'gate-staging', relatedItem: 'SA-E3' });
    expect(reports).toHaveLength(0);

    const open = repos.pendingQuestions.listOpen();
    expect(open.some((q) => q.phase === 'staging-approval')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5b — prime staging-approval question
// ---------------------------------------------------------------------------

describe('runStagingApproval — prime staging-approval question (5b)', () => {
  it('enqueues a pending_question with phase=staging-approval, persona=+prime, run_id=null', async () => {
    makeEpic('SA-E4', ['done']);
    const queue = new ApprovalQueue({ repos });
    await runStagingApproval('SA-E4', { repos, queue });

    const open = repos.pendingQuestions.listOpen();
    const approval = open.find((q) => q.phase === 'staging-approval');
    expect(approval).toBeDefined();
    expect(approval?.persona).toBe('+prime');
    expect(approval?.run_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ApprovalQueue.enqueue accepts runId: null (type + runtime — test 3)
// ---------------------------------------------------------------------------

describe('ApprovalQueue.enqueue — accepts runId: null', () => {
  it('enqueue with runId=null creates an open pending_question with run_id=null', () => {
    const queue = new ApprovalQueue({ repos });
    const created = queue.enqueue({
      runId: null,
      question: 'Staging build OK?',
      choices: ['approve', 'reject'],
      phase: 'staging-approval',
      persona: '+prime',
    });
    expect(created.status).toBe('open');
    expect(created.run_id).toBeNull();
    expect(created.phase).toBe('staging-approval');
    expect(created.persona).toBe('+prime');
  });
});

// ---------------------------------------------------------------------------
// Integration through runEpicCompletion — test 1 & 2 combined
// ---------------------------------------------------------------------------

describe('runEpicCompletion integration — staging-approval wired in (Task B5)', () => {
  it('epic with 2 children / 2 gate personas + successful deploy → 2 gate-staging reports + approval question', async () => {
    const intChildren1 = makeEpic('SA-INT1', ['done', 'done']);
    addGateRun(intChildren1[0], '+security-engineer');
    addGateRun(intChildren1[1]!, '+frontend-engineer');

    const deployer = new MockDeployer(); // ok: true by default
    const queue = new ApprovalQueue({ repos });

    const result = await runEpicCompletion(intChildren1[0], { repos, deployer, queue });
    expect(result.epicComplete).toBe(true);
    expect(result.deploy?.ok).toBe(true);

    // 2 gate-staging report rows
    const reports = repos.reports.list({ scope: 'gate-staging', relatedItem: 'SA-INT1' });
    expect(reports).toHaveLength(2);

    // staging-approval question for +prime with run_id=null
    const open = repos.pendingQuestions.listOpen();
    const approval = open.find((q) => q.phase === 'staging-approval' && q.persona === '+prime');
    expect(approval).toBeDefined();
    expect(approval?.run_id).toBeNull();
  });

  it('failed deploy (deploy.ok=false) → no gate-staging reports, no staging-approval question', async () => {
    const intChildren2 = makeEpic('SA-INT2', ['done']);
    addGateRun(intChildren2[0], '+security-engineer');

    const deployer = new MockDeployer(() => ({ fail: true, reason: 'env down' }));
    const queue = new ApprovalQueue({ repos });

    const result = await runEpicCompletion(intChildren2[0], { repos, deployer, queue });
    expect(result.epicComplete).toBe(true);
    expect(result.deploy?.ok).toBe(false);

    // No reports created
    const reports = repos.reports.list({ scope: 'gate-staging', relatedItem: 'SA-INT2' });
    expect(reports).toHaveLength(0);

    // No staging-approval question
    const open = repos.pendingQuestions.listOpen();
    expect(open.some((q) => q.phase === 'staging-approval')).toBe(false);
  });

  it('no queue dep → staging-approval skipped silently (backwards compat)', async () => {
    const intChildren3 = makeEpic('SA-INT3', ['done']);
    addGateRun(intChildren3[0], '+security-engineer');

    const deployer = new MockDeployer();
    // No queue passed
    const result = await runEpicCompletion(intChildren3[0], { repos, deployer });
    expect(result.epicComplete).toBe(true);
    expect(result.deploy?.ok).toBe(true);

    // No reports, no questions
    const reports = repos.reports.list({ scope: 'gate-staging', relatedItem: 'SA-INT3' });
    expect(reports).toHaveLength(0);
    expect(repos.pendingQuestions.listOpen()).toHaveLength(0);
  });
});
