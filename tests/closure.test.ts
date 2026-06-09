import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { ItemLifecycle } from '../server/engine/item-lifecycle.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { HandoverEngine } from '../server/engine/handover.ts';
import { MockMerger } from '../server/engine/executors/mock-merger.ts';
import { MockDeployer } from '../server/engine/executors/mock-deployer.ts';
import { runClosure } from '../server/orchestrator/closure.ts';
import { isBlocked } from '../server/orchestrator/build-order.ts';

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
  writeFileSync(
    join(agentsDir, 'prime.md'),
    '# prime\n\n- description: prime persona.\n\n## identity\nbody\n',
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

function makeHandoverEngine() {
  return new HandoverEngine({
    repos,
    personas: loadPersonasFromDir(agentsDir),
    workspaceRoot: tmpRoot,
    rotation: { disabled: true },
  });
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

describe('runClosure → handover-on-close (B3)', () => {
  it('successful merge writes a handover row + markdown', async () => {
    // Seed with owner set so from_persona is deterministic.
    // seedItemInReview creates the item with no owner; we create it here directly.
    const lc = makeLifecycle();
    lc.create({ id: 'H01', type: 'task', title: 'H01', owner: '+backend-developer' });
    lc.transition('H01', 'start', '+backend-developer');
    lc.transition('H01', 'test', '+backend-developer');
    lc.transition('H01', 'review', 'orchestrator');

    const handoverEngine = makeHandoverEngine();
    const merger = new MockMerger(() => ({ sha: 'abc1234' }));

    const result = await runClosure('H01', {
      repos,
      lifecycle: lc,
      merger,
      deployer: new MockDeployer(),
      handoverEngine,
    });

    expect(result.outcome).toBe('done');

    // DB row created
    const rows = repos.handovers.listByItem('H01');
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.item_id).toBe('H01');
    expect(row.from_persona).toBe('+backend-developer');
    expect(row.to_persona).toBe('+prime');

    // Markdown file written
    const mdPath = join(tmpRoot, '.kortext', 'memory', 'handover.md');
    expect(existsSync(mdPath)).toBe(true);
    const md = readFileSync(mdPath, 'utf8');
    expect(md).toContain('## Handover: H01');
  });

  it('failed merge (bounce) does NOT write a handover', async () => {
    const lc = seedItemInReview('H02');
    const handoverEngine = makeHandoverEngine();

    const result = await runClosure('H02', {
      repos,
      lifecycle: lc,
      merger: new MockMerger(() => ({ conflict: true, reason: 'file conflict' })),
      deployer: new MockDeployer(),
      handoverEngine,
    });

    expect(result.outcome).toBe('bounced');
    expect(repos.handovers.listByItem('H02')).toHaveLength(0);
    const mdPath = join(tmpRoot, '.kortext', 'memory', 'handover.md');
    expect(existsSync(mdPath)).toBe(false);
  });

  it('handoverEngine.record throwing does NOT fail the closure (best-effort)', async () => {
    const lc = seedItemInReview('H03');

    // Build an engine with an unknown persona for toPersona so record() throws
    // (personas validation), but we want to prove the closure still succeeds.
    // The simplest approach: spy on record and throw.
    const handoverEngine = makeHandoverEngine();
    vi.spyOn(handoverEngine, 'record').mockImplementation(() => {
      throw new Error('simulated handover failure');
    });

    const result = await runClosure('H03', {
      repos,
      lifecycle: lc,
      merger: new MockMerger(),
      deployer: new MockDeployer(),
      handoverEngine,
    });

    // Closure still reports done despite the handover engine blowing up
    expect(result.outcome).toBe('done');
    expect(repos.backlog.get('H03')?.status).toBe('done');
  });

  it('no handoverEngine dep → closure still succeeds (optional dep path)', async () => {
    const lc = seedItemInReview('H04');
    const result = await runClosure('H04', {
      repos,
      lifecycle: lc,
      merger: new MockMerger(),
      deployer: new MockDeployer(),
      // no handoverEngine
    });
    expect(result.outcome).toBe('done');
  });
});

// ---------------------------------------------------------------------------
// M1 (UAT #10) — Dependency lock is DERIVED; closure never mutates dependents
// ---------------------------------------------------------------------------
// `blocked` is no longer a status. A dependent with an unresolved `blocked_by`
// waits in `to_do` (derived-locked). Closing its blocker doesn't write to the
// dependent — the lock simply evaporates because `isBlocked` now reads false.

describe('runClosure → dependents stay to_do; lock is derived (M1)', () => {
  it('successful merge of the blocker → dependent stays to_do and is now unlocked', async () => {
    const lc = makeLifecycle();
    lc.create({ id: 'BLK-001', type: 'task', title: 'BLK-001' });
    lc.transition('BLK-001', 'start', '+backend-developer');
    lc.transition('BLK-001', 'test', '+backend-developer');
    lc.transition('BLK-001', 'review', 'orchestrator');

    // The dependent waits in to_do with a blocked_by pointing at BLK-001.
    repos.backlog.create({
      id: 'DEP-001',
      type: 'task',
      title: 'DEP-001',
      status: 'to_do',
      frontmatter: { blocked_by: ['BLK-001'] },
    });

    const result = await runClosure('BLK-001', {
      repos,
      lifecycle: lc,
      merger: new MockMerger(),
      deployer: new MockDeployer(),
    });

    expect(result.outcome).toBe('done');
    expect(repos.backlog.get('BLK-001')!.status).toBe('done');
    // Dependent never moved — still to_do — but is now derived-unlocked.
    const dep = repos.backlog.get('DEP-001')!;
    expect(dep.status).toBe('to_do');
    expect(isBlocked(dep, new Map(repos.backlog.list({ limit: 100 }).map((i) => [i.id, i])))).toBe(false);
  });

  it('bounce (failed merge) → dependent stays to_do but is still locked', async () => {
    const lc = makeLifecycle();
    lc.create({ id: 'BLK-002', type: 'task', title: 'BLK-002' });
    lc.transition('BLK-002', 'start', '+backend-developer');
    lc.transition('BLK-002', 'test', '+backend-developer');
    lc.transition('BLK-002', 'review', 'orchestrator');

    repos.backlog.create({
      id: 'DEP-002',
      type: 'task',
      title: 'DEP-002',
      status: 'to_do',
      frontmatter: { blocked_by: ['BLK-002'] },
    });

    const result = await runClosure('BLK-002', {
      repos,
      lifecycle: lc,
      merger: new MockMerger(() => ({ conflict: true, reason: 'conflict' })),
      deployer: new MockDeployer(),
    });

    expect(result.outcome).toBe('bounced');
    // Blocker bounced back to in_progress — not terminal, so the dependent is
    // still derived-locked, and still parked in to_do.
    expect(repos.backlog.get('BLK-002')!.status).toBe('in_progress');
    const dep = repos.backlog.get('DEP-002')!;
    expect(dep.status).toBe('to_do');
    expect(isBlocked(dep, new Map(repos.backlog.list({ limit: 100 }).map((i) => [i.id, i])))).toBe(true);
  });
});
