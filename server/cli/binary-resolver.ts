import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ExecutorKind } from './executor-factory.ts';

/**
 * Resolve the CLI binary for an executor WITHOUT the user having to export an
 * env var. A non-coder running `kortext start` should never need
 * `KORTEXT_CLAUDE_BIN=$(which claude)`. Resolution order:
 *   1. An explicit `KORTEXT_<KIND>_BIN` env override (verbatim, even absolute).
 *   2. The command resolved to an ABSOLUTE path via PATH + known install dirs —
 *      so a detached daemon spawned with a thin PATH still finds it.
 *   3. The bare command name (the OS PATH-resolves it at spawn time).
 * `mock` needs no binary → undefined.
 */

/** Command + env-var var per executor kind. */
const SPEC: Record<Exclude<ExecutorKind, 'mock'>, { cmd: string; envVar: string }> = {
  claude: { cmd: 'claude', envVar: 'KORTEXT_CLAUDE_BIN' },
  codex: { cmd: 'codex', envVar: 'KORTEXT_CODEX_BIN' },
  gemini: { cmd: 'gemini', envVar: 'KORTEXT_GEMINI_BIN' },
  antigravity: { cmd: 'agy', envVar: 'KORTEXT_ANTIGRAVITY_BIN' },
};

/** Extra install locations to probe beyond PATH (PATH is often thin in a
 *  detached daemon launched outside an interactive shell). */
function knownBinDirs(): string[] {
  const home = homedir();
  return [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    join(home, '.local', 'bin'),
    join(home, '.claude', 'local'),
    join(home, 'bin'),
  ];
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** which-style lookup: first executable match across PATH + known dirs. */
function whichSync(cmd: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const pathDirs = (env.PATH ?? '').split(':').filter(Boolean);
  for (const dir of [...pathDirs, ...knownBinDirs()]) {
    const candidate = join(dir, cmd);
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

export function resolveExecutorBinary(
  executor: ExecutorKind,
  opts: {
    env?: NodeJS.ProcessEnv;
    /** Injectable PATH lookup (tests). Defaults to a real which-style scan. */
    lookupPath?: (cmd: string) => string | null;
  } = {},
): string | undefined {
  if (executor === 'mock') return undefined;
  const env = opts.env ?? process.env;
  const spec = SPEC[executor];

  // 1. Explicit override wins.
  const override = env[spec.envVar];
  if (typeof override === 'string' && override.trim().length > 0) return override.trim();

  // 2. Resolve to an absolute path so a thin-PATH daemon still finds it.
  const lookup = opts.lookupPath ?? ((cmd: string) => whichSync(cmd, env));
  const found = lookup(spec.cmd);
  if (found) return found;

  // 3. Bare command — the OS PATH-resolves it at spawn time.
  return spec.cmd;
}
