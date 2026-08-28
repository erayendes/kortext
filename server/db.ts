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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  return db;
}

export interface Project {
  id: number;
  name: string;
  repo_path: string;
  created_at: string;
}
