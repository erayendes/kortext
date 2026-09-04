#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { defaultDbPath, openDb } from './db.js';
import { buildApp } from './app.js';

const { values } = parseArgs({
  options: {
    port: { type: 'string' },
    db: { type: 'string' },
    'no-open': { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  },
  allowPositionals: true,
});

const here = dirname(fileURLToPath(import.meta.url));
// package root works from both server/ (tsx dev) and dist/ (built)
const pkgRoot = join(here, '..');

if (values.version) {
  const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as {
    version: string;
  };
  console.log(pkg.version);
  process.exit(0);
}

if (values.help) {
  console.log(`kortext — project brain for AI-driven development

Usage: kortext [--port 3441] [--db ~/.kortext/kortext.db] [--no-open]
       kortext --version

Starts the server and opens the panel in your browser.
Data lives in a global SQLite database — one database, multiple projects.`);
  process.exit(0);
}

const PORT = Number(values.port ?? process.env.PORT ?? 3441);
const DB_PATH = values.db ?? defaultDbPath();

const db = openDb(DB_PATH);
const app = buildApp(db, pkgRoot, DB_PATH);

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`kortext panel: ${url}`);
  console.log(`db:            ${DB_PATH}`);
  if (!values['no-open']) openBrowser(url);
});

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}
