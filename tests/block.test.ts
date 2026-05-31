import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { ItemLifecycle } from '../server/engine/item-lifecycle.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { RunRegistry } from '../server/engine/run-registry.ts';
import { blockItem } from '../server/orchestrator/block.ts';

let tmpRoot: string;
let agentsDir: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-bl-'));
  agentsDir = join(tmpRoot, 'agents');
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, 'backend-developer.md'),
    '# backend-developer\n\n- description: builds.\n\n## identity\nbody\n',
  );
  const bundle = openDb({ path: join(tmpRoot, 'bl.db') });
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

/** Create an item and walk it to in_progress (a blockable state). */
function seedItemInProgress(id: string): ItemLifecycle {
  const lc = makeLifecycle();
  lc.create({ id, type: 'task', title: id });
  lc.transition(id, 'start', '+backend-developer');
  return lc;
}

describe('blockItem — block → cancel runs (§5.9 #9)', () => {
  it('blocks an in_progress item with the reason recorded in audit', () => {
    const lc = seedItemInProgress('B1');
    const registry = new RunRegistry();
    const result = blockItem('B1', {
      repos,
      lifecycle: lc,
      registry,
      reason: 'waiting on vendor API',
    });
    expect(result.item.status).toBe('blocked');
    expect(repos.backlog.get('B1')?.status).toBe('blocked');

    const entries = repos.auditLog.list({ resource_type: 'backlog_item', resource_id: 'B1' });
    const block = entries.find((e) => (e.payload as { transition?: string }).transition === 'block');
    expect(block?.payload).toMatchObject({ to: 'blocked', reason: 'waiting on vendor API' });
  });

  it("cancels the item's live run: aborts the agent + marks the run cancelled", () => {
    const lc = seedItemInProgress('B2');
    const run = repos.runs.createRun({
      workflow_id: 'wf',
      item_id: 'B2',
      status: 'running',
      triggered_by: 'orchestrator',
    });
    const ac = new AbortController();
    const registry = new RunRegistry();
    registry.register(run.id, 'B2', ac);

    const result = blockItem('B2', { repos, lifecycle: lc, registry, reason: 'design rethink' });

    expect(ac.signal.aborted).toBe(true); // agent stopped
    expect(repos.runs.getRun(run.id)?.status).toBe('cancelled'); // DB run cancelled
    expect(result.cancelledRunIds).toEqual([run.id]);
    expect(repos.backlog.get('B2')?.status).toBe('blocked');
  });

  it('cancels multiple live runs for the same item', () => {
    const lc = seedItemInProgress('B3');
    const r1 = repos.runs.createRun({ workflow_id: 'wf', item_id: 'B3', status: 'running', triggered_by: 'o' });
    const r2 = repos.runs.createRun({ workflow_id: 'wf', item_id: 'B3', status: 'running', triggered_by: 'o' });
    const registry = new RunRegistry();
    registry.register(r1.id, 'B3', new AbortController());
    registry.register(r2.id, 'B3', new AbortController());

    const result = blockItem('B3', { repos, lifecycle: lc, registry, reason: 'blocked' });

    expect(result.cancelledRunIds.sort()).toEqual([r1.id, r2.id].sort());
    expect(repos.runs.getRun(r1.id)?.status).toBe('cancelled');
    expect(repos.runs.getRun(r2.id)?.status).toBe('cancelled');
  });

  it('blocks cleanly when the item has no live runs', () => {
    const lc = seedItemInProgress('B4');
    const registry = new RunRegistry();
    const result = blockItem('B4', { repos, lifecycle: lc, registry, reason: 'paused' });
    expect(result.cancelledRunIds).toEqual([]);
    expect(repos.backlog.get('B4')?.status).toBe('blocked');
  });

  it('block from an illegal state (to_do) → throws (lifecycle enforces)', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'B5', type: 'task', title: 'B5' }); // stays to_do
    const registry = new RunRegistry();
    expect(() => blockItem('B5', { repos, lifecycle: lc, registry, reason: 'x' })).toThrow();
  });
});
