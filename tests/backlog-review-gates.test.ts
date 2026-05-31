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
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-rg-'));
  const bundle = openDb({ path: join(tmpRoot, 'rg.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('backlog review_gates — gate checklist selection (§5.9 #2)', () => {
  it('defaults to an empty gate checklist', () => {
    const item = repos.backlog.create({ id: 'T01', type: 'task', title: 'x' });
    expect(item.review_gates).toEqual([]);
  });

  it('accepts a gate selection at create time', () => {
    const item = repos.backlog.create({
      id: 'T01',
      type: 'task',
      title: 'x',
      review_gates: ['code_review', 'quality_control', 'uat'],
    });
    expect(item.review_gates).toEqual(['code_review', 'quality_control', 'uat']);
  });

  it('round-trips the selection through get (JSON column)', () => {
    repos.backlog.create({ id: 'T01', type: 'task', title: 'x', review_gates: ['uat'] });
    expect(repos.backlog.get('T01')?.review_gates).toEqual(['uat']);
  });

  it('setReviewGates replaces the selection (planning-pipeline writes it)', () => {
    repos.backlog.create({ id: 'T01', type: 'task', title: 'x' });
    const updated = repos.backlog.setReviewGates('T01', ['code_review', 'security_control']);
    expect(updated.review_gates).toEqual(['code_review', 'security_control']);
    expect(repos.backlog.get('T01')?.review_gates).toEqual(['code_review', 'security_control']);
  });

  it('setReviewGates can clear to a 0-gate item (§5.8: join vacuously passes → review)', () => {
    repos.backlog.create({ id: 'T01', type: 'task', title: 'x', review_gates: ['uat'] });
    expect(repos.backlog.setReviewGates('T01', []).review_gates).toEqual([]);
  });

  it('rejects an unknown gate value at setReviewGates', () => {
    repos.backlog.create({ id: 'T01', type: 'task', title: 'x' });
    expect(() => repos.backlog.setReviewGates('T01', ['nonsense' as never])).toThrow();
  });

  it('rejects an unknown gate value at create time', () => {
    expect(() =>
      repos.backlog.create({
        id: 'T02',
        type: 'task',
        title: 'x',
        review_gates: ['bogus' as never],
      }),
    ).toThrow();
  });

  it('setReviewGates throws for an unknown item', () => {
    expect(() => repos.backlog.setReviewGates('GHOST', ['uat'])).toThrow(/not found/i);
  });
});
