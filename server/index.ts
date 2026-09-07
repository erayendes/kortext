#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { defaultDbPath, openDb } from './db.js';
import { buildApp } from './app.js';
import { respawnDetached, serverUp, waitForServer } from './daemon.js';

const { values } = parseArgs({
  options: {
    port: { type: 'string' },
    db: { type: 'string' },
    'no-open': { type: 'boolean' },
    'no-detach': { type: 'boolean' },
    stop: { type: 'boolean' },
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

Usage: kortext [--port 3441] [--db ~/.kortext/kortext.db] [--no-open] [--no-detach]
       kortext --stop
       kortext --version

Starts the server in the background and opens the panel in your browser: the
terminal window can be closed, and the panel's ⏻ button stops the server.
--no-detach keeps it in this terminal, where Ctrl+C stops it.
--stop stops a server running in the background, like the panel's ⏻ button.
Data lives in a global SQLite database — one database, multiple projects.`);
  process.exit(0);
}

const PORT = Number(values.port ?? process.env.PORT ?? 3441);
const DB_PATH = values.db ?? defaultDbPath();

// Use the panel shutdown endpoint so CLI and UI enforce the same busy check.
if (values.stop) {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/quit`, { method: 'POST' }).catch(
    () => null,
  );
  if (!res) {
    console.log(`nothing is running on port ${PORT}`);
    process.exit(0);
  }
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({}))) as { error?: string };
    console.error(error ?? `could not stop kortext (HTTP ${res.status})`);
    process.exit(1);
  }
  console.log('kortext stopped');
  process.exit(0);
}

// Detach with KORTEXT_CHILD set so closing the terminal leaves the server running.
// Development uses --no-detach to keep the watcher in the foreground.
if (!process.env.KORTEXT_CHILD && !values['no-detach']) {
  const url = `http://localhost:${PORT}`;
  const logPath = `${DB_PATH}.log`;
  // Reuse an existing Kortext server on this port.
  const already = await serverUp(PORT);
  if (!already) {
    // Only the parent opens the browser, after the server passes its health check.
    respawnDetached(
      fileURLToPath(import.meta.url),
      [...process.argv.slice(2), '--no-open'],
      logPath,
    );
  }
  if (!(already || (await waitForServer(PORT)))) {
    console.error(`kortext did not start. See ${logPath}`);
    process.exit(1);
  }
  console.log(`${already ? 'kortext is already running' : 'kortext panel'}: ${url}`);
  console.log('You can close this window. Stop it with the ⏻ button in the panel.');
  if (!values['no-open']) openBrowser(url);
  process.exit(0);
}

const db = openDb(DB_PATH);
const app = buildApp(db, pkgRoot, DB_PATH);

// Bind only loopback addresses: the API exposes local paths and file mutations without authentication.
// Listen on IPv4 and, where available, IPv6 because localhost can resolve to either.
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
