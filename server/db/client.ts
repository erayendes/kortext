import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '../config/env.ts';
import { runMigrations, getSchemaVersion } from './migrate.ts';
import { createRepositories, type Repositories } from './repositories/index.ts';

type DbBundle = {
  db: Database.Database;
  repositories: Repositories;
  schemaVersion: number;
};

let bundle: DbBundle | null = null;

export type OpenDbOptions = {
  path?: string;
  /** Skip running migrations on open. Useful for migration tests. */
  skipMigrations?: boolean;
};

export function openDb(options: OpenDbOptions = {}): DbBundle {
  const path = options.path ?? env.KORTEXT_DB_PATH;
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  if (!options.skipMigrations) {
    runMigrations(db);
  }
  const repositories = createRepositories(db);
  return { db, repositories, schemaVersion: getSchemaVersion(db) };
}

export function getDb(): DbBundle {
  if (!bundle) {
    bundle = openDb();
  }
  return bundle;
}

export function resetDbForTests(): void {
  bundle = null;
}
