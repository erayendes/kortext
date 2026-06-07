import { execFileSync } from 'node:child_process';

export type GitRunner = (args: string[], cwd: string) => string;

export type BootstrapGitResult = {
  ok: boolean;
  created: boolean;
  developmentEnsured: boolean;
  warning?: string;
};

const defaultRunner: GitRunner = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function isInsideRepo(run: GitRunner, dir: string): boolean {
  try {
    return run(['rev-parse', '--is-inside-work-tree'], dir).trim() === 'true';
  } catch {
    return false;
  }
}

function hasBranch(run: GitRunner, dir: string, name: string): boolean {
  try {
    run(['rev-parse', '--verify', '--quiet', `refs/heads/${name}`], dir);
    return true;
  } catch {
    return false;
  }
}

/**
 * Make `dir` build-ready: a git repo with a `development` branch.
 * - Fresh dir → `git init -b main` + add + commit + `development`.
 * - Existing repo → only ensure `development` exists; never touch the working tree.
 * - git unusable → soft-fail (project creation continues without git).
 */
export function bootstrapGit(dir: string, runner: GitRunner = defaultRunner): BootstrapGitResult {
  try {
    const existed = isInsideRepo(runner, dir);
    if (!existed) {
      runner(['init', '-b', 'main'], dir);
      runner(['add', '-A'], dir);
      // -c flags avoid failing on machines without a configured git identity.
      runner(
        ['-c', 'user.email=kortext@localhost', '-c', 'user.name=Kortext',
         'commit', '-m', 'kortext scaffold', '--allow-empty'],
        dir,
      );
    }
    let developmentEnsured = hasBranch(runner, dir, 'development');
    if (!developmentEnsured) {
      runner(['branch', 'development'], dir);
      developmentEnsured = true;
    }
    return { ok: true, created: !existed, developmentEnsured };
  } catch (err) {
    return {
      ok: false,
      created: false,
      developmentEnsured: false,
      warning: `git bootstrap failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
