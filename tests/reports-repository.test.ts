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
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-reports-'));
  const bundle = openDb({ path: join(tmpRoot, 'reports.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('reports repository', () => {
  it('creates a row with defaults and reads it back', () => {
    const created = repos.reports.create({
      scope: 'test-reports',
      slug: 'login-flow',
      file_path: '.kortext/reports/test-reports_login-flow_2026-05-24-1432.md',
      author: '+qa-engineer',
    });
    expect(created.id).toBeGreaterThan(0);
    expect(created.status).toBe('uninitialized');
    expect(created.tags).toEqual([]);
    expect(created.created_at).toBeGreaterThan(0);

    const fetched = repos.reports.get(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.scope).toBe('test-reports');
    expect(fetched?.author).toBe('+qa-engineer');
  });

  it('round-trips tags via JSON column', () => {
    const created = repos.reports.create({
      scope: 'security-reports',
      slug: 'auth-audit',
      file_path: '.kortext/reports/security-reports_auth-audit_2026-05-26-1100.md',
      author: '+security-engineer',
      status: 'writing',
      tags: ['p1', 'auth', 'audit'],
      related_item: 'T05-login',
    });
    const fetched = repos.reports.get(created.id);
    expect(fetched?.tags).toEqual(['p1', 'auth', 'audit']);
    expect(fetched?.related_item).toBe('T05-login');
    expect(fetched?.status).toBe('writing');
  });

  it('enforces file_path UNIQUE', () => {
    repos.reports.create({
      scope: 'test-reports',
      slug: 'flow',
      file_path: '.kortext/reports/test-reports_flow_2026-05-24-1000.md',
    });
    expect(() =>
      repos.reports.create({
        scope: 'other-reports',
        slug: 'whatever',
        file_path: '.kortext/reports/test-reports_flow_2026-05-24-1000.md',
      }),
    ).toThrow(/UNIQUE/i);
  });

  it('rejects invalid status via CHECK constraint', () => {
    expect(() =>
      db
        .prepare(
          "INSERT INTO reports_index (scope, slug, file_path, status, tags, created_at) " +
            "VALUES ('s','sl','/p','bogus','[]',1)",
        )
        .run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it('looks up by file_path', () => {
    const created = repos.reports.create({
      scope: 'delivery-reports',
      slug: 'v1-staging',
      file_path: '.kortext/reports/delivery-reports_v1-staging_2026-06-01-1530.md',
    });
    const byPath = repos.reports.getByPath(
      '.kortext/reports/delivery-reports_v1-staging_2026-06-01-1530.md',
    );
    expect(byPath?.id).toBe(created.id);
    expect(repos.reports.getByPath('.kortext/reports/missing.md')).toBeNull();
  });

  it('lists most-recent-first with filters', async () => {
    repos.reports.create({
      scope: 'test-reports',
      slug: 'a',
      file_path: '.kortext/reports/test-reports_a_2026-05-20-0900.md',
      status: 'approved',
    });
    // Force a different created_at so ordering is deterministic.
    await new Promise((r) => setTimeout(r, 2));
    repos.reports.create({
      scope: 'security-reports',
      slug: 'b',
      file_path: '.kortext/reports/security-reports_b_2026-05-21-0900.md',
      status: 'writing',
      related_item: 'T01',
    });
    await new Promise((r) => setTimeout(r, 2));
    repos.reports.create({
      scope: 'test-reports',
      slug: 'c',
      file_path: '.kortext/reports/test-reports_c_2026-05-22-0900.md',
      status: 'writing',
      related_item: 'T01',
    });

    const all = repos.reports.list();
    expect(all).toHaveLength(3);
    expect(all[0]?.slug).toBe('c'); // newest first

    const onlyTestReports = repos.reports.list({ scope: 'test-reports' });
    expect(onlyTestReports.map((r) => r.slug)).toEqual(['c', 'a']);

    const onlyWriting = repos.reports.list({ status: 'writing' });
    expect(onlyWriting.map((r) => r.slug)).toEqual(['c', 'b']);

    const byItem = repos.reports.list({ relatedItem: 'T01' });
    expect(byItem.map((r) => r.slug)).toEqual(['c', 'b']);

    const limited = repos.reports.list({ limit: 1 });
    expect(limited).toHaveLength(1);
    expect(limited[0]?.slug).toBe('c');
  });

  it('updates status', () => {
    const row = repos.reports.create({
      scope: 'test-reports',
      slug: 'x',
      file_path: '.kortext/reports/test-reports_x_2026-05-22-0900.md',
      status: 'writing',
    });
    const next = repos.reports.updateStatus(row.id, 'approved');
    expect(next.status).toBe('approved');
    expect(repos.reports.get(row.id)?.status).toBe('approved');
    expect(() => repos.reports.updateStatus(99999, 'approved')).toThrow(
      /not found/,
    );
  });
});

describe('migrations include reports_index', () => {
  it('records migration 003 in schema_migrations', () => {
    const rows = db
      .prepare('SELECT id, name FROM schema_migrations ORDER BY id')
      .all() as { id: number; name: string }[];
    expect(rows.find((r) => r.id === 3)).toBeDefined();
    expect(rows.find((r) => r.id === 3)?.name).toContain('reports_index');

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='reports_index'",
      )
      .all() as { name: string }[];
    expect(tables).toHaveLength(1);
  });
});
