import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

type MigrationFile = { id: number; name: string; sql: string };

function loadMigrations(): MigrationFile[] {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const migrations: MigrationFile[] = [];
  for (const file of files) {
    const match = /^(\d+)_(.+)\.sql$/.exec(file);
    if (!match) continue;
    const idStr = match[1];
    const name = match[2];
    if (!idStr || !name) continue;
    migrations.push({
      id: Number(idStr),
      name,
      sql: readFileSync(join(MIGRATIONS_DIR, file), 'utf8'),
    });
  }
  migrations.sort((a, b) => a.id - b.id);
  return migrations;
}

const TRACKING_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  );
`;

function ensureMigrationsTable(db: Database.Database): void {
  const runMulti = db.exec.bind(db);
  runMulti(TRACKING_TABLE_DDL);
}

export type MigrationResult = {
  applied: { id: number; name: string }[];
  alreadyApplied: number;
  latestId: number;
};

export function runMigrations(db: Database.Database): MigrationResult {
  ensureMigrationsTable(db);

  const appliedRows = db
    .prepare('SELECT id FROM schema_migrations ORDER BY id')
    .all() as { id: number }[];
  const appliedIds = new Set(appliedRows.map((r) => r.id));

  const migrations = loadMigrations();
  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)',
  );
  const runMulti = db.exec.bind(db);

  const applied: { id: number; name: string }[] = [];
  for (const m of migrations) {
    if (appliedIds.has(m.id)) continue;
    const runTx = db.transaction(() => {
      runMulti(m.sql);
      insertMigration.run(m.id, m.name, Date.now());
    });
    runTx();
    applied.push({ id: m.id, name: m.name });
  }

  const latest = migrations.length > 0 ? (migrations[migrations.length - 1]?.id ?? 0) : 0;
  return {
    applied,
    alreadyApplied: appliedIds.size,
    latestId: latest,
  };
}

export function getSchemaVersion(db: Database.Database): number {
  ensureMigrationsTable(db);
  const row = db
    .prepare('SELECT MAX(id) as v FROM schema_migrations')
    .get() as { v: number | null };
  return row?.v ?? 0;
}
