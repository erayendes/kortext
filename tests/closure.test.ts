import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { ItemLifecycle } from '../server/engine/item-lifecycle.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { MockMerger } from '../server/engine/executors/mock-merger.ts';
import { MockDeployer } from '../server/engine/executors/mock-deployer.ts';
import { runClosure } from '../server/orchestrator/closure.ts';

let tmpRoot: string;
let agentsDir: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-cl-'));
  agentsDir = join(tmpRoot, 'agents');
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, 'backend-developer.md'),
    '# backend-developer\n\n- description: builds.\n\n## identity\nbody\n',
  );
  const bundle = openDb({ path: join(tmpRoot, 'cl.db') });
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

/** Create an item (optionally under an epic) and walk it to `review`. */
function seedItemInReview(id: string, parentId?: string): ItemLifecycle {
  const lc = makeLifecycle();
  lc.create({ id, type: 'task', title: id, parent_id: parentId ?? null });
  lc.transition(id, 'start', '+backend-developer');
  lc.transition(id, 'test', '+backend-developer');
  lc.transition(id, 'review', 'orchestrator');
  return lc;
}

describe('runClosure — mechanical closure (§5.9 #6, mock-first)', () => {
  it('merge ok → item moves to done', async () => {
    const lc = seedItemInReview('C01');
    const merger = new MockMerger(); // default: ok
    const result = await runClosure('C01', { repos, lifecycle: lc, merger, deployer: new MockDeployer() });
    expect(result.outcome).toBe('done');
    expect(result.merge.ok).toBe(true);
    expect(repos.backlog.get('C01')?.status).toBe('done');
    expect(merger.closedFor).toContain('C01');
  });

  it('merge conflict → item bounces to in_progress with reason in audit', async () => {
    const lc = seedItemInReview('C02');
    const merger = new MockMerger(() => ({ conflict: true, reason: 'config.ts both modified' }));
    const result = await runClosure('C02', { repos, lifecycle: lc, merger, deployer: new MockDeployer() });
    expect(result.outcome).toBe('bounced');
    expect(result.merge.ok).toBe(false);
    expect(repos.backlog.get('C02')?.status).toBe('in_progress');

    const entries = repos.auditLog.list({ resource_type: 'backlog_item', resource_id: 'C02' });
    const bounce = entries.find((e) => (e.payload as { transition?: string }).transition === 'bounce');
    expect(bounce?.payload).toMatchObject({
      to: 'in_progress',
      reason: 'merge conflict: config.ts both modified',
    });
  });

  it('merger throws → item bounces (crash is a failed merge, not a hang)', async () => {
    const lc = seedItemInReview('C03');
    const merger = new MockMerger(() => ({ throws: true, reason: 'git binary missing' }));
    const result = await runClosure('C03', { repos, lifecycle: lc, merger, deployer: new MockDeployer() });
    expect(result.outcome).toBe('bounced');
    expect(result.merge.ok).toBe(false);
    expect(repos.backlog.get('C03')?.status).toBe('in_progress');
  });

  it("item not in 'review' (still in test) → throws a clear guard error", async () => {
    const lc = makeLifecycle();
    lc.create({ id: 'C04', type: 'task', title: 'C04' });
    lc.transition('C04', 'start', '+backend-developer');
    lc.transition('C04', 'test', '+backend-developer'); // stops in test
    const merger = new MockMerger();
    const deployer = new MockDeployer();
    await expect(runClosure('C04', { repos, lifecycle: lc, merger, deployer })).rejects.toThrow(
      /requires item in 'review'/,
    );
    expect(merger.closedFor).toEqual([]); // guard fires before any merge
  });
});

describe('runClosure → epic-completion seam (capstone W2, §5.9 #8)', () => {
  it('closing the last child fires the staging-deploy seam for the epic', async () => {
    // Epic with two children: a sibling already done + the child we now close.
    repos.backlog.create({ id: 'EP1', type: 'epic', title: 'EP1' });
    repos.backlog.create({ id: 'EP1-sib', type: 'task', title: 'sib', parent_id: 'EP1' });
    repos.backlog.transitionStatus('EP1-sib', 'done');

    const lc = seedItemInReview('EP1-last', 'EP1');
    const deployer = new MockDeployer();
    const result = await runClosure('EP1-last', { repos, lifecycle: lc, merger: new MockMerger(), deployer });

    expect(result.outcome).toBe('done');
    expect(result.epic?.epicComplete).toBe(true);
    expect(deployer.deployedFor).toContain('EP1'); // staging deploy triggered
  });

  it('closing a child that leaves a sibling unfinished does not deploy', async () => {
    repos.backlog.create({ id: 'EP2', type: 'epic', title: 'EP2' });
    repos.backlog.create({ id: 'EP2-sib', type: 'task', title: 'sib', parent_id: 'EP2' });
    repos.backlog.transitionStatus('EP2-sib', 'in_progress');

    const lc = seedItemInReview('EP2-last', 'EP2');
    const deployer = new MockDeployer();
    const result = await runClosure('EP2-last', { repos, lifecycle: lc, merger: new MockMerger(), deployer });

    expect(result.outcome).toBe('done');
    expect(result.epic?.epicComplete).toBe(false);
    expect(deployer.deployedFor).toEqual([]);
  });

  it('a merge-conflict bounce never reaches the epic-completion seam', async () => {
    repos.backlog.create({ id: 'EP3', type: 'epic', title: 'EP3' });
    const lc = seedItemInReview('EP3-last', 'EP3');
    const deployer = new MockDeployer();
    const result = await runClosure('EP3-last', {
      repos,
      lifecycle: lc,
      merger: new MockMerger(() => ({ conflict: true, reason: 'x' })),
      deployer,
    });

    expect(result.outcome).toBe('bounced');
    expect(result.epic).toBeNull(); // seam not entered on a bounce
    expect(deployer.deployedFor).toEqual([]);
  });
});
