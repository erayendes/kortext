import type { Executor, ExecutorContext, ExecutorResult, UsageMetadata } from '../executor.ts';
import type { WorkflowStep } from '../workflow-parser.ts';

export type MockStepBehavior = {
  /** Delay before resolving, ms. Default 10. */
  durationMs?: number;
  /** Force failure for this step. */
  fail?: boolean;
  /** Output summary string surfaced into run_steps.output_summary. */
  summary?: string;
  /** Token/cost telemetry surfaced into run_steps.usage_metadata (UAT #10 Faz 1). */
  usage?: UsageMetadata;
};

/**
 * Deterministic executor for tests. Records the order in which steps started
 * and finished, plus their concurrent overlap, so engine tests can assert
 * that the worker pool actually parallelises.
 */
export class MockExecutor implements Executor {
  readonly name = 'mock';

  /** Order in which execute() was entered. */
  readonly startedOrder: string[] = [];
  /** Order in which execute() resolved or rejected. */
  readonly endedOrder: string[] = [];
  /** Max number of executes running simultaneously. */
  maxConcurrent = 0;

  private inFlight = 0;

  constructor(private readonly behavior: (step: WorkflowStep) => MockStepBehavior = () => ({})) {}

  async execute(step: WorkflowStep, ctx: ExecutorContext): Promise<ExecutorResult> {
    if (ctx.signal.aborted) {
      return { ok: false, errorMessage: 'aborted before start' };
    }

    this.startedOrder.push(step.key);
    this.inFlight += 1;
    if (this.inFlight > this.maxConcurrent) this.maxConcurrent = this.inFlight;

    const cfg = this.behavior(step);
    const duration = cfg.durationMs ?? 10;

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, duration);
        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        };
        ctx.signal.addEventListener('abort', onAbort, { once: true });
      });
    } catch (e) {
      this.inFlight -= 1;
      this.endedOrder.push(step.key);
      return { ok: false, errorMessage: e instanceof Error ? e.message : String(e) };
    }

    this.inFlight -= 1;
    this.endedOrder.push(step.key);

    if (cfg.fail) {
      return { ok: false, errorMessage: cfg.summary ?? 'mock-forced-failure', usage: cfg.usage };
    }
    return { ok: true, outputSummary: cfg.summary ?? `mock:${step.key}`, usage: cfg.usage };
  }
}
