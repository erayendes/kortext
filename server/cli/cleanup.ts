import * as cp from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Repositories } from '../db/repositories/index.ts';
import type { RunStatus } from '../db/schemas.ts';

const runFile = cp.execFileSync;

const TERMINAL_RUN_STATUSES: ReadonlySet<RunStatus> = new Set([
  'succeeded',
  'failed',
  'cancelled',
]);

export type CleanupResult = {
  deleted: string[];
  kept: string[];
  dryRun: boolean;
};

export type CleanupQuarantineOptions = {
  quarantineRoot: string;
  olderThanDays: number;
  dryRun: boolean;
};

export async function cleanupQuarantine(
  opts: CleanupQuarantineOptions,
): Promise<CleanupResult> {
  if (!existsSync(opts.quarantineRoot)) {
    return { deleted: [], kept: [], dryRun: opts.dryRun };
  }

  const cutoffMs = Date.now() - opts.olderThanDays * 86400 * 1000;
  const deleted: string[] = [];
  const kept: string[] = [];

  for (const entry of readdirSync(opts.quarantineRoot)) {
    const full = join(opts.quarantineRoot, entry);
    let mtimeMs: number;
    try {
      mtimeMs = statSync(full).mtimeMs;
    } catch {
      continue;
    }
    if (mtimeMs < cutoffMs) {
      deleted.push(full);
      if (!opts.dryRun) rmSync(full, { recursive: true, force: true });
    } else {
      kept.push(full);
    }
  }

  return { deleted, kept, dryRun: opts.dryRun };
}

export type CleanupBranchesOptions = {
  repoRoot: string;
  repos: Repositories;
  dryRun: boolean;
};

const BRANCH_NAME_RE = /^kortext\/run-(\d+)$/;

export async function cleanupBranches(
  opts: CleanupBranchesOptions,
): Promise<CleanupResult> {
  const listed = runFile(
    'git',
    ['branch', '--list', 'kortext/run-*', '--format=%(refname:short)'],
    { cwd: opts.repoRoot, encoding: 'utf8' },
  );
  const branches = listed
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const deleted: string[] = [];
  const kept: string[] = [];

  for (const branch of branches) {
    const match = BRANCH_NAME_RE.exec(branch);
    if (!match || !match[1]) {
      kept.push(branch);
      continue;
    }
    const runId = Number(match[1]);
    const run = opts.repos.runs.getRun(runId);
    if (!run || !TERMINAL_RUN_STATUSES.has(run.status)) {
      kept.push(branch);
      continue;
    }
    deleted.push(branch);
    if (!opts.dryRun) {
      try {
        runFile('git', ['branch', '-D', branch], {
          cwd: opts.repoRoot,
          stdio: ['ignore', 'ignore', 'pipe'],
        });
      } catch {
        // Branch may have been deleted between listing and now — non-fatal.
      }
    }
  }

  return { deleted, kept, dryRun: opts.dryRun };
}
