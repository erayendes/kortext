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

// The terminal's half of the panel's ⏻ button: same endpoint, same refusal
// while a step is running, so neither way can end an analysis mid-write.
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

// Started from a terminal, kortext hands itself over to a detached copy and
// exits: the window can then be closed without taking the panel down with it.
// The copy re-enters this file with KORTEXT_CHILD set and runs the server.
// `--no-detach` is the foreground mode the dev script (tsx watch) needs.
if (!process.env.KORTEXT_CHILD && !values['no-detach']) {
  const url = `http://localhost:${PORT}`;
  const logPath = `${DB_PATH}.log`;
  // Someone else may hold the port — a kortext already started, or another
  // program. The first is not an error: point the browser at it and stop.
  const already = await serverUp(PORT);
  if (!already) {
    // The child never opens the browser: the parent does, once it knows the
    // panel actually answers. A browser opened at a port nothing is listening
    // on is how "kortext is broken" reports start.
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
