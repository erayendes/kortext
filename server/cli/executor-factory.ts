import type { Executor } from '../engine/executor.ts';
import { MockExecutor } from '../engine/executors/mock-executor.ts';
import { ClaudeCliExecutor } from '../engine/executors/claude-cli-executor.ts';
import { CodexCliExecutor } from '../engine/executors/codex-cli-executor.ts';
import { GeminiCliExecutor } from '../engine/executors/gemini-cli-executor.ts';
import type { PersonaRegistry } from '../engine/persona-registry.ts';

/**
 * Translates a `--executor=<kind>` CLI flag (or programmatic call) into a
 * concrete Executor instance.
 *
 * The factory is intentionally thin: each kind maps directly to one class.
 * Binary discovery, env reading, agents directory location etc. live in the
 * caller (the CLI entry point), not here — so this stays trivially testable.
 */

export type ExecutorKind = 'mock' | 'claude' | 'codex' | 'gemini';

export type ExecutorFactoryOptions = {
  /** Path to the CLI binary. Ignored for kind='mock'. */
  binary: string;
  /** Directory containing `[handle].md` persona files. */
  agentsDir: string;
  /** Directory where per-step log files are written. */
  logsDir: string;
  /** Optional extra CLI flags forwarded to the underlying executor. */
  extraArgs?: string[];
  /** Optional preloaded persona registry — preferred over disk-direct reads. */
  personaRegistry?: PersonaRegistry;
};

export function createExecutor(
  kind: ExecutorKind,
  opts: ExecutorFactoryOptions,
): Executor {
  switch (kind) {
    case 'mock':
      return new MockExecutor();
    case 'claude':
      return new ClaudeCliExecutor({
        binary: opts.binary,
        agentsDir: opts.agentsDir,
        logsDir: opts.logsDir,
        extraArgs: opts.extraArgs,
        personaRegistry: opts.personaRegistry,
      });
    case 'codex':
      return new CodexCliExecutor({
        binary: opts.binary,
        agentsDir: opts.agentsDir,
        logsDir: opts.logsDir,
        extraArgs: opts.extraArgs,
        personaRegistry: opts.personaRegistry,
      });
    case 'gemini':
      return new GeminiCliExecutor({
        binary: opts.binary,
        agentsDir: opts.agentsDir,
        logsDir: opts.logsDir,
        extraArgs: opts.extraArgs,
        personaRegistry: opts.personaRegistry,
      });
    default: {
      const exhaustive: never = kind;
      throw new Error(`unknown executor kind: ${String(exhaustive)}`);
    }
  }
}
