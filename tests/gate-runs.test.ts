import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-gate-'));
  const bundle = openDb({ path: join(tmpRoot, 'gate.db') });
  db = bundle.db;
  repos = bundle.repositories;
  // gate_runs.item_id has an FK to backlog_items — seed an item to attach to.
  repos.backlog.create({ id: 'T01', type: 'task', title: 'login form' });
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('GateRunsRepository.create', () => {
  it('creates a gate run with default status pending and attempt 1', () => {
    const gr = repos.gateRuns.create({
      item_id: 'T01',
      gate: 'code_review',
      persona: '+engineering-manager',
    });
    expect(gr.id).toBeGreaterThan(0);
    expect(gr.item_id).toBe('T01');
    expect(gr.gate).toBe('code_review');
    expect(gr.persona).toBe('+engineering-manager');
    expect(gr.attempt).toBe(1);
    expect(gr.status).toBe('pending');
    expect(gr.findings).toBeNull();
    expect(gr.ended_at).toBeNull();
    expect(gr.created_at).toBeGreaterThan(0);
  });

  it('rejects an unknown gate value (zod enum)', () => {
    expect(() =>
      repos.gateRuns.create({ item_id: 'T01', gate: 'nonsense' as never }),
    ).toThrow();
  });

  it('enforces the FK to backlog_items', () => {
    expect(() => repos.gateRuns.create({ item_id: 'GHOST', gate: 'uat' })).toThrow();
  });

  it('rejects a duplicate (item, attempt, gate)', () => {
    repos.gateRuns.create({ item_id: 'T01', gate: 'uat', attempt: 1 });
    expect(() =>
      repos.gateRuns.create({ item_id: 'T01', gate: 'uat', attempt: 1 }),
    ).toThrow();
  });

  it('allows the same gate in a different attempt', () => {
    repos.gateRuns.create({ item_id: 'T01', gate: 'uat', attempt: 1 });
    const a2 = repos.gateRuns.create({ item_id: 'T01', gate: 'uat', attempt: 2 });
    expect(a2.attempt).toBe(2);
  });
});

describe('GateRunsRepository.transition', () => {
  it('moves pending → running → pass and stamps ended_at only on terminal', () => {
    const gr = repos.gateRuns.create({ item_id: 'T01', gate: 'quality_control' });
    const running = repos.gateRuns.transition(gr.id, 'running');
    expect(running.status).toBe('running');
    expect(running.ended_at).toBeNull();
    const passed = repos.gateRuns.transition(gr.id, 'pass');
    expect(passed.status).toBe('pass');
    expect(passed.ended_at).toBeGreaterThan(0);
  });

  it('records findings on fail', () => {
    const gr = repos.gateRuns.create({ item_id: 'T01', gate: 'security_control' });
    const failed = repos.gateRuns.transition(gr.id, 'fail', {
      findings: 'hardcoded secret in config.ts:12',
    });
    expect(failed.status).toBe('fail');
    expect(failed.findings).toBe('hardcoded secret in config.ts:12');
    expect(failed.ended_at).toBeGreaterThan(0);
  });

  it('throws for an unknown gate_run id', () => {
    expect(() => repos.gateRuns.transition(9999, 'pass')).toThrow(/not found/i);
  });
});

describe('GateRunsRepository queries — the test-cycle join', () => {
  it('currentAttempt is 0 with no rows, then tracks the max', () => {
    expect(repos.gateRuns.currentAttempt('T01')).toBe(0);
    repos.gateRuns.create({ item_id: 'T01', gate: 'code_review', attempt: 1 });
    expect(repos.gateRuns.currentAttempt('T01')).toBe(1);
    repos.gateRuns.create({ item_id: 'T01', gate: 'code_review', attempt: 2 });
    expect(repos.gateRuns.currentAttempt('T01')).toBe(2);
  });

  it('listForAttempt isolates one cycle — stale fail from attempt 1 not mixed into attempt 2 (§5.13, no infinite bounce)', () => {
    // Attempt 1: code_review fails → item bounces to in_progress.
    const a1 = repos.gateRuns.create({ item_id: 'T01', gate: 'code_review', attempt: 1 });
    repos.gateRuns.transition(a1.id, 'fail', { findings: 'missing tests' });
    // Attempt 2 (after fix + re-test): code_review passes.
    const a2 = repos.gateRuns.create({ item_id: 'T01', gate: 'code_review', attempt: 2 });
    repos.gateRuns.transition(a2.id, 'pass');

    const cycle2 = repos.gateRuns.listForAttempt('T01', 2);
    expect(cycle2).toHaveLength(1);
    // The all-pass fold over cycle 2 would move the item test → review.
    expect(cycle2.every((g) => g.status === 'pass')).toBe(true);

    // History preserved, but the stale fail lives only in cycle 1.
    const cycle1 = repos.gateRuns.listForAttempt('T01', 1);
    expect(cycle1[0]?.status).toBe('fail');
  });

  it('listForItem returns all attempts ordered by attempt then gate', () => {
    repos.gateRuns.create({ item_id: 'T01', gate: 'uat', attempt: 1 });
    repos.gateRuns.create({ item_id: 'T01', gate: 'code_review', attempt: 1 });
    repos.gateRuns.create({ item_id: 'T01', gate: 'code_review', attempt: 2 });
    const all = repos.gateRuns.listForItem('T01');
    expect(all.map((g) => [g.attempt, g.gate])).toEqual([
      [1, 'code_review'],
      [1, 'uat'],
      [2, 'code_review'],
    ]);
  });

  it('multi-gate cycle: all-pass fold vs one-fail fold', () => {
    const gates = ['code_review', 'quality_control', 'uat'] as const;
    const rows = gates.map((g) =>
      repos.gateRuns.create({ item_id: 'T01', gate: g, attempt: 1 }),
    );
    rows.forEach((r) => repos.gateRuns.transition(r.id, 'pass'));
    const cycle = repos.gateRuns.listForAttempt('T01', 1);
    expect(cycle.every((g) => g.status === 'pass')).toBe(true); // → review

    // Flip one back to fail — the fold now sees ≥1 fail → in_progress.
    repos.gateRuns.transition(rows[0]!.id, 'fail', { findings: 'regression' });
    const cycleAfter = repos.gateRuns.listForAttempt('T01', 1);
    expect(cycleAfter.some((g) => g.status === 'fail')).toBe(true);
  });
});
