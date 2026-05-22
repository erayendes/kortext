#!/usr/bin/env tsx
/**
 * Kortext CLI entry — Faz 3 orchestrator surface.
 *
 *   kortext start <workflow-id>          run a workflow with the mock executor
 *   kortext approve <run-id> [answer]    answer the oldest open question for a run
 *   kortext status                       print recent runs + open questions
 *
 * In Faz 7 this file will be compiled to JS as part of `npm run build:server`.
 * For now invoke via `npx tsx bin/kortext.ts <cmd>` or `bin/kortext.js` shim.
 */

import { join, resolve } from 'node:path';
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

async function main(): Promise<number> {
  // `kortext mcp` owns stdout for JSON-RPC frames — handle BEFORE any
  // other code path runs console.log on it. Runs the server until SIGINT.
  if (cmd === 'mcp') {
    // eslint-disable-next-line no-console
    console.log = console.error;
    await runStdioServer({ cwd: process.cwd() });
    await new Promise<void>(() => undefined); // park until shutdown
    return 0;
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

    case 'help':
    case undefined:
      console.log(
        [
          'kortext v3 — orchestrator CLI',
          '',
          '  start <workflow-id> [--executor=<kind>] [--binary=<path>]',
          '                             run a workflow (kind: mock|claude|codex|gemini)',
          '                             non-mock executors need a binary path or',
          '                             KORTEXT_<KIND>_BIN env var',
          '  approve <run-id> [answer]  answer the oldest open question for a run',
          '  status                     show recent runs + open questions',
          '  cleanup [--quarantine-older-than=Nd] [--branches] [--dry-run]',
          '                             remove old quarantine dirs and (optionally)',
          '                             abandoned kortext/run-* branches',
          '  doctor                     scan workflows + personas + locks + items',
          '                             for inconsistencies; exit 1 on errors',
          '  mcp                        run the MCP server over stdio',
          '                             (use: claude mcp add kortext -- kortext mcp)',
        ].join('\n'),
      );
      return 0;

    default:
      console.error(`unknown command: ${cmd}`);
      return 2;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
