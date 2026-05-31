import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { ItemLifecycle } from '../server/engine/item-lifecycle.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { MockReviewApprover } from '../server/engine/executors/mock-review-approver.ts';
import { MockGateExecutor } from '../server/engine/executors/mock-gate-executor.ts';
import { MockMerger } from '../server/engine/executors/mock-merger.ts';
import { MockDeployer } from '../server/engine/executors/mock-deployer.ts';
import { runReviewCycle } from '../server/orchestrator/review-cycle.ts';
import { runTestCycle } from '../server/orchestrator/test-cycle.ts';
import type { Gate } from '../server/db/schemas.ts';

let tmpRoot: string;
let agentsDir: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-rc-'));
  agentsDir = join(tmpRoot, 'agents');
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, 'backend-developer.md'),
    '# backend-developer\n\n- description: builds.\n\n## identity\nbody\n',
  );
  const bundle = openDb({ path: join(tmpRoot, 'rc.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

function makeLifecycle() {
  return new ItemLifecycle({ repos, personas: loadPersonasFromDir(agentsDir) });
}

/** Create an item, set its gate checklist, and walk it to the `review` column. */
function seedItemInReview(id: string, gates: Gate[]): ItemLifecycle {
  const lc = makeLifecycle();
  lc.create({ id, type: 'task', title: id });
  repos.backlog.setReviewGates(id, gates);
  lc.transition(id, 'start', '+backend-developer');
  lc.transition(id, 'test', '+backend-developer');
  lc.transition(id, 'review', 'orchestrator');
  return lc;
}

describe('runReviewCycle — uat gate (§5.9, Madde 4 eşi)', () => {
  it('uat selected + approved → item moves to done', async () => {
    const lc = seedItemInReview('R01', ['uat']);
    const approver = new MockReviewApprover(); // default: approve
    const result = await runReviewCycle('R01', { repos, lifecycle: lc, approver, merger: new MockMerger(), deployer: new MockDeployer() });
    expect(result.outcome).toBe('done');
    expect(result.uatRequired).toBe(true);
    expect(result.verdict?.approved).toBe(true);
    expect(repos.backlog.get('R01')?.status).toBe('done');
    expect(approver.ranFor).toContain('R01');
  });

  it('uat selected + rejected → item bounces to in_progress with reason in audit', async () => {
    const lc = seedItemInReview('R02', ['uat']);
    const approver = new MockReviewApprover(() => ({
      reject: true,
      reason: 'checkout flow broken on mobile',
    }));
    const result = await runReviewCycle('R02', { repos, lifecycle: lc, approver, merger: new MockMerger(), deployer: new MockDeployer() });
    expect(result.outcome).toBe('bounced');
    expect(result.verdict?.approved).toBe(false);
    expect(repos.backlog.get('R02')?.status).toBe('in_progress');

    const entries = repos.auditLog.list({ resource_type: 'backlog_item', resource_id: 'R02' });
    const bounce = entries.find((e) => (e.payload as { transition?: string }).transition === 'bounce');
    expect(bounce?.payload).toMatchObject({
      to: 'in_progress',
      reason: 'uat rejected: checkout flow broken on mobile',
    });
  });

  it('uat not selected → done without consulting approver (vacuous, §5.8)', async () => {
    const lc = seedItemInReview('R03', ['code_review']); // checklist has no uat
    const approver = new MockReviewApprover();
    const result = await runReviewCycle('R03', { repos, lifecycle: lc, approver, merger: new MockMerger(), deployer: new MockDeployer() });
    expect(result.outcome).toBe('done');
    expect(result.uatRequired).toBe(false);
    expect(result.verdict).toBeNull();
    expect(repos.backlog.get('R03')?.status).toBe('done');
    expect(approver.ranFor).toEqual([]); // no human asked
  });

  it("item not in 'review' (still in test) → throws a clear guard error", async () => {
    const lc = makeLifecycle();
    lc.create({ id: 'R04', type: 'task', title: 'R04' });
    repos.backlog.setReviewGates('R04', ['uat']);
    lc.transition('R04', 'start', '+backend-developer');
    lc.transition('R04', 'test', '+backend-developer'); // stops in test, never reaches review
    const approver = new MockReviewApprover();
    await expect(
      runReviewCycle('R04', { repos, lifecycle: lc, approver, merger: new MockMerger(), deployer: new MockDeployer() }),
    ).rejects.toThrow(/requires item in 'review'/);
    expect(approver.ranFor).toEqual([]); // guard fires before any approval
  });

  it('approver throws → item bounces (crash is a non-approval, not a hang)', async () => {
    const lc = seedItemInReview('R05', ['uat']);
    const approver = new MockReviewApprover(() => ({ throws: true, reason: 'prime queue offline' }));
    const result = await runReviewCycle('R05', { repos, lifecycle: lc, approver, merger: new MockMerger(), deployer: new MockDeployer() });
    expect(result.outcome).toBe('bounced');
    expect(result.verdict?.approved).toBe(false);
    expect(repos.backlog.get('R05')?.status).toBe('in_progress');
  });

  // Integration: the test-cycle → review-cycle handoff. Locks in the contract
  // that test-cycle leaves the item in exactly the status review-cycle requires.
  it('end-to-end: in_progress → test (gates pass) → review → uat approve → done', async () => {
    const lc = makeLifecycle();
    lc.create({ id: 'R06', type: 'task', title: 'R06' });
    repos.backlog.setReviewGates('R06', ['code_review', 'uat']);
    lc.transition('R06', 'start', '+backend-developer');
    lc.transition('R06', 'test', '+backend-developer');

    // test-cycle: the one selected test gate passes → review (uat is not a test gate).
    const tc = await runTestCycle('R06', { repos, lifecycle: lc, gateExecutor: new MockGateExecutor() });
    expect(tc.outcome).toBe('review');
    expect(repos.backlog.get('R06')?.status).toBe('review');

    // review-cycle: prime approves the uat gate → done.
    const rc = await runReviewCycle('R06', {
      repos,
      lifecycle: lc,
      approver: new MockReviewApprover(),
      merger: new MockMerger(),
      deployer: new MockDeployer(),
    });
    expect(rc.outcome).toBe('done');
    expect(rc.uatRequired).toBe(true);
    expect(repos.backlog.get('R06')?.status).toBe('done');
  });

  it('uat approved but merge conflicts in closure → bounced (prime approved, merge did not)', async () => {
    const lc = seedItemInReview('R07', ['uat']);
    const result = await runReviewCycle('R07', {
      repos,
      lifecycle: lc,
      approver: new MockReviewApprover(), // prime approves
      merger: new MockMerger(() => ({ conflict: true, reason: 'package-lock.json' })),
      deployer: new MockDeployer(),
    });
    expect(result.verdict?.approved).toBe(true); // the approval happened
    expect(result.outcome).toBe('bounced'); // but closure bounced it
    expect(repos.backlog.get('R07')?.status).toBe('in_progress');
  });
});
