import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export function defaultDbPath(): string {
  return join(homedir(), '.kortext', 'kortext.db');
}

// Run logs belong to the database they describe, not to the home directory.
// Keyed on nothing but the project id, one shared folder meant a second server
// on its own `--db` wrote into the first one's logs — and cancelling ITS
// project 1 deleted the other project 1's history. Beside the database, two
// databases cannot collide. Set by `openDb`, so every entry point gets it.
let logRoot = join(homedir(), '.kortext', 'logs');
export function logRootDir(): string {
  return logRoot;
}
export function logPathFor(name: string): string {
  return join(logRoot, name);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  repo_path TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'new',   -- new | existing → which analysis workflow applies
  code TEXT NOT NULL DEFAULT '',      -- task-id prefix, e.g. ACME
  paused INTEGER NOT NULL DEFAULT 0,  -- 1 = the chain starts no new steps
  archived INTEGER NOT NULL DEFAULT 0,-- 1 = folded away in the panel; files untouched
  doc_lang TEXT NOT NULL DEFAULT '',  -- the language the documents are written in
  engine TEXT NOT NULL DEFAULT '',    -- the agent CLI this project runs on
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
  logRoot = join(dirname(path), 'logs');
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
  kind: 'new' | 'existing';
  code: string; // task-id prefix, e.g. ACME
  paused: number; // 1 = the automatic chain does not start new steps
  archived: number; // 1 = finished with, folded away in the panel; files untouched
  doc_lang: string; // the language the documents are written in; '' = follow the brief
  engine: string; // the agent CLI this project runs on; '' = whatever is installed
  created_at: string;
}
