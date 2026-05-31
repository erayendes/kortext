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

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-ec-'));
  const bundle = openDb({ path: join(tmpRoot, 'ec.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

/** Create an epic with children at the given statuses. Returns the first child id. */
function makeEpic(epicId: string, childStatuses: BacklogStatus[]): string {
  repos.backlog.create({ id: epicId, type: 'epic', title: epicId });
  childStatuses.forEach((st, i) => {
    const cid = `${epicId}-c${i}`;
    repos.backlog.create({ id: cid, type: 'task', title: cid, parent_id: epicId });
    if (st !== 'to_do') repos.backlog.transitionStatus(cid, st);
  });
  return `${epicId}-c0`;
}

describe('runEpicCompletion — epic→staging trigger (§5.9 #8, mock-first)', () => {
  it('all children done → staging deploy triggered for the epic', async () => {
    const child = makeEpic('E1', ['done', 'done']);
    const deployer = new MockDeployer();
    const result = await runEpicCompletion(child, { repos, deployer });
    expect(result.epicId).toBe('E1');
    expect(result.epicComplete).toBe(true);
    expect(result.deploy?.ok).toBe(true);
    expect(deployer.deployedFor).toContain('E1');
  });

  it('item with no parent epic → no-op, no deploy', async () => {
    repos.backlog.create({ id: 'ORPHAN', type: 'task', title: 'ORPHAN' });
    repos.backlog.transitionStatus('ORPHAN', 'done');
    const deployer = new MockDeployer();
    const result = await runEpicCompletion('ORPHAN', { repos, deployer });
    expect(result.epicId).toBeNull();
    expect(result.epicComplete).toBe(false);
    expect(result.deploy).toBeNull();
    expect(deployer.deployedFor).toEqual([]);
  });

  it('a child still in_progress → epic incomplete, no deploy', async () => {
    const child = makeEpic('E2', ['done', 'in_progress']);
    const deployer = new MockDeployer();
    const result = await runEpicCompletion(child, { repos, deployer });
    expect(result.epicComplete).toBe(false);
    expect(result.deploy).toBeNull();
    expect(deployer.deployedFor).toEqual([]);
  });

  it('done + cancelled children (≥1 done, rest terminal) → complete → deploy', async () => {
    const child = makeEpic('E3', ['done', 'cancelled']);
    const deployer = new MockDeployer();
    const result = await runEpicCompletion(child, { repos, deployer });
    expect(result.epicComplete).toBe(true);
    expect(deployer.deployedFor).toContain('E3');
  });

  it('all children cancelled (0 done) → not complete, no deploy', async () => {
    const child = makeEpic('E4', ['cancelled', 'cancelled']);
    const deployer = new MockDeployer();
    const result = await runEpicCompletion(child, { repos, deployer });
    expect(result.epicComplete).toBe(false);
    expect(deployer.deployedFor).toEqual([]);
  });

  it('deployer throws → deploy outcome is not-ok (no crash propagates)', async () => {
    const child = makeEpic('E5', ['done']);
    const deployer = new MockDeployer(() => ({ throws: true, reason: 'CI not green' }));
    const result = await runEpicCompletion(child, { repos, deployer });
    expect(result.epicComplete).toBe(true);
    expect(result.deploy?.ok).toBe(false);
  });
});
