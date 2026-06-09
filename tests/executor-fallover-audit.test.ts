import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { falloverAuditSink } from '../server/cli/executor-factory.ts';

// UAT #10 follow-up — "agy kota-uyarısı": when the fallback chain falls over
// (agy 429 quota → claude), the event must reach the audit log so the GUI
// Activity feed shows it — not just a console line nobody reads.

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-fallaudit-'));
  const bundle = openDb({ path: join(tmpRoot, 'fa.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('falloverAuditSink', () => {
  it('writes an executor.fallover audit event carrying from/to/reason', () => {
    const sink = falloverAuditSink(repos.auditLog);
    sink({
      from: 'antigravity',
      to: 'claude',
      stepKey: 'build.1',
      runId: 7,
      runStepId: 12,
      reason: 'antigravity-cli produced no output (possible quota/rate-limit — 429)',
    });

    const events = repos.auditLog.list({ action: 'executor.fallover', limit: 10 });
    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e.actor).toBe('fallback');
    expect(e.resource_type).toBe('run_step');
    expect(e.resource_id).toBe('12');
    expect(e.payload).toMatchObject({
      from: 'antigravity',
      to: 'claude',
      step_key: 'build.1',
      run_id: 7,
      reason: expect.stringContaining('429'),
    });
  });

  it('never throws — a failed audit write must not break the executor chain', () => {
    const sink = falloverAuditSink({
      append: () => {
        throw new Error('db locked');
      },
    });
    expect(() =>
      sink({ from: 'antigravity', to: 'claude', stepKey: 's', runId: 1, runStepId: 1, reason: 'x' }),
    ).not.toThrow();
  });
});
