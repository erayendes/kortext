import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

// UAT #10 Faz 1 — per-step token/cost lands on a nullable `usage_metadata` JSON
// column added to run_steps and gate_runs by migration 012. Nullable + additive:
// every pre-existing row stays valid (NULL = no telemetry captured for it).

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

/** Apply every migration in id order (the full current schema). */
function applyAll(db: Database.Database): void {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^(\d+)_.+\.sql$/.test(f))
    .map((f) => ({ id: Number(/^(\d+)_/.exec(f)![1]), f }))
    .sort((a, b) => a.id - b.id);
  for (const m of files) db.exec(readFileSync(join(MIGRATIONS_DIR, m.f), 'utf8'));
}

function column(db: Database.Database, table: string, name: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
    notnull: number;
  }[];
  return cols.find((c) => c.name === name);
}

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
});

afterEach(() => {
  db.close();
});

describe('migration 012 — usage tracking columns', () => {
  it('exists as 012_*.sql', () => {
    expect(() => migrationSql('012_')).not.toThrow();
  });

  it('adds a nullable usage_metadata column to run_steps', () => {
    applyAll(db);
    const col = column(db, 'run_steps', 'usage_metadata');
    expect(col).toBeDefined();
    expect(col!.notnull).toBe(0);
  });

  it('adds a nullable usage_metadata column to gate_runs', () => {
    applyAll(db);
    const col = column(db, 'gate_runs', 'usage_metadata');
    expect(col).toBeDefined();
    expect(col!.notnull).toBe(0);
  });

  it('stores and reads back usage_metadata JSON on a run_step', () => {
    applyAll(db);
    db.prepare(
      "INSERT INTO runs (workflow_id,item_id,status,triggered_by,created_at) VALUES ('wf',NULL,'queued','t',1)",
    ).run();
    db.prepare(
      "INSERT INTO run_steps (run_id,step_index,step_name,status,usage_metadata) VALUES (1,0,'dev','succeeded','{\"executor\":\"claude-cli\",\"input_tokens\":2500}')",
    ).run();
    const row = db
      .prepare('SELECT usage_metadata FROM run_steps WHERE run_id=1')
      .get() as { usage_metadata: string };
    expect(JSON.parse(row.usage_metadata).input_tokens).toBe(2500);
  });

  it('leaves usage_metadata NULL on rows that do not set it (back-compat)', () => {
    applyAll(db);
    db.prepare(
      "INSERT INTO runs (workflow_id,item_id,status,triggered_by,created_at) VALUES ('wf',NULL,'queued','t',1)",
    ).run();
    db.prepare(
      "INSERT INTO run_steps (run_id,step_index,step_name,status) VALUES (1,0,'dev','succeeded')",
    ).run();
    const row = db
      .prepare('SELECT usage_metadata FROM run_steps WHERE run_id=1')
      .get() as { usage_metadata: string | null };
    expect(row.usage_metadata).toBeNull();
  });
});
