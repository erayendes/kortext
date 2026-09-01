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
  status TEXT NOT NULL DEFAULT 'running',  -- running | done | failed | stopped
  error TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
`;

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
  if (!cols.includes('paused')) {
    db.exec('ALTER TABLE projects ADD COLUMN paused INTEGER NOT NULL DEFAULT 0');
  }
  if (!cols.includes('archived')) {
    db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
  }
  if (!cols.includes('doc_lang')) {
    db.exec("ALTER TABLE projects ADD COLUMN doc_lang TEXT NOT NULL DEFAULT ''");
  }
  // The request-queue agent surface is gone (vision v2 — kortext drives the
  // engine itself); drop the leftover table from older installs.
  db.exec('DROP TABLE IF EXISTS requests');
  return db;
}

export interface Project {
  id: number;
  name: string;
  repo_path: string;
  kind: 'new' | 'existing';
  code: string; // task-id prefix, e.g. ACME
  paused: number; // 1 = the automatic chain does not start new steps
  archived: number; // 1 = finished with, folded away in the panel; files untouched
  doc_lang: string; // the language the documents are written in; '' = follow the brief
  created_at: string;
}
