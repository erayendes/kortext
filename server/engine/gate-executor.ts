import type { Gate, UsageMetadata } from '../db/schemas.ts';

/**
 * Gate execution abstraction — the gate-cycle counterpart of {@link Executor}.
 *
 * Division of labour (§5.1 turnusol): the engine owns the *mechanics* (parallel
 * fan-out, the join fold, lifecycle transitions, gate_runs bookkeeping); the
 * GateExecutor owns the *judgment* — does the item pass this quality gate? The
 * real implementation runs the gate's persona agent; tests inject a deterministic
 * MockGateExecutor.
 */

export type GateContext = {
  itemId: string;
  gate: Gate;
  /** Persona running this gate, e.g. '+qa-engineer'. */
  persona: string | null;
  /** 1-based test cycle; bumps on every re-test after a bounce. */
  attempt: number;
  /** Aborted when the surrounding run is cancelled. Implementations SHOULD honour it. */
  signal?: AbortSignal;
};

import type { AcResult } from './gate-verdict.ts';

/** A gate's verdict. `findings` is the write-up surfaced into gate_runs.findings (typically on fail). */
export type GateOutcome = {
  pass: boolean;
  findings?: string | null;
  /**
   * Per-acceptance-criterion judgments the gate persona rendered (#4). The
   * orchestrator applies these to the item's AC checklist (best-effort). Absent
   * when the executor produced no machine-readable verdict.
   */
  acResults?: AcResult[];
  /**
   * Token/cost the gate's persona agent spent (UAT #10 Faz 1). Carried up from
   * the underlying {@link Executor} result so test-cycle can persist it on the
   * gate_run — the "which gate burned how much" view. Absent for mock/older runs.
   */
  usage?: UsageMetadata;
};

export interface GateExecutor {
  /** Stable name for logs/audit, e.g. 'mock-gate', 'persona-agent'. */
  readonly name: string;
  /** Run one quality gate on an item and return a pass/fail verdict. */
  runGate(ctx: GateContext): Promise<GateOutcome>;
}
