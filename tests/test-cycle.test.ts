import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { ItemLifecycle } from '../server/engine/item-lifecycle.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { MockGateExecutor } from '../server/engine/executors/mock-gate-executor.ts';
import { runTestCycle, TEST_GATES, GATE_PERSONA } from '../server/orchestrator/test-cycle.ts';
import { readAcceptanceCriteria } from '../server/engine/acceptance-criteria.ts';
import type { Gate } from '../server/db/schemas.ts';

let tmpRoot: string;
let agentsDir: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-tc-'));
  agentsDir = join(tmpRoot, 'agents');
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, 'backend-developer.md'),
    '# backend-developer\n\n- description: builds.\n\n## identity\nbody\n',
  );
  const bundle = openDb({ path: join(tmpRoot, 'tc.db') });
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

/** Create an item, set its gate checklist, and walk it to the `test` column. */
function seedItemInTest(id: string, gates: Gate[]): ItemLifecycle {
  const lc = makeLifecycle();
  lc.create({ id, type: 'task', title: id });
  repos.backlog.setReviewGates(id, gates);
  lc.transition(id, 'start', '+backend-developer');
  lc.transition(id, 'test', '+backend-developer');
  return lc;
}

describe('runTestCycle — join (§5.9 #4)', () => {
  it('all selected test-gates pass → item moves to review', async () => {
    const lc = seedItemInTest('T01', ['code_review', 'quality_control']);
    const result = await runTestCycle('T01', {
      repos,
      lifecycle: lc,
      gateExecutor: new MockGateExecutor(() => ({})), // all pass
    });
    expect(result.outcome).toBe('review');
    expect(result.attempt).toBe(1);
    expect(result.failed).toEqual([]);
    expect(result.gates).toHaveLength(2);
    expect(result.gates.every((g) => g.status === 'pass')).toBe(true);
    expect(repos.backlog.get('T01')?.status).toBe('review');
  });

  it('≥1 gate fail → item bounces to in_progress with findings persisted', async () => {
    const lc = seedItemInTest('T01', ['code_review', 'security_control']);
    const result = await runTestCycle('T01', {
      repos,
      lifecycle: lc,
      gateExecutor: new MockGateExecutor((ctx) =>
        ctx.gate === 'security_control'
          ? { fail: true, findings: 'hardcoded secret in config.ts:12' }
          : {},
      ),
    });
    expect(result.outcome).toBe('bounced');
    expect(result.failed).toEqual(['security_control']);
    expect(repos.backlog.get('T01')?.status).toBe('in_progress');
    const sec = result.gates.find((g) => g.gate === 'security_control');
    expect(sec?.status).toBe('fail');
    expect(sec?.findings).toBe('hardcoded secret in config.ts:12');
  });

  it('0 test-gates selected → review (vacuous pass, §5.8)', async () => {
    const lc = seedItemInTest('T01', []);
    const result = await runTestCycle('T01', {
      repos,
      lifecycle: lc,
      gateExecutor: new MockGateExecutor(() => ({})),
    });
    expect(result.outcome).toBe('review');
    expect(result.gates).toHaveLength(0);
    expect(repos.backlog.get('T01')?.status).toBe('review');
  });

  it('uat is NOT a parallel test-gate — excluded from fan-out (test-cycle.md)', async () => {
    const lc = seedItemInTest('T01', ['code_review', 'uat']);
    const mock = new MockGateExecutor(() => ({}));
    const result = await runTestCycle('T01', { repos, lifecycle: lc, gateExecutor: mock });
    // only code_review runs; uat handled later in the review column.
    expect(mock.ranOrder).toEqual(['code_review']);
    expect(result.gates.map((g) => g.gate)).toEqual(['code_review']);
    expect(result.outcome).toBe('review');
  });

  it('runs the selected gates in parallel', async () => {
    const lc = seedItemInTest('T01', [...TEST_GATES]);
    const mock = new MockGateExecutor(() => ({ durationMs: 20 }));
    await runTestCycle('T01', { repos, lifecycle: lc, gateExecutor: mock });
    expect(mock.maxConcurrent).toBeGreaterThanOrEqual(2);
  });

  it('records the canonical persona on each gate_run', async () => {
    const lc = seedItemInTest('T01', ['quality_control']);
    const result = await runTestCycle('T01', {
      repos,
      lifecycle: lc,
      gateExecutor: new MockGateExecutor(() => ({})),
    });
    expect(result.gates[0]?.persona).toBe(GATE_PERSONA.quality_control);
  });

  it('a throwing gate executor fails that gate (bounce, never hangs)', async () => {
    const lc = seedItemInTest('T01', ['code_review']);
    const result = await runTestCycle('T01', {
      repos,
      lifecycle: lc,
      gateExecutor: new MockGateExecutor(() => {
        throw new Error('agent crashed');
      }),
    });
    expect(result.outcome).toBe('bounced');
    expect(result.gates[0]?.status).toBe('fail');
    expect(result.gates[0]?.findings).toMatch(/agent crashed/);
    expect(repos.backlog.get('T01')?.status).toBe('in_progress');
  });

  it('re-test after a bounce uses attempt 2 and reads only its own cycle (§5.13)', async () => {
    const lc = seedItemInTest('T01', ['code_review']);
    // Attempt 1: code_review fails → bounce to in_progress.
    const first = await runTestCycle('T01', {
      repos,
      lifecycle: lc,
      gateExecutor: new MockGateExecutor((ctx) =>
        ctx.attempt === 1 ? { fail: true, findings: 'missing tests' } : {},
      ),
    });
    expect(first.outcome).toBe('bounced');
    expect(first.attempt).toBe(1);
    expect(repos.backlog.get('T01')?.status).toBe('in_progress');

    // Developer fixes, item re-enters test.
    lc.transition('T01', 'test', '+backend-developer');
    const second = await runTestCycle('T01', {
      repos,
      lifecycle: lc,
      gateExecutor: new MockGateExecutor((ctx) =>
        ctx.attempt === 1 ? { fail: true } : {}, // attempt 2 passes
      ),
    });
    expect(second.attempt).toBe(2);
    expect(second.outcome).toBe('review');
    expect(repos.backlog.get('T01')?.status).toBe('review');
    // Both cycles preserved in history; the join only read attempt 2.
    expect(repos.gateRuns.listForItem('T01')).toHaveLength(2);
  });

  it('a gate returning acResults marks the item AC done flags (#4)', async () => {
    const lc = seedItemInTest('T01', ['quality_control']);
    repos.backlog.updateFrontmatter('T01', {
      acceptance_criteria: [
        { text: 'User can log in', done: false },
        { text: 'Errors are shown', done: false },
      ],
    });
    // Re-walk to test (updateFrontmatter does not change status; item already in test).
    const result = await runTestCycle('T01', {
      repos,
      lifecycle: lc,
      gateExecutor: new MockGateExecutor(() => ({
        acResults: [
          { text: 'User can log in', status: 'met' },
          { text: 'Errors are shown', status: 'unmet' },
        ],
      })),
    });
    expect(result.outcome).toBe('review');
    const ac = readAcceptanceCriteria(repos.backlog.get('T01')!.frontmatter);
    expect(ac).toEqual([
      { text: 'User can log in', done: true },
      { text: 'Errors are shown', done: false },
    ]);
  });

  it('AC marking is best-effort — an unmatched acResult never throws the cycle', async () => {
    const lc = seedItemInTest('T01', ['quality_control']);
    repos.backlog.updateFrontmatter('T01', {
      acceptance_criteria: [{ text: 'User can log in', done: false }],
    });
    const result = await runTestCycle('T01', {
      repos,
      lifecycle: lc,
      gateExecutor: new MockGateExecutor(() => ({
        acResults: [{ text: 'A criterion that does not exist on the item', status: 'met' }],
      })),
    });
    expect(result.outcome).toBe('review');
    const ac = readAcceptanceCriteria(repos.backlog.get('T01')!.frontmatter);
    expect(ac).toEqual([{ text: 'User can log in', done: false }]);
  });

  it('throws when the item is not in the test column', async () => {
    const lc = makeLifecycle();
    lc.create({ id: 'T01', type: 'task', title: 'x' });
    lc.transition('T01', 'start', '+backend-developer'); // in_progress, not test
    await expect(
      runTestCycle('T01', {
        repos,
        lifecycle: lc,
        gateExecutor: new MockGateExecutor(() => ({})),
      }),
    ).rejects.toThrow(/test/i);
  });

  it('throws for an unknown item', async () => {
    const lc = makeLifecycle();
    await expect(
      runTestCycle('GHOST', { repos, lifecycle: lc, gateExecutor: new MockGateExecutor(() => ({})) }),
    ).rejects.toThrow(/not found/i);
  });
});
