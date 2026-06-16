#!/usr/bin/env tsx
/**
 * Kortext CLI entry — user-facing surface (v3.1, per-project-port).
 *
 *   kortext start [project|path]         launch a project's daemon on its port
 *   kortext stop                         stop all running project daemons
 *   kortext pause <project>              pause one project (others keep running)
 *   kortext list                         registered projects + ports + status
 *   kortext remove <project>             drop from registry (keeps .kortext/)
 *   kortext purge <project>              drop + delete the project .kortext/
 *   kortext update                       npm update -g kortext
 *   kortext doctor                       consistency scan
 *
 * Dev / Kortext-development commands (off the main surface):
 *   kortext serve [--mode] [--port]      single-project dev server
 *   kortext init [--force]               scaffold .kortext/ + templates + DB
 *   kortext dev:run <workflow-id>        run one workflow (was `start <id>`)
 *   kortext approve / status / logs / cleanup / archive / mcp
 *
 * Compiled to JS by `npm run build:server`; the `bin/kortext.js` shim
 * prefers the compiled entry and falls back to tsx in dev.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../server/db/client.ts';
import { ApprovalQueue } from '../server/orchestrator/approval-queue.ts';
import {
  startCommand,
  approveCommand,
  statusCommand,
} from '../server/cli/commands.ts';
import type { ExecutorKind } from '../server/cli/executor-factory.ts';
import { archiveCommand } from '../server/cli/archive.ts';
import { cleanupQuarantine, cleanupBranches } from '../server/cli/cleanup.ts';
import { runDoctor, formatDoctorReport } from '../server/cli/doctor.ts';
import { initCommand } from '../server/cli/init.ts';
import { logsCommand, formatLogsForCli } from '../server/cli/logs.ts';
import { runPreflight, formatPreflightForCli } from '../server/cli/preflight.ts';
import { buildServeCommands, type ServeMode } from '../server/cli/serve.ts';
import { loadWorkflowsFromDir } from '../server/engine/workflow-loader.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { runtimeLayout } from '../server/paths.ts';
import { runStdioServer } from '../mcp/stdio.ts';
import { createInterface } from 'node:readline';
import { startProject } from '../server/cli/cmd-start.ts';
import { launchBootstrapWizard } from '../server/cli/cmd-bootstrap.ts';
import { stopAll, pauseProject } from '../server/cli/cmd-lifecycle.ts';
import { formatList, removeFromRegistry, purgeProject } from '../server/cli/cmd-projects.ts';
import { sweepOrphans } from '../server/cli/cmd-orphans.ts';
import { updateCommandPlan } from '../server/cli/cmd-update.ts';
import { readRegistry } from '../server/registry/projects.ts';

const args = process.argv.slice(2);
const cmd = args[0];

const VALID_EXECUTORS: ReadonlySet<ExecutorKind> = new Set([
  'mock',
  'claude',
  'codex',
  'gemini',
]);

function parseFlag(name: string, fallback: string | undefined = undefined): string | undefined {
  const prefix = `--${name}=`;
  for (const arg of args) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return fallback;
}

function parseExecutorKind(): ExecutorKind {
  const raw = parseFlag('executor', 'mock')!;
  if (!VALID_EXECUTORS.has(raw as ExecutorKind)) {
    throw new Error(
      `invalid --executor=${raw}; expected one of: ${[...VALID_EXECUTORS].join(', ')}`,
    );
  }
  return raw as ExecutorKind;
}

function envBinaryFor(kind: ExecutorKind): string | undefined {
  if (kind === 'mock') return undefined;
  const envKey = `KORTEXT_${kind.toUpperCase()}_BIN`;
  return process.env[envKey] || undefined;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

function parseDaysFlag(name: string, fallback: number): number {
  const raw = parseFlag(name);
  if (!raw) return fallback;
  const m = raw.match(/^(\d+)d?$/);
  if (!m) throw new Error(`invalid --${name}=${raw}; expected '<N>' or '<N>d'`);
  return Number(m[1]);
}

function parseIntFlag(name: string, fallback: number): number {
  const raw = parseFlag(name);
  if (!raw) return fallback;
  const m = raw.match(/^(\d+)$/);
  if (!m) throw new Error(`invalid --${name}=${raw}; expected a positive integer`);
  return Number(m[1]);
}

function openBrowser(url: string): void {
  const platform = process.platform;
  let cmd: string;
  let cmdArgs: string[];
  if (platform === 'darwin') {
    cmd = 'open';
    cmdArgs = [url];
  } else if (platform === 'win32') {
    cmd = 'cmd';
    cmdArgs = ['/c', 'start', '""', url];
  } else {
    cmd = 'xdg-open';
    cmdArgs = [url];
  }
  try {
    const child = spawn(cmd, cmdArgs, {
      stdio: 'ignore',
      detached: true,
      shell: false,
    });
    child.unref();
  } catch {
    // Best-effort — the URL is also printed by the server on listen.
  }
}

async function launchWizardAndOpen(): Promise<number> {
  const res = launchBootstrapWizard({ packageRoot: packageRoot() });
  if (!res.ok) {
    console.error(res.message);
    return 1;
  }
  console.log(`onboarding wizard → ${res.url}`);
  const shouldOpen = !hasFlag('no-open') && process.env.KORTEXT_NO_OPEN !== '1';
  if (shouldOpen) {
    await new Promise((r) => setTimeout(r, 1200));
    openBrowser(res.url);
  }
  return 0;
}

function packageRoot(): string {
  // Walk up from this file until a package.json is found. Source path is
  // `bin/kortext.ts` (root one level up); compiled path is
  // `dist/bin/kortext.js` (root two levels up). Walking up keeps both
  // layouts working without special-casing.
  const here = dirname(fileURLToPath(import.meta.url));
  let cursor = here;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(cursor, 'package.json'))) return cursor;
    const parent = resolve(cursor, '..');
    if (parent === cursor) break;
    cursor = parent;
  }
  // Fallback — preserve old behaviour so callers still get a directory.
  return resolve(here, '..');
}

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(packageRoot(), 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise<string>((res) => rl.question(`${question} [y/N] `, res));
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

const HELP_TEXT = [
  'kortext v3.1 — autonomous AI agent runtime',
  '',
  '  start [project|path]   start the daemon for a project + open it;',
  '                         no arg = this folder, or pick from the list',
  '  stop [--orphans]       stop all running daemons (+ reap orphan port holders)',
  '  pause <project>        pause one project (others keep running)',
  '  list                   show registered projects + ports + status',
  '  remove <project>       drop from the registry (keeps .kortext/ on disk)',
  '  purge <project>        drop + delete the project .kortext/ (asks first)',
  '  update                 update kortext (npm update -g kortext)',
  '  doctor                 workflow / persona / lock consistency scan',
  '  help                   show this help (--help, -h)',
  '',
  '  (dev) serve [--mode] [--port]   single-project dev server (source checkout)',
  '  (dev) init [--force]            scaffold .kortext/ in this folder',
  '  (dev) dev:run <workflow-id>     run one workflow (was `start <id>`)',
  '  (dev) mcp                       MCP server over stdio',
  '',
  '  --help, -h             show this help',
  '  --version, -v          print version',
].join('\n');

async function main(): Promise<number> {
  // Top-level flags handled before subcommand dispatch.
  if (cmd === '--version' || cmd === '-v') {
    console.log(readVersion());
    return 0;
  }
  if (cmd === '--help' || cmd === '-h' || cmd === 'help' || cmd === undefined) {
    console.log(HELP_TEXT);
    return 0;
  }

  // `kortext mcp` owns stdout for JSON-RPC frames — handle BEFORE any
  // other code path runs console.log on it. Runs the server until SIGINT.
  if (cmd === 'mcp') {
    // eslint-disable-next-line no-console
    console.log = console.error;
    await runStdioServer({ cwd: process.cwd() });
    await new Promise<void>(() => undefined); // park until shutdown
    return 0;
  }

  if (cmd === 'init') {
    if (!hasFlag('skip-preflight')) {
      const report = runPreflight();
      console.log('preflight check:');
      console.log(formatPreflightForCli(report));
      console.log('');
      if (!report.ready) {
        console.error(
          'init aborted: missing or out-of-date runtime. Install/upgrade the items above and rerun, or pass --skip-preflight to bypass.',
        );
        return 1;
      }
    }
    const result = initCommand({
      targetDir: process.cwd(),
      force: hasFlag('force'),
    });
    if (!result.ok) {
      console.error(`init failed: ${result.errorMessage}`);
      return 1;
    }
    if (result.created.length > 0) {
      console.log(`created (${result.created.length}):`);
      for (const path of result.created) console.log(`  + ${path}`);
    }
    if (result.skipped.length > 0) {
      console.log(`skipped (${result.skipped.length}, already present):`);
      for (const path of result.skipped) console.log(`  · ${path}`);
    }
    console.log('');
    console.log(`db schema v${result.schemaVersion} at ${result.dbPath}`);
    console.log("next: 'kortext serve' to launch backend + dashboard");
    return 0;
  }

  if (cmd === 'start') {
    // `kortext start --new` always opens the wizard, even when projects exist.
    if (hasFlag('new')) {
      return launchWizardAndOpen();
    }
    const result = startProject(args[1], {
      packageRoot: packageRoot(),
      cwd: process.cwd(),
      init: (path) => initCommand({ targetDir: path, force: false }),
    });
    if (result.ok) {
      console.log(`${result.reused ? 'already running' : 'started'} ${result.slug} → ${result.url}`);
      const shouldOpen = !hasFlag('no-open') && process.env.KORTEXT_NO_OPEN !== '1';
      if (shouldOpen) {
        // AWAIT the delay before opening: `start` returns → process.exit(), so a
        // bare setTimeout would be killed before it fires (browser never opens).
        // The daemon is detached + unref'd, so it survives this process exiting.
        await new Promise((r) => setTimeout(r, 1200));
        openBrowser(result.url);
      }
      return 0;
    }
    if (result.action === 'list') {
      // GUI-first (UAT #10): a bare `start` with existing projects opens the
      // wizard, which lists those projects (pick one → it starts) and offers a
      // "new project" path. The terminal list below is the --no-open / headless
      // fallback so scripts + CI still get a usable answer.
      const shouldOpen = !hasFlag('no-open') && process.env.KORTEXT_NO_OPEN !== '1';
      if (shouldOpen) {
        return launchWizardAndOpen();
      }
      console.log('Registered projects:');
      console.log(formatList(readRegistry()));
      console.log('\nStart one with: kortext start <project>');
      console.log('Create a new one with: kortext start --new');
      return 0;
    }
    if (result.action === 'onboard') {
      return launchWizardAndOpen();
    }
    console.error(result.message);
    return 1;
  }

  if (cmd === 'stop') {
    const { stopped } = stopAll();
    console.log(stopped.length ? `stopped: ${stopped.join(', ')}` : 'nothing was running');
    // TODO #10: also reap orphan daemons (listeners on kortext ports with no
    // live registry entry) when asked. `kortext stop --orphans`.
    if (hasFlag('orphans')) {
      const { killed, listeners } = sweepOrphans();
      console.log(
        killed.length
          ? `swept ${killed.length} orphan daemon(s): pid ${killed.join(', ')}`
          : `no orphan daemons (scanned ${listeners} listener(s) on kortext ports)`,
      );
    }
    return 0;
  }

  if (cmd === 'pause') {
    const slug = args[1];
    if (!slug) { console.error('usage: kortext pause <project>'); return 2; }
    const res = pauseProject(slug);
    if (!res.ok) { console.error(res.message); return 1; }
    console.log(`paused ${slug}`);
    return 0;
  }

  if (cmd === 'list') {
    console.log(formatList(readRegistry()));
    return 0;
  }

  if (cmd === 'remove') {
    const slug = args[1];
    if (!slug) { console.error('usage: kortext remove <project>'); return 2; }
    const res = removeFromRegistry(slug);
    if (!res.ok) { console.error(res.message); return 1; }
    console.log(`removed ${slug}: daemon stopped, dropped from registry (kept ${res.keptPath})`);
    return 0;
  }

  if (cmd === 'purge') {
    const slug = args[1];
    if (!slug) { console.error('usage: kortext purge <project>'); return 2; }
    const ok = hasFlag('yes') || (await confirm(`Permanently delete ${slug}'s .kortext/ folder?`));
    if (!ok) { console.log('aborted'); return 0; }
    const res = purgeProject(slug);
    if (!res.ok) { console.error(res.message); return 1; }
    console.log(`purged ${slug}: daemon stopped, registry + .kortext/ deleted`);
    return 0;
  }

  if (cmd === 'update') {
    const plan = updateCommandPlan();
    const child = spawn(plan.command, plan.args, { stdio: 'inherit', shell: false });
    return await new Promise<number>((res) => child.on('close', (code) => res(code ?? 1)));
  }

  if (cmd === 'serve') {
    const mode = (parseFlag('mode', 'auto') as ServeMode);
    if (!['dev', 'prod', 'auto'].includes(mode)) {
      console.error(`invalid --mode=${mode}; expected dev|prod|auto`);
      return 2;
    }
    const port = parseIntFlag('port', Number(process.env.KORTEXT_PORT ?? 3200));
    const plan = buildServeCommands({
      packageRoot: packageRoot(),
      projectDir: process.cwd(),
      mode,
      port,
    });
    console.error(`[kortext] serve mode=${plan.mode} port=${port}`);

    // Open the dashboard URL in the default browser shortly after the
    // server boots. Dev mode points at Vite (5173); prod mode points at
    // the Express dashboard mount (the chosen port). Suppress with
    // --no-open or KORTEXT_NO_OPEN=1 (useful for CI / headless servers).
    const shouldOpen =
      !hasFlag('no-open') && process.env.KORTEXT_NO_OPEN !== '1';
    if (shouldOpen) {
      const targetUrl =
        plan.mode === 'dev'
          ? 'http://localhost:5173/'
          : `http://localhost:${port}/`;
      // Give the server a moment to bind. If it never binds, opening the
      // URL just shows the browser's "connection refused" page — strictly
      // less confusing than ignoring the flag.
      setTimeout(() => openBrowser(targetUrl), 1500);
    }

    // Prod mode now has exactly one command (Express also serves dist/web).
    // Running it as a child process via spawn + stdio:inherit broke on
    // Node 26 — the child exited as soon as the import resolved, even
    // though the same `node dist/server/index.js` ran fine in a normal
    // shell. Importing the server in-process keeps the event loop alive
    // via app.listen(), and signal handlers register against this
    // process directly. No spawn weirdness.
    if (plan.mode === 'prod') {
      const cmdPlan = plan.commands[0];
      if (!cmdPlan) {
        console.error('[kortext] prod plan returned no command');
        return 2;
      }
      // The server reads its config from process.env — merge in what the
      // plan would have passed to a child.
      for (const [k, v] of Object.entries(cmdPlan.env)) {
        process.env[k] = v;
      }
      // Chdir so the server resolves workflows/agents/workspace relative
      // to the user's project, exactly the way the spawned child would.
      const previousCwd = process.cwd();
      process.chdir(cmdPlan.cwd);
      try {
        // The compiled server registers its own SIGINT/SIGTERM handlers
        // and calls process.exit on shutdown — so once we await this, we
        // never need to return. await new Promise<never>(() => {})
        // parks us until the server tears down the process.
        await import(cmdPlan.args[0]!);
        await new Promise<never>(() => {});
        return 0;
      } catch (err) {
        process.chdir(previousCwd);
        console.error('[kortext] server failed to start:', err);
        return 1;
      }
    }

    // Dev mode: tsx (server) + vite (web) run in parallel children, and
    // we still want sibling-kill semantics if one of them dies.
    const children: ChildProcess[] = [];
    let shuttingDown = false;
    const shutdown = (signal: NodeJS.Signals) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.error(`[kortext] received ${signal}, stopping children`);
      for (const child of children) {
        if (!child.killed) child.kill(signal);
      }
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    for (const c of plan.commands) {
      const child = spawn(c.command, c.args, {
        cwd: c.cwd,
        env: { ...process.env, ...c.env },
        stdio: 'inherit',
        shell: false,
      });
      children.push(child);
      child.on('exit', (code, signal) => {
        if (shuttingDown) return;
        console.error(
          `[kortext] ${c.name} exited (code=${code} signal=${signal}); stopping siblings`,
        );
        shutdown('SIGTERM');
      });
    }

    const codes = await Promise.all(
      children.map(
        (child) =>
          new Promise<number>((res) => {
            child.on('close', (code) => res(code ?? 1));
          }),
      ),
    );
    return codes.reduce((acc, c) => Math.max(acc, c), 0);
  }

  const { repositories: repos } = getDb();
  const queue = new ApprovalQueue({ repos });

  switch (cmd) {
    case 'dev:run': {
      const workflowId = args[1];
      if (!workflowId || workflowId.startsWith('--')) {
        console.error('usage: kortext dev:run <workflow-id> [--executor=mock|claude|codex|gemini] [--binary=<path>]');
        return 2;
      }
      const kind = parseExecutorKind();
      const binary = parseFlag('binary', envBinaryFor(kind));
      const result = await startCommand({
        repos,
        // v3.1: workflows live inside the kortext npm package.
        workflowsDir: runtimeLayout().workflowsDir,
        workflowId,
        executor: kind,
        executorBinary: binary,
      });
      if (!result.ok) {
        console.error(`start failed: ${result.errorMessage}`);
        return 1;
      }
      console.log(
        `run #${result.runId} (executor=${kind}) → ${result.status}` +
          (result.failedStepKey ? ` (failed step: ${result.failedStepKey})` : ''),
      );
      return result.status === 'succeeded' ? 0 : 1;
    }

    case 'approve': {
      const runId = Number(args[1]);
      const answer = args[2] ?? 'approve';
      if (!Number.isFinite(runId)) {
        console.error('usage: kortext approve <run-id> [answer]');
        return 2;
      }
      const result = await approveCommand({
        repos,
        queue,
        runId,
        answer,
        answeredBy: process.env.USER ?? 'cli',
      });
      if (!result.ok) {
        console.error(`approve failed: ${result.errorMessage}`);
        return 1;
      }
      console.log(`approved question #${result.questionId} with '${result.answer}'`);
      return 0;
    }

    case 'status': {
      const result = statusCommand({ repos });
      console.log('Recent runs:');
      for (const r of result.recentRuns) {
        console.log(`  #${r.id}  ${r.workflow_id}  ${r.status}  by ${r.triggered_by}`);
      }
      console.log('Open questions:');
      if (result.openQuestions.length === 0) {
        console.log('  (none)');
      } else {
        for (const q of result.openQuestions) {
          console.log(`  #${q.id}  run=${q.run_id}  ${q.question}`);
        }
      }
      return 0;
    }

    case 'logs': {
      const limit = parseIntFlag('limit', 50);
      const actor = parseFlag('actor');
      const action = parseFlag('action');
      const resourceType = parseFlag('resource-type');
      const resourceId = parseFlag('resource-id');
      const result = logsCommand({
        repos,
        limit,
        actor,
        action,
        resourceType,
        resourceId,
      });
      console.log(formatLogsForCli(result.rows));
      return 0;
    }

    case 'cleanup': {
      const dryRun = hasFlag('dry-run');
      const olderThanDays = parseDaysFlag('quarantine-older-than', 30);
      const wantsBranches = hasFlag('branches');
      const repoRoot = process.cwd();
      const quarantineRoot = join(repoRoot, '.kortext', 'data', 'worktrees-quarantine');

      const q = await cleanupQuarantine({ quarantineRoot, olderThanDays, dryRun });
      const prefix = dryRun ? '(dry-run) would delete' : 'deleted';
      console.log(`Quarantine — ${prefix} ${q.deleted.length}, kept ${q.kept.length}`);
      for (const path of q.deleted) console.log(`  - ${path}`);

      if (wantsBranches) {
        const b = await cleanupBranches({ repoRoot, repos, dryRun });
        console.log(`Branches — ${prefix} ${b.deleted.length}, kept ${b.kept.length}`);
        for (const name of b.deleted) console.log(`  - ${name}`);
      }
      return 0;
    }

    case 'archive': {
      const target = args[1];
      if (target !== 'handover') {
        console.error('usage: kortext archive handover');
        return 2;
      }
      const result = archiveCommand({
        what: 'handover',
        projectRoot: process.cwd(),
      });
      if (!result.ok) {
        console.error(`archive failed: ${result.errorMessage}`);
        return 1;
      }
      if (result.rotated) {
        console.log(`archived handover → ${result.archivePath}`);
      } else {
        console.log(`no rotation needed (${result.reason})`);
      }
      return 0;
    }

    case 'doctor': {
      // v3.1: load from the kortext npm package (not the project).
      const runtime = runtimeLayout();
      const workflows = loadWorkflowsFromDir(runtime.workflowsDir);
      const personas = loadPersonasFromDir(runtime.agentsDir);
      const report = runDoctor({ workflows, personas, repos });
      console.log(formatDoctorReport(report));
      console.log('');
      console.log(
        `summary: ${report.summary.workflowsLoaded} workflow(s), ${report.summary.personasLoaded} persona(s), ` +
          `${report.summary.unknownPersonaRefs} unknown ref(s), ${report.summary.staleLocks} stale lock(s), ` +
          `${report.summary.blockedItems} blocked item(s)`,
      );
      return report.hasErrors ? 1 : 0;
    }

    default:
      console.error(`unknown command: ${cmd}`);
      console.error("run 'kortext --help' for usage");
      return 2;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
