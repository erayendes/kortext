import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export function defaultDbPath(): string {
  return join(homedir(), '.kortext', 'kortext.db');
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  repo_path TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'new',   -- new | existing → which analysis workflow applies
  code TEXT NOT NULL DEFAULT '',      -- task-id prefix, e.g. ACME
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  doc_rel TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'doc',   -- doc (analysis step) | plan (kopeng split)
  status TEXT NOT NULL DEFAULT 'running',  -- running | done | failed
  error TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,             -- revise | report | planning | question
  payload TEXT NOT NULL,          -- JSON: doc, notes, report type…
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | done | cancelled
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
`;
// NOTE: a `transfers` table returns when live Kopeng push lands — until then
// "transferred" simply means backlog.yaml + TODO.md exist and are approved.

export function openDb(path = defaultDbPath()): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  const cols = (db.pragma('table_info(projects)') as { name: string }[]).map((c) => c.name);
  if (!cols.includes('kind')) {
    db.exec("ALTER TABLE projects ADD COLUMN kind TEXT NOT NULL DEFAULT 'new'");
  }
  if (!cols.includes('code')) {
    db.exec("ALTER TABLE projects ADD COLUMN code TEXT NOT NULL DEFAULT ''");
  }
  return db;
}

export interface Project {
  id: number;
  name: string;
  repo_path: string;
  kind: 'new' | 'existing';
  code: string; // task-id prefix, e.g. ACME
  created_at: string;
}
