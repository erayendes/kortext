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

// Loopback only. Without a host, Node binds `*` — every interface — and the
// panel's API answers anyone on the same Wi-Fi: the project list carries
// absolute paths, /docs/content reads and rewrites the analysis, and /cancel
// deletes it. Nothing here is authenticated, so the address is the boundary.
//
// Both families, because a host argument binds exactly one address and the
// browser is opened at `localhost` — which resolves to ::1 first on plenty of
// machines. One listener on 127.0.0.1 would leave those looking at a refused
// connection under a console line saying the panel is up. The second bind is
// best-effort: a machine with IPv6 switched off refuses it, and that is fine.
app.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`kortext panel: ${url}`);
  console.log(`db:            ${DB_PATH}`);
  if (!values['no-open']) openBrowser(url);
});
app.listen(PORT, '::1').on('error', () => {
  /* no IPv6 loopback on this machine; the IPv4 listener above is the panel */
});

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}
