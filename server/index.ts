#!/usr/bin/env node
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { defaultDbPath, openDb } from './db.js';
import { createProject, listProjects, removeProject } from './projects.js';

const { values } = parseArgs({
  options: {
    port: { type: 'string' },
    db: { type: 'string' },
    'no-open': { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
  // tsx/node both pass through argv after the script
  allowPositionals: true,
});

if (values.help) {
  console.log(`kortext — project brain for AI-driven development

Usage: kortext [--port 4200] [--db ~/.kortext/kortext.db] [--no-open]

Starts the server and opens the panel in your browser.
Data lives in a global SQLite database — one database, multiple projects.`);
  process.exit(0);
}

const PORT = Number(values.port ?? 4200);
const DB_PATH = values.db ?? defaultDbPath();

const here = dirname(fileURLToPath(import.meta.url));
// package root works from both server/ (tsx dev) and dist/ (built)
const pkgRoot = join(here, '..');
const templatesDir = join(pkgRoot, 'templates');
const uiDist = join(pkgRoot, 'ui', 'dist');

const db = openDb(DB_PATH);
const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: DB_PATH });
});

app.get('/api/projects', (_req, res) => {
  res.json({ projects: listProjects(db) });
});

app.post('/api/projects', (req, res) => {
  const { name, repoPath, mode } = req.body ?? {};
  try {
    const project = createProject(db, { name, repoPath, mode: mode === 'new' ? 'new' : 'existing' }, templatesDir);
    res.status(201).json({ project });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.delete('/api/projects/:id', (req, res) => {
  const removed = removeProject(db, Number(req.params.id));
  res.status(removed ? 200 : 404).json({ removed });
});

// Built panel (ui/dist) with SPA fallback; in dev the vite server proxies /api here.
if (existsSync(uiDist)) {
  app.use(express.static(uiDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(uiDist, 'index.html')));
}

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`kortext panel: ${url}`);
  console.log(`db: ${DB_PATH}`);
  if (!values['no-open']) openBrowser(url);
});

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}
