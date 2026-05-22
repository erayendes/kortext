#!/usr/bin/env tsx
/**
 * Kortext CLI entry — user-facing surface.
 *
 *   kortext init                         scaffold .kortext/ + workflows + DB
 *   kortext serve                        start backend + dashboard together
 *   kortext start <workflow-id>          run a workflow with the mock executor
 *   kortext approve <run-id> [answer]    answer the oldest open question
 *   kortext status                       recent runs + open questions
 *   kortext logs                         tail of the audit log
 *   kortext cleanup                      remove old quarantine + branches
 *   kortext doctor                       consistency scan
 *   kortext mcp                          run the MCP server over stdio
 *
 * Compiled to JS by `npm run build:server`; the `bin/kortext.js` shim
 * prefers the compiled entry and falls back to tsx in dev.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
import { cleanupQuarantine, cleanupBranches } from '../server/cli/cleanup.ts';
import { runDoctor, formatDoctorReport } from '../server/cli/doctor.ts';
import { initCommand } from '../server/cli/init.ts';
import { logsCommand, formatLogsForCli } from '../server/cli/logs.ts';
import { buildServeCommands, type ServeMode } from '../server/cli/serve.ts';
import { loadWorkflowsFromDir } from '../server/engine/workflow-loader.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { runStdioServer } from '../mcp/stdio.ts';

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

function packageRoot(): string {
  // bin/kortext.ts → package root is one level up.
  const here = dirname(fileURLToPath(import.meta.url));
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

const HELP_TEXT = [
  'kortext v3 — autonomous AI agent runtime',
  '',
  '  init [--force]                 scaffold .kortext/, workflows, agents,',
  '                                 rules, workspace, AGENTS.md, and DB',
  '  serve [--mode=dev|prod|auto]   start backend + dashboard together',
  '         [--port=N]              (auto picks prod when dist/ is built)',
  '  start <workflow-id> [--executor=<kind>] [--binary=<path>]',
  '                                 run a workflow (mock|claude|codex|gemini)',
  '  approve <run-id> [answer]      answer the oldest open question for a run',
  '  status                         show recent runs + open questions',
  '  logs [--limit=N] [--actor=A] [--action=A]',
  '                                 tail of the audit log',
  '  cleanup [--quarantine-older-than=Nd] [--branches] [--dry-run]',
  '                                 remove old quarantine + abandoned branches',
  '  doctor                         workflow / persona / lock consistency scan',
  '  mcp                            run the MCP server over stdio',
  '',
  '  --help, -h                     show this help',
  '  --version, -v                  print version',
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

    // Wait for all children to finish, then propagate worst exit code.
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
    case 'start': {
      const workflowId = args[1];
      if (!workflowId || workflowId.startsWith('--')) {
        console.error('usage: kortext start <workflow-id> [--executor=mock|claude|codex|gemini] [--binary=<path>]');
        return 2;
      }
      const kind = parseExecutorKind();
      const binary = parseFlag('binary', envBinaryFor(kind));
      const result = await startCommand({
        repos,
        workflowsDir: resolve(process.cwd(), 'workflows'),
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
      const quarantineRoot = join(repoRoot, '.kortext', 'worktrees-quarantine');

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

    case 'doctor': {
      const workflows = loadWorkflowsFromDir(resolve(process.cwd(), 'workflows'));
      const personas = loadPersonasFromDir(resolve(process.cwd(), 'agents'));
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
