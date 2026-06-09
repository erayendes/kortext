import type { Repositories } from '../db/repositories/index.ts';
import type { Gate, GateRun } from '../db/schemas.ts';
import type { ItemLifecycle } from '../engine/item-lifecycle.ts';
import type { GateExecutor, GateOutcome } from '../engine/gate-executor.ts';
import { applyCriterionToggle, readAcceptanceCriteria } from '../engine/acceptance-criteria.ts';
import type { AcResult } from '../engine/gate-verdict.ts';
import type { ApprovalQueue } from './approval-queue.ts';
import {
  MAX_GATE_FAILS,
  gateFailCount,
  findOpenEscalation,
  escalateGate,
} from './gate-escalation.ts';

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
  /**
   * - `review`    = all gates passed (or none selected) → review.
   * - `bounced`   = ≥1 failed (under the escalation threshold) → in_progress.
   * - `escalated` = a gate hit MAX_GATE_FAILS → +prime question raised, item
   *                 paused in `test` (no auto-bounce; UAT #10).
   * - `paused`    = the item already has an open escalation → gates NOT re-run
   *                 (no churn while +prime decides).
   */
  outcome: 'review' | 'bounced' | 'escalated' | 'paused';
  /** The gate_runs created for this attempt (empty when `paused`). */
  gates: GateRun[];
  /** Which gates failed (empty when outcome === 'review' / 'paused'). */
  failed: Gate[];
  /** The gate escalated to +prime (only when outcome === 'escalated'). */
  escalatedGate?: Gate;
};

export type TestCycleDeps = {
  repos: Repositories;
  lifecycle: ItemLifecycle;
  gateExecutor: GateExecutor;
  /** Actor recorded on lifecycle transitions/audit. Default 'orchestrator'. */
  by?: string;
  /** Override the gate → persona map (tests). Default GATE_PERSONA. */
  personaForGate?: (gate: Gate) => string | null;
  /**
   * The Inbox queue. When wired, a gate that fails MAX_GATE_FAILS times is
   * escalated to +prime instead of bounced forever (UAT #10). Left undefined
   * (plain CLI / older callers), the cycle bounces as before — no escalation.
   */
  queue?: ApprovalQueue;
};

/**
 * Apply a gate's per-criterion verdict to the item's AC checklist (#4). Each
 * acResult is matched to an AC by text (exact, then trimmed); a match toggles
 * `done = (status === 'met')` via {@link applyCriterionToggle}, attributed to the
 * gate persona. Best-effort: unmatched criteria and write errors are swallowed so
 * AC marking can never throw the test cycle. The item is re-read per result so
 * concurrent gates do not clobber each other's writes.
 */
function applyGateAcResults(
  repos: Repositories,
  itemId: string,
  acResults: AcResult[] | undefined,
  by: string,
): void {
  if (!acResults || acResults.length === 0) return;
  for (const ac of acResults) {
    try {
      const item = repos.backlog.get(itemId);
      if (!item) return;
      const list = readAcceptanceCriteria(item.frontmatter);
      let index = list.findIndex((c) => c.text === ac.text);
      if (index < 0) index = list.findIndex((c) => c.text.trim() === ac.text.trim());
      if (index < 0) continue;
      applyCriterionToggle(repos, { id: itemId, index, done: ac.status === 'met', by });
    } catch {
      // Best-effort — never fail the cycle over an AC mark.
    }
  }
}

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

  // UAT #10: if this item is already escalated (an open +prime question), do NOT
  // re-run the gates — it is paused awaiting a human decision. Re-running would
  // be the very churn the escalation exists to stop.
  if (deps.queue && findOpenEscalation(repos, itemId)) {
    return {
      itemId,
      attempt: repos.gateRuns.currentAttempt(itemId),
      outcome: 'paused',
      gates: [],
      failed: [],
    };
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
      // #4 — the gate marks the item's AC checkboxes from its per-criterion
      // verdict. Best-effort: a bad match or a write error never throws the cycle.
      applyGateAcResults(repos, itemId, outcome.acResults, persona ?? by);
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

  // UAT #10 — escalation gate: if a failing gate has now failed MAX_GATE_FAILS
  // times (since its last reset), do NOT auto-bounce into another blind retry.
  // Pause the item in `test` and escalate to +prime (with the concrete reason)
  // through the Inbox. Only when a queue is wired — otherwise bounce as before.
  if (deps.queue) {
    const overThreshold = failed.filter(
      (g) => gateFailCount(repos, itemId, g) >= MAX_GATE_FAILS,
    );
    if (overThreshold.length > 0) {
      const escalatedGate = overThreshold[0]!;
      escalateGate({ repos, queue: deps.queue }, itemId, escalatedGate, gateFailCount(repos, itemId, escalatedGate));
      // Item stays in `test` (paused) — no lifecycle transition.
      return { itemId, attempt, outcome: 'escalated', gates, failed, escalatedGate };
    }
  }

  lifecycle.transition(itemId, 'bounce', by, `gate fail: ${failed.join(', ')}`);
  return { itemId, attempt, outcome: 'bounced', gates, failed };
}
