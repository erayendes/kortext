import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { logsCommand, formatLogsForCli } from '../server/cli/logs.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-logs-'));
  const bundle = openDb({ path: join(tmpRoot, 'logs.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('logsCommand', () => {
  it('returns the most recent audit log rows up to the limit', () => {
    for (let i = 0; i < 5; i++) {
      repos.auditLog.append({
        actor: 'system',
        action: 'test.event',
        resource_type: 'item',
        resource_id: String(i),
        payload: { i },
      });
    }
    const result = logsCommand({ repos, limit: 3 });
    expect(result.rows).toHaveLength(3);
    // Most recent first (DESC ordering in the query).
    expect(result.rows[0]?.resource_id).toBe('4');
    expect(result.rows[2]?.resource_id).toBe('2');
  });

  it('filters by actor and action', () => {
    repos.auditLog.append({ actor: 'system', action: 'run.started', payload: {} });
    repos.auditLog.append({ actor: 'eray', action: 'run.started', payload: {} });
    repos.auditLog.append({ actor: 'eray', action: 'run.completed', payload: {} });

    const byActor = logsCommand({ repos, actor: 'eray' });
    expect(byActor.rows).toHaveLength(2);
    expect(byActor.rows.every((r) => r.actor === 'eray')).toBe(true);

    const byAction = logsCommand({ repos, action: 'run.started' });
    expect(byAction.rows).toHaveLength(2);
    expect(byAction.rows.every((r) => r.action === 'run.started')).toBe(true);

    const combined = logsCommand({ repos, actor: 'eray', action: 'run.completed' });
    expect(combined.rows).toHaveLength(1);
  });
});

describe('formatLogsForCli', () => {
  it('renders the empty-state hint when no rows are returned', () => {
    expect(formatLogsForCli([])).toBe('(no audit log entries)');
  });

  it('includes id, ISO timestamp, actor, action, and resource fields', () => {
    const row = repos.auditLog.append({
      actor: 'system',
      action: 'run.started',
      resource_type: 'run',
      resource_id: '42',
      payload: { workflow: 'demo' },
    });
    const output = formatLogsForCli([row]);
    expect(output).toMatch(/\[\d+\]/);
    expect(output).toMatch(/\d{4}-\d{2}-\d{2}T/); // ISO timestamp
    expect(output).toContain('system');
    expect(output).toContain('run.started');
    expect(output).toContain('run:42');
    expect(output).toContain('{workflow}');
  });
});
