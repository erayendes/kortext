import type { Executor, ExecutorContext, ExecutorResult } from '../executor.ts';
import type { WorkflowStep } from '../workflow-parser.ts';

/**
 * Routes a step to a persona-specific executor.
 *
 * Use case: a team where +developer should be answered by Claude but +reviewer
 * by Gemini, or where a high-cost model is reserved for +architect and the
 * cheaper one handles +qa.
 *
 * Resolution:
 *   1. If `step.persona` matches a key in `routes`, delegate to that executor.
 *   2. Otherwise (or if persona is null), delegate to `fallback`.
 *
 * The wrapper itself is stateless — it adds zero behaviour beyond dispatching.
 */

export type PersonaRoutedExecutorOptions = {
  routes: Map<string, Executor>;
  fallback: Executor;
};

export class PersonaRoutedExecutor implements Executor {
  readonly name: string;

  constructor(private readonly opts: PersonaRoutedExecutorOptions) {
    const names = new Set<string>();
    for (const ex of opts.routes.values()) names.add(ex.name);
    names.add(opts.fallback.name);
    this.name = `routed(${[...names].sort().join('|')})`;
  }

  execute(step: WorkflowStep, ctx: ExecutorContext): Promise<ExecutorResult> {
    const target = step.persona ? this.opts.routes.get(step.persona) : null;
    return (target ?? this.opts.fallback).execute(step, ctx);
  }
}
