import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { ItemLifecycle, IllegalTransitionError } from '../server/engine/item-lifecycle.ts';

let tmpRoot: string;
let agentsDir: string;
let db: Database.Database;
let repos: Repositories;

const personaMd = (handle: string) =>
  `# ${handle}\n\n- description: ${handle} role.\n\n## identity\nbody\n`;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-item-'));
  agentsDir = join(tmpRoot, 'agents');
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(join(agentsDir, 'backend-developer.md'), personaMd('backend-developer'));
  writeFileSync(join(agentsDir, 'qa-engineer.md'), personaMd('qa-engineer'));
  const bundle = openDb({ path: join(tmpRoot, 'item.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

function makeLifecycle() {
  return new ItemLifecycle({
    repos,
    personas: loadPersonasFromDir(agentsDir),
  });
}

describe('ItemLifecycle.create', () => {
  it('creates a task with default status to_do', () => {
    const lc = makeLifecycle();
    const item = lc.create({ id: 'T01', type: 'task', title: 'Login form' });
    expect(item.id).toBe('T01');
    expect(item.status).toBe('to_do');
    expect(item.title).toBe('Login form');
  });

  it('throws when the owner persona is unknown to the registry', () => {
    const lc = makeLifecycle();
    expect(() =>
      lc.create({ id: 'T01', type: 'task', title: 'x', owner: '+ghost' }),
    ).toThrow(/unknown persona|owner.*ghost/i);
  });

  it('accepts a known persona as owner', () => {
    const lc = makeLifecycle();
    const item = lc.create({
      id: 'T01',
      type: 'task',
      title: 'x',
      owner: '+backend-developer',
    });
    expect(item.owner).toBe('+backend-developer');
  });
});

describe('ItemLifecycle.transition — happy paths', () => {
  it('to_do → start → in_progress', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T', type: 'task', title: 't' });
    const after = lc.transition('T', 'start', '+backend-developer');
    expect(after.status).toBe('in_progress');
  });

  it('full chain: to_do → start → test → review → done', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T', type: 'task', title: 't' });
    lc.transition('T', 'start', '+backend-developer');
    expect(lc.transition('T', 'test', '+backend-developer').status).toBe('test');
    expect(lc.transition('T', 'review', '+qa-engineer').status).toBe('review');
    expect(lc.transition('T', 'done', '+qa-engineer').status).toBe('done');
  });

  it('block then unblock: in_progress → block → blocked → unblock → in_progress', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T', type: 'task', title: 't' });
    lc.transition('T', 'start', '+backend-developer');
    expect(lc.transition('T', 'block', '+backend-developer', 'waiting on +db-admin').status).toBe('blocked');
    expect(lc.transition('T', 'unblock', '+backend-developer').status).toBe('in_progress');
  });

  it('cancel works from any non-terminal state', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T1', type: 'task', title: 't1' });
    lc.create({ id: 'T2', type: 'task', title: 't2' });
    lc.transition('T2', 'start', '+backend-developer');

    expect(lc.transition('T1', 'cancel', '+backend-developer').status).toBe('cancelled');
    expect(lc.transition('T2', 'cancel', '+backend-developer').status).toBe('cancelled');
  });

  it('in_progress → test → review (gate-join all-pass path)', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T', type: 'task', title: 't' });
    lc.transition('T', 'start', '+backend-developer');
    expect(lc.transition('T', 'test', '+backend-developer').status).toBe('test');
    expect(lc.transition('T', 'review', '+qa-engineer').status).toBe('review');
  });

  it('test → bounce → in_progress (gate fail), then re-test → review → done', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T', type: 'task', title: 't' });
    lc.transition('T', 'start', '+backend-developer');
    lc.transition('T', 'test', '+backend-developer');
    expect(
      lc.transition('T', 'bounce', '+qa-engineer', 'code_review failed').status,
    ).toBe('in_progress');
    lc.transition('T', 'test', '+backend-developer');
    expect(lc.transition('T', 'review', '+qa-engineer').status).toBe('review');
    expect(lc.transition('T', 'done', '+qa-engineer').status).toBe('done');
  });

  it('review → bounce → in_progress (UAT reject), then test → review → done', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T', type: 'task', title: 't' });
    lc.transition('T', 'start', '+backend-developer');
    lc.transition('T', 'test', '+backend-developer');
    lc.transition('T', 'review', '+qa-engineer');
    expect(lc.transition('T', 'bounce', '+prime', 'uat reject').status).toBe(
      'in_progress',
    );
    lc.transition('T', 'test', '+backend-developer');
    expect(lc.transition('T', 'review', '+qa-engineer').status).toBe('review');
    expect(lc.transition('T', 'done', '+qa-engineer').status).toBe('done');
  });

  it('0-gate item still routes through test (mandatory test column, §5.8)', () => {
    // Even with no gates selected, the orchestrator runs the join from `test`
    // and moves test → review. There is no in_progress → review shortcut.
    const lc = makeLifecycle();
    lc.create({ id: 'T', type: 'task', title: 't' });
    lc.transition('T', 'start', '+backend-developer');
    expect(lc.transition('T', 'test', '+backend-developer').status).toBe('test');
    expect(lc.transition('T', 'review', '+qa-engineer').status).toBe('review');
  });

  it('block from test: in_progress → test → block → blocked → unblock → in_progress', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T', type: 'task', title: 't' });
    lc.transition('T', 'start', '+backend-developer');
    lc.transition('T', 'test', '+backend-developer');
    expect(lc.transition('T', 'block', '+qa-engineer', 'flaky env').status).toBe(
      'blocked',
    );
    expect(lc.transition('T', 'unblock', '+backend-developer').status).toBe(
      'in_progress',
    );
  });

  it('cancel works from test', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T', type: 'task', title: 't' });
    lc.transition('T', 'start', '+backend-developer');
    lc.transition('T', 'test', '+backend-developer');
    expect(lc.transition('T', 'cancel', '+backend-developer').status).toBe(
      'cancelled',
    );
  });

  it('full bounce loop reaches done: start→test→bounce→test→review→bounce→test→review→done', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T', type: 'task', title: 't' });
    lc.transition('T', 'start', '+backend-developer');
    lc.transition('T', 'test', '+backend-developer');
    lc.transition('T', 'bounce', '+qa-engineer', 'gate fail'); // back to dev
    lc.transition('T', 'test', '+backend-developer');
    lc.transition('T', 'review', '+qa-engineer');
    lc.transition('T', 'bounce', '+prime', 'uat reject'); // back to dev
    lc.transition('T', 'test', '+backend-developer');
    lc.transition('T', 'review', '+qa-engineer');
    expect(lc.transition('T', 'done', '+qa-engineer').status).toBe('done');
  });
});

describe('ItemLifecycle.transition — illegal moves', () => {
  it('rejects to_do → review (must start first)', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T', type: 'task', title: 't' });
    expect(() => lc.transition('T', 'review', '+backend-developer')).toThrow(
      IllegalTransitionError,
    );
  });

  it('rejects transitions out of done (terminal)', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T', type: 'task', title: 't' });
    lc.transition('T', 'start', '+backend-developer');
    lc.transition('T', 'test', '+backend-developer');
    lc.transition('T', 'review', '+qa-engineer');
    lc.transition('T', 'done', '+qa-engineer');
    expect(() => lc.transition('T', 'start', '+backend-developer')).toThrow(
      IllegalTransitionError,
    );
  });

  it('rejects transitions out of cancelled (terminal)', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T', type: 'task', title: 't' });
    lc.transition('T', 'cancel', '+backend-developer');
    expect(() => lc.transition('T', 'start', '+backend-developer')).toThrow(
      IllegalTransitionError,
    );
  });

  it('throws a clear error for an unknown item id', () => {
    const lc = makeLifecycle();
    expect(() => lc.transition('NOPE', 'start', '+backend-developer')).toThrow(/not found/i);
  });

  it('rejects in_progress → review (must go through test)', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T', type: 'task', title: 't' });
    lc.transition('T', 'start', '+backend-developer');
    expect(() => lc.transition('T', 'review', '+backend-developer')).toThrow(
      IllegalTransitionError,
    );
  });

  it('rejects in_progress → done', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T', type: 'task', title: 't' });
    lc.transition('T', 'start', '+backend-developer');
    expect(() => lc.transition('T', 'done', '+qa-engineer')).toThrow(
      IllegalTransitionError,
    );
  });

  it('rejects test → done (must pass review first)', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T', type: 'task', title: 't' });
    lc.transition('T', 'start', '+backend-developer');
    lc.transition('T', 'test', '+backend-developer');
    expect(() => lc.transition('T', 'done', '+qa-engineer')).toThrow(
      IllegalTransitionError,
    );
  });

  it('rejects to_do → test (must start first)', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T', type: 'task', title: 't' });
    expect(() => lc.transition('T', 'test', '+backend-developer')).toThrow(
      IllegalTransitionError,
    );
  });

  it('rejects bounce from in_progress (only from test or review)', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T', type: 'task', title: 't' });
    lc.transition('T', 'start', '+backend-developer');
    expect(() => lc.transition('T', 'bounce', '+backend-developer')).toThrow(
      IllegalTransitionError,
    );
  });

  it('rejects review → test (re-test only via bounce → in_progress)', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T', type: 'task', title: 't' });
    lc.transition('T', 'start', '+backend-developer');
    lc.transition('T', 'test', '+backend-developer');
    lc.transition('T', 'review', '+qa-engineer');
    expect(() => lc.transition('T', 'test', '+backend-developer')).toThrow(
      IllegalTransitionError,
    );
  });
});

describe('ItemLifecycle audit log', () => {
  it('writes an audit_log entry for each transition with from/to snapshot', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T', type: 'task', title: 't' });
    lc.transition('T', 'start', '+backend-developer', 'kick-off');

    const entries = repos.auditLog.list({
      resource_type: 'backlog_item',
      resource_id: 'T',
    });
    expect(entries.length).toBe(1);
    const item = entries[0];
    expect(item?.action).toBe('item_transition');
    expect(item?.actor).toBe('+backend-developer');
    expect(item?.payload).toMatchObject({
      from: 'to_do',
      to: 'in_progress',
      transition: 'start',
      reason: 'kick-off',
    });
  });
});

describe('ItemLifecycle.listOpen', () => {
  it('returns only items in non-terminal states', () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T1', type: 'task', title: 't1' }); // to_do
    lc.create({ id: 'T2', type: 'task', title: 't2' });
    lc.create({ id: 'T3', type: 'task', title: 't3' });
    lc.create({ id: 'T4', type: 'task', title: 't4' });
    lc.transition('T2', 'start', '+backend-developer'); // in_progress
    lc.transition('T3', 'start', '+backend-developer');
    lc.transition('T3', 'test', '+backend-developer');
    lc.transition('T3', 'review', '+qa-engineer');
    lc.transition('T3', 'done', '+qa-engineer'); // done — terminal
    lc.transition('T4', 'cancel', '+backend-developer'); // cancelled — terminal

    const open = lc.listOpen();
    const openIds = open.map((i) => i.id).sort();
    expect(openIds).toEqual(['T1', 'T2']);
  });
});
