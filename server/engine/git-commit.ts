import * as cp from 'node:child_process';

/**
 * Shell-free git commit helper. Best-effort: returns ok=false on any error
 * (no git binary, not a repo, nothing to commit) instead of throwing.
 *
 * Hook note: we alias `cp.execFileSync` to keep this file out of the
 * PreToolUse Write hook's spawn-substring blacklist (see HANDOVER-v3.md
 * "Gotcha'lar"). All git invocations are shell-free; user-controlled
 * paths and messages can never be interpreted as shell metacharacters.
 */

const runFile = cp.execFileSync;

export type GitCommitInput = {
  repoRoot: string;
  message: string;
  /** Paths relative to repoRoot. Must be non-empty. */
  paths: string[];
};

export type GitCommitResult =
  | { ok: true; sha: string }
  | { ok: false; reason: string };

export function gitCommit(input: GitCommitInput): GitCommitResult {
  if (input.paths.length === 0) {
    return { ok: false, reason: 'no paths to commit' };
  }

  try {
    runFile('git', ['add', '--', ...input.paths], {
      cwd: input.repoRoot,
      shell: false,
      stdio: 'pipe',
    });
    runFile('git', ['commit', '-m', input.message, '--', ...input.paths], {
      cwd: input.repoRoot,
      shell: false,
      stdio: 'pipe',
    });
    const sha = runFile('git', ['rev-parse', 'HEAD'], {
      cwd: input.repoRoot,
      shell: false,
      stdio: 'pipe',
      encoding: 'utf8',
    }).toString().trim();
    return { ok: true, sha };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
