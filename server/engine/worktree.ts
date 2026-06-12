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

/**
 * Did this worktree actually produce code? (UAT #10i no-op detection.)
 *
 * True when the worktree has diverged from `baseBranch` in either direction:
 *   - uncommitted changes (`git status --porcelain` non-empty), OR
 *   - commits ahead of base (`git rev-list <base>..HEAD` non-zero).
 *
 * A fallover agent that only READ files (exit 0, nothing written/committed)
 * leaves the worktree byte-identical to its base → false, so runItem can treat
 * the run as a no-op and retry instead of shipping an empty worktree to `test`.
 *
 * Fails OPEN: if git can't answer (not a worktree, detached state, error) we
 * return true so a genuine build is never wrongly discarded — the guard only
 * ever blocks a worktree we can PROVE is unchanged.
 */
export function worktreeHasChanges(worktreePath: string, baseBranch: string): boolean {
  const run = (...args: string[]): string =>
    execFileSync('git', ['-C', worktreePath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  try {
    if (run('status', '--porcelain') !== '') return true; // uncommitted work
    const ahead = run('rev-list', '--count', `${baseBranch}..HEAD`);
    return Number(ahead) > 0; // committed work beyond the base
  } catch {
    return true; // can't prove it's unchanged → don't block
  }
}

/**
 * Extensions that count as a MEANINGFUL implementation deliverable (UAT #10L).
 * Docs (.md/.txt), dotfiles (.gitignore/.env*), and bare config (.json/.yml/
 * .toml) do NOT count on their own — the live codex no-op wrote exactly
 * `.env.example` + `.gitignore` + `AGENTS.md` and slipped past the #10i
 * "anything changed?" guard while every gate rightly failed on "no code".
 */
const CODE_EXTENSIONS = new Set([
  'html', 'htm', 'css', 'scss', 'sass', 'less',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'swift',
  'c', 'cc', 'cpp', 'h', 'hpp', 'm', 'mm', 'cs', 'php', 'sql', 'sh', 'bash',
]);

/** Does this change set contain at least one app/code file? (Pure — testable without git.) */
export function hasMeaningfulCodeChange(changedFiles: string[]): boolean {
  return changedFiles.some((f) => {
    const base = f.split('/').pop() ?? f;
    const dot = base.lastIndexOf('.');
    if (dot <= 0) return false; // dotfiles (.gitignore) and extension-less files
    return CODE_EXTENSIONS.has(base.slice(dot + 1).toLowerCase());
  });
}

/**
 * Did this worktree produce a MEANINGFUL code change? (UAT #10L — tightens the
 * #10i guard.) True when at least one file changed vs `baseBranch` (uncommitted
 * OR committed) has an app/code extension. A run that only touched config/doc
 * files (the live codex pattern) is a no-op: advancing it to `test` ships a
 * code-less worktree every gate rejects → infinite bounce.
 *
 * Fails OPEN like worktreeHasChanges: if git can't answer we return true so a
 * genuine build is never wrongly discarded.
 */
export function worktreeHasMeaningfulChanges(worktreePath: string, baseBranch: string): boolean {
  const run = (...args: string[]): string =>
    execFileSync('git', ['-C', worktreePath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  try {
    const files = new Set<string>();
    // Uncommitted paths (porcelain: "XY <path>" or "XY <old> -> <new>").
    for (const line of run('status', '--porcelain').split('\n')) {
      if (!line.trim()) continue;
      const path = line.slice(3);
      const renamed = path.split(' -> ');
      files.add(renamed[renamed.length - 1]!);
    }
    // Committed paths beyond the base.
    for (const line of run('diff', '--name-only', `${baseBranch}...HEAD`).split('\n')) {
      if (line.trim()) files.add(line.trim());
    }
    return hasMeaningfulCodeChange([...files]);
  } catch {
    return true; // can't prove it's meaningless → don't block
  }
}

/**
 * Did this worktree COMMIT a meaningful code change vs its base? (UAT #10M.)
 *
 * Looks ONLY at committed history (`base...HEAD`) — uncommitted files are
 * irrelevant here because the merger grafts COMMITS onto `development`, not the
 * working tree. The engine commits the agent's work before this runs (run-item),
 * so a worktree with no committed app/code file beyond base is a genuine no-op →
 * the item bounces and retries instead of producing an empty merge dressed up as
 * "done". This is the #10M tightening of {@link worktreeHasMeaningfulChanges},
 * which (correctly for #10L) also counted UNCOMMITTED app code — but uncommitted
 * code never survives the merge, so it must not green-light a `test` transition.
 *
 * Fails OPEN like its siblings: a git error returns true so a genuine build is
 * never wrongly discarded.
 */
export function worktreeHasMeaningfulCommit(worktreePath: string, baseBranch: string): boolean {
  const run = (...args: string[]): string =>
    execFileSync('git', ['-C', worktreePath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  try {
    const files = run('diff', '--name-only', `${baseBranch}...HEAD`)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    return hasMeaningfulCodeChange(files);
  } catch {
    return true; // can't prove it's meaningless → don't block
  }
}

/**
 * Commit whatever the agent left in the worktree — engine-side (UAT #10M).
 *
 * Coding agents (codex especially) frequently WRITE files but never `git commit`
 * them. The merger then grafts the commit-less feature branch onto `development`,
 * which carries NOTHING → empty merge → the code is silently lost and the item
 * is a fake "done". Staging (`git add -A`) and committing here, before the item
 * leaves for `test`, guarantees the tree the gates read is the exact tree the
 * merge carries.
 *
 * Returns true when a commit was actually created, false when there was nothing
 * to commit (the agent already committed, or wrote nothing). Best-effort: any
 * git failure returns false rather than throwing — the committed-only no-op
 * guard ({@link worktreeHasMeaningfulCommit}) then catches the empty tree and
 * bounces the item, so a commit hiccup degrades to a retry, never a crash.
 *
 * Robust in a bare checkout: inline `user.name`/`user.email` so a worktree with
 * no committer identity still commits, `--no-verify` so a project pre-commit
 * hook can't block the engine, and `commit.gpgsign=false` so signing never
 * prompts.
 */
export function commitWorktreeChanges(worktreePath: string, message: string): boolean {
  const run = (...args: string[]): string =>
    execFileSync('git', ['-C', worktreePath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  try {
    run('add', '-A');
    // `diff --cached --quiet` exits 0 when nothing is staged, 1 when there is.
    try {
      run('diff', '--cached', '--quiet');
      return false; // nothing staged → nothing to commit
    } catch {
      // non-zero exit → staged changes exist; fall through to commit
    }
    run(
      '-c', 'user.name=Kortext Engine',
      '-c', 'user.email=engine@kortext.local',
      '-c', 'commit.gpgsign=false',
      'commit', '--no-verify', '-m', message,
    );
    return true;
  } catch {
    return false; // best-effort: the committed-only guard catches an empty tree
  }
}
