import type { Executor, ExecutorContext, ExecutorResult } from '../executor.ts';
import type { ExecutorKind } from '../../cli/executor-factory.ts';
import type { WorkflowStep } from '../workflow-parser.ts';

/**
 * Runs an ORDERED chain of executors with automatic fallback (UAT #10).
 *
 * Motivation: during the live UAT antigravity (`agy`) hit
 * `RESOURCE_EXHAUSTED (code 429): Individual quota reached` — it returned
 * exit-0 with empty output, which Kortext misreported as a hard
 * "declared outputs not produced" failure that killed the whole pipeline.
 * Onboarding now picks an ORDERED priority list (e.g. 1) antigravity, 2)
 * claude, 3) codex); when the first executor RECOVERABLY fails (quota / 429 /
 * rate-limit / empty-output / transient — surfaced as `result.recoverable`),
 * the engine logs why and falls over to the NEXT executor instead of failing
 * the run.
 *
 * Fail-fast contract: a NON-recoverable failure (a real
 * declared-output-missing with non-empty output, a bad model id, …) does NOT
 * fall through — the chain stops and returns it immediately, so genuine bugs
 * are never masked by silently trying another model.
 *
 * Composition mirrors {@link PersonaRoutedExecutor}: stateless wrapper, zero
 * behaviour beyond dispatch + fallthrough. A single-entry chain is a zero-cost
 * passthrough (it just delegates to the one executor).
 */

export type FallbackEntry = {
  kind: ExecutorKind;
  executor: Executor;
};

/**
 * One recoverable fallthrough (UAT #10 follow-up — "agy kota-uyarısı"). Most
 * commonly: agy hit its 429 quota and the chain moved on to the next executor.
 * Handed to `onFallover` so the composition can surface it in the audit feed
 * (GUI Activity) instead of only a console line.
 */
export type FalloverInfo = {
  from: ExecutorKind;
  to: ExecutorKind;
  stepKey: string;
  runId: number;
  runStepId: number;
  reason: string;
};

export type FallbackExecutorOptions = {
  /** Sink for fallthrough diagnostics. Defaults to console.warn. */
  log?: (message: string) => void;
  /** Fired on every recoverable fallthrough (quota/429/transient). Optional. */
  onFallover?: (info: FalloverInfo) => void;
};

export class FallbackExecutor implements Executor {
  readonly name: string;
  private readonly log: (message: string) => void;
  private readonly onFallover?: (info: FalloverInfo) => void;

  constructor(
    private readonly chain: FallbackEntry[],
    opts: FallbackExecutorOptions = {},
  ) {
    if (chain.length === 0) {
      throw new Error('FallbackExecutor requires at least one executor in the chain');
    }
    this.log = opts.log ?? ((m: string) => console.warn(m));
    this.onFallover = opts.onFallover;
    this.name = `fallback(${chain.map((e) => e.kind).join('→')})`;
  }

  async execute(step: WorkflowStep, ctx: ExecutorContext): Promise<ExecutorResult> {
    let last!: ExecutorResult;
    for (let i = 0; i < this.chain.length; i++) {
      const entry = this.chain[i]!;
      last = await entry.executor.execute(step, ctx);
      if (last.ok) return last;

      // Honour a cancel: an aborted run is never a "try the next model" case.
      if (ctx.signal.aborted) return last;

      const isLast = i === this.chain.length - 1;
      if (!last.recoverable || isLast) {
        if (!last.recoverable && !isLast) {
          this.log(
            `[fallback] ${entry.kind} (${entry.executor.name}) failed NON-recoverably on step ${step.key} — failing fast, not trying the rest: ${last.errorMessage ?? 'unknown error'}`,
          );
        }
        return last;
      }

      const next = this.chain[i + 1]!;
      this.log(
        `[fallback] ${entry.kind} (${entry.executor.name}) failed recoverably on step ${step.key} (${last.errorMessage ?? 'unknown error'}) — falling over to ${next.kind} (${next.executor.name})`,
      );
      // Surface the fallover (quota warning) to whoever is listening — the
      // composition writes it into the audit feed so it shows in the GUI.
      this.onFallover?.({
        from: entry.kind,
        to: next.kind,
        stepKey: step.key,
        runId: ctx.runId,
        runStepId: ctx.runStepId,
        reason: last.errorMessage ?? 'unknown error',
      });
    }
    return last;
  }
}
