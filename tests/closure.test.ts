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

/** Create an item and walk it to the `review` column (closure's precondition). */
function seedItemInReview(id: string): ItemLifecycle {
  const lc = makeLifecycle();
  lc.create({ id, type: 'task', title: id });
  lc.transition(id, 'start', '+backend-developer');
  lc.transition(id, 'test', '+backend-developer');
  lc.transition(id, 'review', 'orchestrator');
  return lc;
}

describe('runClosure — mechanical closure (§5.9 #6, mock-first)', () => {
  it('merge ok → item moves to done', async () => {
    const lc = seedItemInReview('C01');
    const merger = new MockMerger(); // default: ok
    const result = await runClosure('C01', { repos, lifecycle: lc, merger });
    expect(result.outcome).toBe('done');
    expect(result.merge.ok).toBe(true);
    expect(repos.backlog.get('C01')?.status).toBe('done');
    expect(merger.closedFor).toContain('C01');
  });

  it('merge conflict → item bounces to in_progress with reason in audit', async () => {
    const lc = seedItemInReview('C02');
    const merger = new MockMerger(() => ({ conflict: true, reason: 'config.ts both modified' }));
    const result = await runClosure('C02', { repos, lifecycle: lc, merger });
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
    const result = await runClosure('C03', { repos, lifecycle: lc, merger });
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
    await expect(runClosure('C04', { repos, lifecycle: lc, merger })).rejects.toThrow(
      /requires item in 'review'/,
    );
    expect(merger.closedFor).toEqual([]); // guard fires before any merge
  });
});
