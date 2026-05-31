import type { Repositories } from '../db/repositories/index.ts';
import type { Gate, GateRun } from '../db/schemas.ts';
import type { ItemLifecycle } from '../engine/item-lifecycle.ts';
import type { GateExecutor, GateOutcome } from '../engine/gate-executor.ts';

/**
 * The gates that run in PARALLEL in the `test` column. `uat` is intentionally
 * absent — it is a +prime approval in the `review` column (workflows/test-cycle.md),
 * wired separately, not a parallel test gate.
 */
export const TEST_GATES: readonly Gate[] = [
  'code_review',
  'quality_control',
  'security_control',
  'design_review',
];

/** Canonical gate → persona mapping (workflows/test-cycle.md). */
export const GATE_PERSONA: Record<Gate, string> = {
  code_review: '+engineering-manager',
  quality_control: '+qa-engineer',
  security_control: '+security-engineer',
  design_review: '+designer',
  uat: '+prime',
};

export type TestCycleResult = {
  itemId: string;
  /** 1-based test cycle this run produced. */
  attempt: number;
  /** 'review' = all gates passed (or none selected); 'bounced' = ≥1 failed → in_progress. */
  outcome: 'review' | 'bounced';
  /** The gate_runs created for this attempt. */
  gates: GateRun[];
  /** Which gates failed (empty when outcome === 'review'). */
  failed: Gate[];
};

export type TestCycleDeps = {
  repos: Repositories;
  lifecycle: ItemLifecycle;
  gateExecutor: GateExecutor;
  /** Actor recorded on lifecycle transitions/audit. Default 'orchestrator'. */
  by?: string;
  /** Override the gate → persona map (tests). Default GATE_PERSONA. */
  personaForGate?: (gate: Gate) => string | null;
};

/**
 * Run the test-column gate cycle for an item already in `test` (§5.9 #4).
 *
 * Fans out the item's selected {@link TEST_GATES} in parallel — one gate_run row
 * each — then JOINS in the orchestrator layer: a plain fold over
 * `gateRuns.listForAttempt`, NOT a DAG fan-in (§5.12 / §5.13). All pass (or zero
 * test-gates selected) → lifecycle `review`; ≥1 fail → lifecycle `bounce` (back to
 * in_progress), with each failing gate's findings persisted on its gate_run.
 *
 * A gate executor that throws fails *that* gate (findings carry the error) so a
 * crash bounces rather than hangs the join. `attempt` isolates each cycle, so a
 * bounce + re-test never reads a previous cycle's stale `fail` rows.
 */
export async function runTestCycle(itemId: string, deps: TestCycleDeps): Promise<TestCycleResult> {
  const { repos, lifecycle, gateExecutor } = deps;
  const by = deps.by ?? 'orchestrator';
  const personaFor = deps.personaForGate ?? ((g: Gate) => GATE_PERSONA[g]);

  const item = repos.backlog.get(itemId);
  if (!item) throw new Error(`backlog item not found: ${itemId}`);
  if (item.status !== 'test') {
    throw new Error(
      `runTestCycle requires item in 'test', got '${item.status}' for ${itemId}`,
    );
  }

  const attempt = repos.gateRuns.currentAttempt(itemId) + 1;
  const selected = item.review_gates.filter((g) => TEST_GATES.includes(g));

  // Fan out: one gate_run row per selected test gate, executed in parallel.
  await Promise.all(
    selected.map(async (gate) => {
      const persona = personaFor(gate);
      const row = repos.gateRuns.create({
        item_id: itemId,
        gate,
        persona,
        attempt,
        status: 'running',
      });
      let outcome: GateOutcome;
      try {
        outcome = await gateExecutor.runGate({ itemId, gate, persona, attempt });
      } catch (err) {
        outcome = {
          pass: false,
          findings: `gate executor error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      repos.gateRuns.transition(row.id, outcome.pass ? 'pass' : 'fail', {
        findings: outcome.findings ?? null,
      });
    }),
  );

  // Join: orchestrator-layer fold over this cycle's rows (NOT a DAG fan-in, §5.13).
  const gates = repos.gateRuns.listForAttempt(itemId, attempt);
  const failed = gates.filter((g) => g.status === 'fail').map((g) => g.gate);

  if (failed.length === 0) {
    lifecycle.transition(
      itemId,
      'review',
      by,
      attempt > 1 ? `gates passed (attempt ${attempt})` : 'gates passed',
    );
    return { itemId, attempt, outcome: 'review', gates, failed: [] };
  }

  lifecycle.transition(itemId, 'bounce', by, `gate fail: ${failed.join(', ')}`);
  return { itemId, attempt, outcome: 'bounced', gates, failed };
}
