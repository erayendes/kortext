/**
 * Tests for Task B5 — gate-persona staging reports + prime staging-approval question.
 * Extended in M2a — real writeReport files + epicId/version metadata on approval question.
 *
 * Reuses the epic-completion fixture pattern (openDb + MockDeployer).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
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
import { MarkdownSyncService } from '../server/services/markdown-sync.ts';

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

// ---------------------------------------------------------------------------
// M2a — real report files (writeReport) + epicId/version metadata in question
// ---------------------------------------------------------------------------

describe('runStagingApproval — M2a: real writeReport files', () => {
  it('writes one .kortext/reports/gate-staging_*_*.md file per distinct gate persona', async () => {
    const children = makeEpic('M2A-E1', ['done', 'done']);
    addGateRun(children[0], '+security-engineer');
    addGateRun(children[1]!, '+frontend-engineer');

    const markdownSync = new MarkdownSyncService(repos, { root: tmpRoot });
    const queue = new ApprovalQueue({ repos });
    await runStagingApproval('M2A-E1', { repos, queue, markdownSync });

    const reportsDir = join(tmpRoot, '.kortext', 'reports');
    expect(existsSync(reportsDir)).toBe(true);

    const files = readdirSync(reportsDir).filter((f) => f.startsWith('gate-staging_'));
    expect(files).toHaveLength(2);

    // Each file must match the canonical naming pattern:
    // gate-staging_<slug>_<YYYY-MM-DD_HH-MM-SS>.md (UAT #5 single ts format).
    for (const file of files) {
      expect(file).toMatch(/^gate-staging_[a-z0-9][a-z0-9-]*_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.md$/);
    }
  });

  it('reports_index rows have a REAL file_path (not status=uninitialized)', async () => {
    const children = makeEpic('M2A-E2', ['done', 'done']);
    addGateRun(children[0], '+security-engineer');
    addGateRun(children[1]!, '+frontend-engineer');

    const markdownSync = new MarkdownSyncService(repos, { root: tmpRoot });
    const queue = new ApprovalQueue({ repos });
    await runStagingApproval('M2A-E2', { repos, queue, markdownSync });

    const reports = repos.reports.list({ scope: 'gate-staging', relatedItem: 'M2A-E2' });
    expect(reports).toHaveLength(2);

    for (const row of reports) {
      // Real path starts with .kortext/reports/
      expect(row.file_path).toMatch(/^\.kortext\/reports\/gate-staging_/);
      // Status is 'writing', not 'uninitialized'
      expect(row.status).toBe('writing');
    }
  });

  it('deduplicates personas — one file + one row per distinct persona', async () => {
    const children = makeEpic('M2A-E3', ['done', 'done']);
    addGateRun(children[0], '+qa-engineer');
    addGateRun(children[1]!, '+qa-engineer');

    const markdownSync = new MarkdownSyncService(repos, { root: tmpRoot });
    const queue = new ApprovalQueue({ repos });
    await runStagingApproval('M2A-E3', { repos, queue, markdownSync });

    const reportsDir = join(tmpRoot, '.kortext', 'reports');
    const files = readdirSync(reportsDir).filter((f) => f.startsWith('gate-staging_'));
    expect(files).toHaveLength(1);

    const reports = repos.reports.list({ scope: 'gate-staging', relatedItem: 'M2A-E3' });
    expect(reports).toHaveLength(1);
  });

  it('failed deploy path → no report files created', async () => {
    const children = makeEpic('M2A-E4', ['done']);
    addGateRun(children[0], '+security-engineer');

    const markdownSync = new MarkdownSyncService(repos, { root: tmpRoot });
    const deployer = new MockDeployer(() => ({ fail: true, reason: 'env down' }));
    const queue = new ApprovalQueue({ repos });

    const result = await runEpicCompletion(children[0], { repos, deployer, queue, markdownSync });
    expect(result.deploy?.ok).toBe(false);

    const reportsDir = join(tmpRoot, '.kortext', 'reports');
    const filesExist =
      existsSync(reportsDir) &&
      readdirSync(reportsDir).filter((f) => f.startsWith('gate-staging_')).length > 0;
    expect(filesExist).toBe(false);
  });
});

describe('runStagingApproval — M2a: epicId/version metadata in pending question', () => {
  it('enqueued question metadata contains epicId', async () => {
    makeEpic('M2A-E5', ['done']);
    const queue = new ApprovalQueue({ repos });
    await runStagingApproval('M2A-E5', { repos, queue });

    const open = repos.pendingQuestions.listOpen();
    const approval = open.find((q) => q.phase === 'staging-approval');
    expect(approval).toBeDefined();
    expect(approval?.metadata).toBeDefined();
    expect(approval?.metadata?.epicId).toBe('M2A-E5');
  });

  it('enqueued question metadata contains version when epic has a version', async () => {
    // Create epic with a version
    repos.backlog.create({ id: 'M2A-E6', type: 'epic', title: 'M2A-E6', version: 'v3.1.0' });
    const cid = 'M2A-E6-c0';
    repos.backlog.create({ id: cid, type: 'task', title: cid, parent_id: 'M2A-E6' });
    repos.backlog.transitionStatus(cid, 'done');

    const queue = new ApprovalQueue({ repos });
    await runStagingApproval('M2A-E6', { repos, queue });

    const open = repos.pendingQuestions.listOpen();
    const approval = open.find((q) => q.phase === 'staging-approval');
    expect(approval?.metadata?.epicId).toBe('M2A-E6');
    expect(approval?.metadata?.version).toBe('v3.1.0');
  });

  it('enqueued question metadata omits version when epic has no version', async () => {
    makeEpic('M2A-E7', ['done']);
    const queue = new ApprovalQueue({ repos });
    await runStagingApproval('M2A-E7', { repos, queue });

    const open = repos.pendingQuestions.listOpen();
    const approval = open.find((q) => q.phase === 'staging-approval');
    expect(approval?.metadata?.epicId).toBe('M2A-E7');
    // version key should not be present when null
    expect(Object.prototype.hasOwnProperty.call(approval?.metadata, 'version')).toBe(false);
  });

  it('runEpicCompletion with markdownSync → real files + metadata on question', async () => {
    // Epic with version
    repos.backlog.create({ id: 'M2A-INT1', type: 'epic', title: 'M2A-INT1', version: 'v4.0.0' });
    const cid0 = 'M2A-INT1-c0';
    const cid1 = 'M2A-INT1-c1';
    repos.backlog.create({ id: cid0, type: 'task', title: cid0, parent_id: 'M2A-INT1' });
    repos.backlog.create({ id: cid1, type: 'task', title: cid1, parent_id: 'M2A-INT1' });
    repos.backlog.transitionStatus(cid0, 'done');
    repos.backlog.transitionStatus(cid1, 'done');
    addGateRun(cid0, '+security-engineer');
    addGateRun(cid1, '+frontend-engineer');

    const markdownSync = new MarkdownSyncService(repos, { root: tmpRoot });
    const deployer = new MockDeployer();
    const queue = new ApprovalQueue({ repos });

    const result = await runEpicCompletion(cid0, { repos, deployer, queue, markdownSync });
    expect(result.epicComplete).toBe(true);
    expect(result.deploy?.ok).toBe(true);

    // Real files on disk
    const reportsDir = join(tmpRoot, '.kortext', 'reports');
    const files = readdirSync(reportsDir).filter((f) => f.startsWith('gate-staging_'));
    expect(files).toHaveLength(2);

    // Question metadata
    const open = repos.pendingQuestions.listOpen();
    const approval = open.find((q) => q.phase === 'staging-approval' && q.persona === '+prime');
    expect(approval?.metadata?.epicId).toBe('M2A-INT1');
    expect(approval?.metadata?.version).toBe('v4.0.0');
  });
});
