import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { RuntimeArtifactsRepository } from '../db/repositories/runtime-artifacts.ts';

/**
 * Worktree manager.
 *
 * Each run is given an isolated working copy under `.kortext/data/worktrees/run-<id>`
 * on its own throwaway branch (`kortext/run-<id>`). On success the branch can be
 * merged back into the base branch and the worktree is removed. On failure the
 * directory is moved to `.kortext/data/worktrees-quarantine/run-<id>-<timestamp>/`
 * (NOT deleted) so postmortem analysis is possible, and the branch is kept.
 *
 * Limits:
 *   - `maxConcurrent` caps simultaneous worktrees (default 10) so a runaway
 *     pipeline can't exhaust disk.
 *
 * All git invocations use `execFileSync('git', [...])` — shell-free so callers
 * can't smuggle metacharacters via run id or branch name.
 */

export class WorktreeError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'WorktreeError';
    if (cause !== undefined) this.cause = cause;
  }
}

export class WorktreeLimitError extends WorktreeError {
  constructor(limit: number) {
    super(`worktree limit reached: ${limit}`);
    this.name = 'WorktreeLimitError';
  }
}

export type WorktreeHandle = {
  runId: number;
  /** Absolute path to the worktree directory. */
  path: string;
  /** Branch checked out inside the worktree. */
  branch: string;
  /** Branch the worktree was forked from. */
  baseBranch: string;
};

export type WorktreeManagerOptions = {
  /** Repo root (the directory containing .git). */
  repoRoot: string;
  /** Branch worktrees are created from. Default 'main'. */
  baseBranch?: string;
  /** Max simultaneous worktrees. Default 10. */
  maxConcurrent?: number;
  /** Repository used to record `kind: 'worktree'` artifacts. */
  artifacts?: RuntimeArtifactsRepository;
  /** Override quarantine root (mostly for tests). */
  quarantineRoot?: string;
  /** Override worktree root (mostly for tests). */
  worktreeRoot?: string;
};

export type ReleaseOptions = {
  /** Did the run succeed? Failure → quarantine. */
  success: boolean;
  /** On success, merge the branch back into baseBranch before cleanup. */
  merge?: boolean;
};

export class WorktreeManager {
  private readonly repoRoot: string;
  private readonly baseBranch: string;
  private readonly maxConcurrent: number;
  private readonly artifacts: RuntimeArtifactsRepository | undefined;
  private readonly worktreeRoot: string;
  private readonly quarantineRoot: string;
  private readonly active = new Map<number, WorktreeHandle>();

  constructor(opts: WorktreeManagerOptions) {
    this.repoRoot = resolve(opts.repoRoot);
    this.baseBranch = opts.baseBranch ?? 'main';
    this.maxConcurrent = opts.maxConcurrent ?? 10;
    this.artifacts = opts.artifacts;
    this.worktreeRoot =
      opts.worktreeRoot ?? join(this.repoRoot, '.kortext', 'data', 'worktrees');
    this.quarantineRoot =
      opts.quarantineRoot ??
      join(this.repoRoot, '.kortext', 'data', 'worktrees-quarantine');
  }

  /**
   * Provision (or return existing) worktree for a run.
   * Idempotent for the same runId.
   */
  acquire(runId: number): WorktreeHandle {
    const existing = this.active.get(runId);
    if (existing) return existing;

    if (this.active.size >= this.maxConcurrent) {
      throw new WorktreeLimitError(this.maxConcurrent);
    }

    // Verify base branch exists.
    try {
      this.git('rev-parse', '--verify', `refs/heads/${this.baseBranch}`);
    } catch (e) {
      throw new WorktreeError(
        `base branch '${this.baseBranch}' not found in ${this.repoRoot}`,
        e,
      );
    }

    const branch = `kortext/run-${runId}`;
    const path = join(this.worktreeRoot, `run-${runId}`);

    mkdirSync(this.worktreeRoot, { recursive: true });

    try {
      // -B forces branch creation/reset from base; safe because branch name is namespaced.
      this.git('worktree', 'add', '-B', branch, path, this.baseBranch);
    } catch (e) {
      throw new WorktreeError(
        `failed to create worktree at ${path} from ${this.baseBranch}`,
        e,
      );
    }

    const handle: WorktreeHandle = { runId, path, branch, baseBranch: this.baseBranch };
    this.active.set(runId, handle);

    if (this.artifacts) {
      let bytes: number | null = null;
      try {
        bytes = statSync(path).size;
      } catch {
        bytes = null;
      }
      this.artifacts.create({
        run_id: runId,
        step_id: null,
        kind: 'worktree',
        path,
        bytes,
      });
    }

    return handle;
  }

  /**
   * Tear down a worktree.
   *
   *   success: true,  merge: false → drop branch & worktree (no merge)
   *   success: true,  merge: true  → merge branch into base, then drop
   *   success: false               → quarantine dir; keep branch for postmortem
   */
  release(handle: WorktreeHandle, opts: ReleaseOptions): void {
    if (!this.active.has(handle.runId)) {
      // already released — be idempotent
      return;
    }

    if (opts.success) {
      if (opts.merge) {
        try {
          this.git('-C', this.repoRoot, 'checkout', handle.baseBranch);
          this.git(
            '-C',
            this.repoRoot,
            'merge',
            '--no-ff',
            '-m',
            `Merge ${handle.branch} into ${handle.baseBranch}`,
            handle.branch,
          );
        } catch (e) {
          throw new WorktreeError(
            `merge ${handle.branch} -> ${handle.baseBranch} failed`,
            e,
          );
        }
      }
      try {
        this.git('worktree', 'remove', '--force', handle.path);
      } catch (e) {
        throw new WorktreeError(`failed to remove worktree ${handle.path}`, e);
      }
      try {
        this.git('branch', '-D', handle.branch);
      } catch {
        // branch may be gone already (merge + auto-delete in some configs) — ignore
      }
    } else {
      // Quarantine path: move dir, prune git's internal record, keep branch.
      mkdirSync(this.quarantineRoot, { recursive: true });
      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .replace('Z', '');
      const dest = join(this.quarantineRoot, `run-${handle.runId}-${stamp}`);
      if (existsSync(handle.path)) {
        renameSync(handle.path, dest);
      }
      try {
        this.git('worktree', 'prune');
      } catch {
        // best-effort
      }
      if (this.artifacts) {
        this.artifacts.create({
          run_id: handle.runId,
          step_id: null,
          kind: 'worktree',
          path: dest,
          bytes: null,
        });
      }
    }

    this.active.delete(handle.runId);
  }

  list(): WorktreeHandle[] {
    return [...this.active.values()];
  }

  private git(...args: string[]): string {
    return execFileSync('git', args, {
      cwd: this.repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }
}
