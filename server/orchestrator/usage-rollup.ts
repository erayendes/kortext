import type { GateRun, RunStep, UsageMetadata } from '../db/schemas.ts';

/**
 * Per-item token/cost rollup (UAT #10 Faz 1 — "hangi item/gate ne kadar yaktı").
 * Folds the usage_metadata persisted on an item's dev-cycle run_steps (coding)
 * and its gate_runs (review) into a total, and exposes the per-gate breakdown so
 * the item drawer can show which gate burned how much. Pure: feed it the rows.
 */

export type UsageTotals = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  total_cost_usd: number;
};

export type GateUsage = {
  gate: GateRun['gate'];
  attempt: number;
  status: GateRun['status'];
  usage: UsageMetadata | null;
};

export type ItemUsage = {
  /** Coding (dev-cycle run_steps) + every gate run, summed. */
  total: UsageTotals;
  /** Just the dev-cycle run_steps. */
  coding: UsageTotals;
  /** One entry per gate run, newest concerns first via the caller's ordering. */
  gates: GateUsage[];
};

function zero(): UsageTotals {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    total_cost_usd: 0,
  };
}

function add(acc: UsageTotals, u: UsageMetadata | null | undefined): void {
  if (!u) return;
  acc.input_tokens += u.input_tokens ?? 0;
  acc.output_tokens += u.output_tokens ?? 0;
  acc.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;
  acc.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0;
  acc.total_cost_usd += u.total_cost_usd ?? 0;
}

export function rollupItemUsage(steps: RunStep[], gateRuns: GateRun[]): ItemUsage {
  const coding = zero();
  for (const s of steps) add(coding, s.usage_metadata);

  const gatesTotal = zero();
  const gates: GateUsage[] = [];
  for (const g of gateRuns) {
    add(gatesTotal, g.usage_metadata);
    gates.push({ gate: g.gate, attempt: g.attempt, status: g.status, usage: g.usage_metadata ?? null });
  }

  const total: UsageTotals = {
    input_tokens: coding.input_tokens + gatesTotal.input_tokens,
    output_tokens: coding.output_tokens + gatesTotal.output_tokens,
    cache_read_input_tokens: coding.cache_read_input_tokens + gatesTotal.cache_read_input_tokens,
    cache_creation_input_tokens:
      coding.cache_creation_input_tokens + gatesTotal.cache_creation_input_tokens,
    total_cost_usd: coding.total_cost_usd + gatesTotal.total_cost_usd,
  };

  return { total, coding, gates };
}
