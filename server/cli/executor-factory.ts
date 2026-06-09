import type { Executor } from '../engine/executor.ts';
import { MockExecutor } from '../engine/executors/mock-executor.ts';
import { ClaudeCliExecutor } from '../engine/executors/claude-cli-executor.ts';
import { CodexCliExecutor } from '../engine/executors/codex-cli-executor.ts';
import { GeminiCliExecutor } from '../engine/executors/gemini-cli-executor.ts';
import { AntigravityCliExecutor } from '../engine/executors/antigravity-cli-executor.ts';
import type { PersonaRegistry } from '../engine/persona-registry.ts';
import { PersonaRoutedExecutor } from '../engine/executors/persona-routed-executor.ts';
import {
  FallbackExecutor,
  type FallbackEntry,
  type FalloverInfo,
} from '../engine/executors/fallback-executor.ts';
import { resolveExecutorBinary } from './binary-resolver.ts';

/**
 * Translates a `--executor=<kind>` CLI flag (or programmatic call) into a
 * concrete Executor instance.
 *
 * The factory is intentionally thin: each kind maps directly to one class.
 * Binary discovery, env reading, agents directory location etc. live in the
 * caller (the CLI entry point), not here — so this stays trivially testable.
 */

export type ExecutorKind = 'mock' | 'claude' | 'codex' | 'gemini' | 'antigravity';

export type ExecutorFactoryOptions = {
  /** Path to the CLI binary. Ignored for kind='mock'. */
  binary: string;
  /** Directory containing `[handle].md` persona files. */
  agentsDir: string;
  /** Directory where per-step log files are written. */
  logsDir: string;
  /** Directory containing `rules/*.md`. behavior.md + step-declared rules are
   *  injected into the agent prompt after the persona body (UAT #7). */
  rulesDir?: string;
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
        rulesDir: opts.rulesDir,
        extraArgs: opts.extraArgs,
        personaRegistry: opts.personaRegistry,
      });
    case 'codex':
      return new CodexCliExecutor({
        binary: opts.binary,
        agentsDir: opts.agentsDir,
        logsDir: opts.logsDir,
        rulesDir: opts.rulesDir,
        extraArgs: opts.extraArgs,
        personaRegistry: opts.personaRegistry,
      });
    case 'gemini':
      return new GeminiCliExecutor({
        binary: opts.binary,
        agentsDir: opts.agentsDir,
        logsDir: opts.logsDir,
        rulesDir: opts.rulesDir,
        extraArgs: opts.extraArgs,
        personaRegistry: opts.personaRegistry,
      });
    case 'antigravity':
      return new AntigravityCliExecutor({
        binary: opts.binary,
        agentsDir: opts.agentsDir,
        logsDir: opts.logsDir,
        rulesDir: opts.rulesDir,
        extraArgs: opts.extraArgs,
        personaRegistry: opts.personaRegistry,
      });
    default: {
      const exhaustive: never = kind;
      throw new Error(`unknown executor kind: ${String(exhaustive)}`);
    }
  }
}

const VALID_EXECUTOR_KINDS = new Set<ExecutorKind>(['mock', 'claude', 'codex', 'gemini', 'antigravity']);

/**
 * Wraps `fallback` in a PersonaRoutedExecutor when any persona declares a
 * model_default override. Personas sharing the same kind reuse the same
 * Executor instance (deduplicated). Returns `fallback` unchanged when no
 * overrides are present — zero-cost path.
 *
 * Secondary executor binaries are resolved via resolveExecutorBinary so each
 * kind gets the right binary regardless of what the fallback uses.
 */
export function createRoutedExecutor(
  personaOverrides: Array<{ handle: string; model_default: string | null }>,
  fallback: Executor,
  opts: ExecutorFactoryOptions,
): Executor {
  const kindToExecutor = new Map<ExecutorKind, Executor>();
  const routes = new Map<string, Executor>();

  for (const p of personaOverrides) {
    if (!p.model_default) continue;
    if (!VALID_EXECUTOR_KINDS.has(p.model_default as ExecutorKind)) continue;
    const kind = p.model_default as ExecutorKind;

    if (!kindToExecutor.has(kind)) {
      const binary = resolveExecutorBinary(kind) ?? opts.binary;
      kindToExecutor.set(kind, createExecutor(kind, { ...opts, binary }));
    }
    routes.set(p.handle, kindToExecutor.get(kind)!);
  }

  if (routes.size === 0) return fallback;
  return new PersonaRoutedExecutor({ routes, fallback });
}

/**
 * Build an Executor for an ORDERED fallback chain of kinds (UAT #10).
 *
 * Each kind in the chain gets its OWN binary via resolveExecutorBinary(kind),
 * so a chain like `['antigravity','claude','codex']` spawns `agy`, then
 * `claude`, then `codex` as it falls over. `opts.binary` is used as the
 * last-resort default (e.g. when a kind's binary can't be auto-discovered).
 *
 * Zero-cost passthrough: a single-element chain returns the bare executor (no
 * FallbackExecutor wrapper), so existing single-executor projects behave
 * exactly as before. An empty chain is a programmer error and throws.
 */
export function createFallbackExecutor(
  chain: ExecutorKind[],
  opts: ExecutorFactoryOptions & {
    log?: (message: string) => void;
    /** Fired on every recoverable fallthrough (quota/429) — see falloverAuditSink. */
    onFallover?: (info: FalloverInfo) => void;
  },
): Executor {
  if (chain.length === 0) {
    throw new Error('createFallbackExecutor requires a non-empty chain');
  }
  const build = (kind: ExecutorKind): Executor => {
    const binary = kind === 'mock' ? '' : resolveExecutorBinary(kind) ?? opts.binary;
    return createExecutor(kind, { ...opts, binary });
  };
  if (chain.length === 1) return build(chain[0]!);
  const entries: FallbackEntry[] = chain.map((kind) => ({ kind, executor: build(kind) }));
  return new FallbackExecutor(entries, {
    ...(opts.log ? { log: opts.log } : {}),
    ...(opts.onFallover ? { onFallover: opts.onFallover } : {}),
  });
}

/**
 * The standard `onFallover` sink (UAT #10 follow-up — "agy kota-uyarısı"):
 * writes one `executor.fallover` audit event per recoverable fallthrough, so a
 * quota-exhausted executor (agy 429 → claude) is VISIBLE in the GUI Activity
 * feed instead of only a console line. Best-effort: a failed audit write never
 * breaks the executor chain.
 */
export function falloverAuditSink(auditLog: {
  append: (input: {
    actor: string;
    action: string;
    resource_type?: string | null;
    resource_id?: string | null;
    payload?: Record<string, unknown>;
  }) => unknown;
}): (info: FalloverInfo) => void {
  return (info) => {
    try {
      auditLog.append({
        actor: 'fallback',
        action: 'executor.fallover',
        resource_type: 'run_step',
        resource_id: String(info.runStepId),
        payload: {
          from: info.from,
          to: info.to,
          step_key: info.stepKey,
          run_id: info.runId,
          reason: info.reason,
        },
      });
    } catch {
      // Telemetry must never take down the run.
    }
  };
}
