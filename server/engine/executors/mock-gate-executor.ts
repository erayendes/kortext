import type { GateContext, GateExecutor, GateOutcome } from '../gate-executor.ts';
import type { AcResult } from '../gate-verdict.ts';
import type { UsageMetadata } from '../../db/schemas.ts';

export type MockGateBehavior = {
  /** Force this gate to fail. */
  fail?: boolean;
  /** Findings text surfaced into gate_runs.findings. */
  findings?: string | null;
  /** Delay before resolving, ms. Default 0. Use to make parallel overlap observable. */
  durationMs?: number;
  /** Per-criterion judgments the gate "rendered" — test-cycle applies these to the item AC. */
  acResults?: AcResult[];
  /** Token/cost telemetry surfaced into gate_runs.usage_metadata (UAT #10 Faz 1). */
  usage?: UsageMetadata;
};

/**
 * Deterministic GateExecutor for tests — the gate-cycle counterpart of
 * MockExecutor. The behavior callback decides pass/fail + findings per
 * (gate, attempt), so test-cycle tests can drive any join outcome. Tracks
 * call order and peak concurrency so tests can assert parallel fan-out.
 */
export class MockGateExecutor implements GateExecutor {
  readonly name = 'mock-gate';
  /** Gates in the order runGate() was entered. */
  readonly ranOrder: string[] = [];
  /** Peak number of gates running simultaneously. */
  maxConcurrent = 0;

  private inFlight = 0;

  constructor(private readonly behavior: (ctx: GateContext) => MockGateBehavior = () => ({})) {}

  async runGate(ctx: GateContext): Promise<GateOutcome> {
    this.ranOrder.push(ctx.gate);
    this.inFlight += 1;
    if (this.inFlight > this.maxConcurrent) this.maxConcurrent = this.inFlight;
    try {
      const cfg = this.behavior(ctx);
      if (cfg.durationMs && cfg.durationMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, cfg.durationMs));
      }
      return {
        pass: !cfg.fail,
        findings: cfg.findings ?? null,
        acResults: cfg.acResults,
        usage: cfg.usage,
      };
    } finally {
      this.inFlight -= 1;
    }
  }
}
