import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

// UAT #10 — `blocked` is removed as a status. Migration 011 rebuilds
// backlog_items with a CHECK that no longer allows 'blocked', converting any
// pre-existing blocked rows to 'to_do' (the never-started lane the lock now
// overlays). These tests apply the migrations by hand so we can seed a legacy
// `blocked` row BEFORE 011 runs and prove it is converted, not dropped.

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'server',
  'db',
  'migrations',
);

function migrationSql(idPrefix: string): string {
  const file = readdirSync(MIGRATIONS_DIR).find((f) => f.startsWith(idPrefix));
  if (!file) throw new Error(`migration ${idPrefix} not found`);
  return readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
}

/** Apply every migration with id < 11, in order (the pre-011 schema state). */
function applyThrough010(db: Database.Database): void {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^(\d+)_.+\.sql$/.test(f))
    .map((f) => ({ id: Number(/^(\d+)_/.exec(f)![1]), f }))
    .filter((m) => m.id <= 10)
    .sort((a, b) => a.id - b.id);
  for (const m of files) db.exec(readFileSync(join(MIGRATIONS_DIR, m.f), 'utf8'));
}

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
});

afterEach(() => {
  db.close();
});

describe('migration 011 — remove `blocked` status', () => {
  it('exists as 011_*.sql', () => {
    expect(() => migrationSql('011_')).not.toThrow();
  });

  it('converts a pre-existing blocked item to to_do (no data loss)', () => {
    applyThrough010(db);
    // Seed a legacy row in the now-removed `blocked` status (valid pre-011).
    db.prepare(
      "INSERT INTO backlog_items (id,type,title,status,frontmatter,body_md,created_at,updated_at) VALUES ('T1','task','Locked task','blocked','{\"blocked_by\":[\"T0\"]}','',1,1)",
    ).run();

    db.exec(migrationSql('011_'));

    const row = db.prepare("SELECT id, status, frontmatter FROM backlog_items WHERE id='T1'").get() as {
      id: string;
      status: string;
      frontmatter: string;
    };
    expect(row.status).toBe('to_do');
    // The dependency info (blocked_by) is preserved — it drives the derived lock.
    expect(row.frontmatter).toContain('blocked_by');
  });

  it('preserves non-blocked rows untouched', () => {
    applyThrough010(db);
    db.prepare(
      "INSERT INTO backlog_items (id,type,title,status,frontmatter,body_md,created_at,updated_at) VALUES ('T2','task','Running','in_progress','{}','',1,1)",
    ).run();

    db.exec(migrationSql('011_'));

    const row = db.prepare("SELECT status FROM backlog_items WHERE id='T2'").get() as { status: string };
    expect(row.status).toBe('in_progress');
  });

  it('rejects `blocked` via the rebuilt CHECK constraint', () => {
    applyThrough010(db);
    db.exec(migrationSql('011_'));
    expect(() =>
      db.prepare(
        "INSERT INTO backlog_items (id,type,title,status,frontmatter,body_md,created_at,updated_at) VALUES ('X','task','t','blocked','{}','',1,1)",
      ).run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it('still allows every surviving status', () => {
    applyThrough010(db);
    db.exec(migrationSql('011_'));
    for (const status of ['to_do', 'in_progress', 'test', 'review', 'done', 'cancelled']) {
      expect(() =>
        db.prepare(
          `INSERT INTO backlog_items (id,type,title,status,frontmatter,body_md,created_at,updated_at) VALUES ('S-${status}','task','t','${status}','{}','',1,1)`,
        ).run(),
      ).not.toThrow();
    }
  });
});
