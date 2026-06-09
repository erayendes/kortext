import type { Repositories } from '../db/repositories/index.ts';
import type { Gate, PendingQuestion } from '../db/schemas.ts';
import type { ApprovalQueue } from './approval-queue.ts';
import { readAcceptanceCriteria } from '../engine/acceptance-criteria.ts';
import { GATE_PERSONA } from './test-cycle.ts';

/**
 * Gate-fail escalation (KRİTİK UAT #10 — sonsuz bounce döngüsü).
 *
 * A gate that fails, bounces, gets re-coded, and fails the SAME way forever is a
 * blind loop (live: design_review failed 8× with no progress). Eray's rule:
 *
 *   gate fail → bounce + retry; on the **3rd fail (after 2 retries)** stop
 *   auto-bouncing → PAUSE the item and escalate to +prime through the existing
 *   Inbox (pending_questions / ApprovalQueue) — no new infrastructure.
 *
 * The escalation question MUST carry the concrete REASON (the verdict findings +
 * the unmet acceptance criteria), not a dry "failed". +prime answers:
 *
 *   approve → override-pass, the item advances (test → review).
 *   revise  → one DIRECTED dev turn (the instruction is recorded on the item),
 *             the fail counter is RESET, the item bounces to in_progress.
 *   drop    → the item is cancelled so it does not block its epic.
 *
 * The fail counter is DERIVED from `gate_runs` (no new table): the number of
 * `fail` rows for an item+gate since the latest `gate.escalation.reset` audit
 * marker. A `revise` writes that marker, giving the next turn a fresh budget.
 */

/** Fails (per item+gate, since the last reset) at which we escalate instead of bounce. */
export const MAX_GATE_FAILS = 3;

/** The pending_questions `phase` used for gate escalations. */
export const ESCALATION_PHASE = 'gate-escalation';

/** The three +prime choices. `approve` = override-pass, `drop` = cancel, else = revise. */
export const ESCALATION_CHOICES: readonly string[] = ['approve', 'revise', 'drop'];

const RESET_ACTION = 'gate.escalation.reset';

/**
 * The fail baseline set by the latest reset for this item+gate: the highest
 * `gate_runs.id` that existed when +prime last revised. Fails count only ABOVE
 * this id. We key off the monotonic row id (not a timestamp) so a reset and a
 * fresh fail written in the same millisecond can never collide. 0 = no reset.
 */
function resetBaseline(repos: Repositories, itemId: string, gate: Gate): number {
  const resets = repos.auditLog
    .list({ action: RESET_ACTION, resource_id: itemId, limit: 100 })
    .filter((e) => (e.payload as { gate?: unknown } | null)?.gate === gate);
  // list() is newest-first → the head is the latest reset.
  const since = (resets[0]?.payload as { sinceGateRunId?: unknown } | undefined)?.sinceGateRunId;
  return typeof since === 'number' ? since : 0;
}

/**
 * How many times `gate` has failed for `itemId` SINCE the latest reset.
 * Counts `gate_runs` `fail` rows whose id is above the reset baseline (0 if no
 * reset), so a `revise` gives the next dev turn a fresh budget.
 */
export function gateFailCount(repos: Repositories, itemId: string, gate: Gate): number {
  const baseline = resetBaseline(repos, itemId, gate);
  return repos.gateRuns
    .listForItem(itemId)
    .filter((g) => g.gate === gate && g.status === 'fail' && g.id > baseline).length;
}

/**
 * Forgive a gate's past fails (UAT #10 — +prime "revise" gives a fresh budget).
 * Records the current high-water `gate_runs.id` for this item+gate as the new
 * baseline; future fails restart the count from zero.
 */
export function resetGateCounter(
  repos: Repositories,
  itemId: string,
  gate: Gate,
  by = '+prime',
): void {
  const ids = repos.gateRuns
    .listForItem(itemId)
    .filter((g) => g.gate === gate)
    .map((g) => g.id);
  const sinceGateRunId = ids.length > 0 ? Math.max(...ids) : 0;
  repos.auditLog.append({
    actor: by,
    action: RESET_ACTION,
    resource_type: 'backlog_item',
    resource_id: itemId,
    payload: { gate, sinceGateRunId },
  });
}

/** The open gate-escalation question for `itemId`, or null. */
export function findOpenEscalation(repos: Repositories, itemId: string): PendingQuestion | null {
  return (
    repos.pendingQuestions
      .listOpen()
      .find(
        (q) =>
          q.phase === ESCALATION_PHASE &&
          (q.metadata as { itemId?: unknown } | null)?.itemId === itemId,
      ) ?? null
  );
}

/**
 * Build the human-readable escalation reason for +prime: the gate's persona, the
 * verdict findings from its latest fail, and the item's still-unmet acceptance
 * criteria. This is the body of the Inbox question (UAT #10 — "kuru fail değil").
 */
export function buildEscalationReason(repos: Repositories, itemId: string, gate: Gate): string {
  const persona = GATE_PERSONA[gate] ?? 'gate';
  const fails = repos.gateRuns
    .listForItem(itemId)
    .filter((g) => g.gate === gate && g.status === 'fail');
  const latest = fails[fails.length - 1];
  const findings = latest?.findings?.trim() || '(no findings recorded)';

  const item = repos.backlog.get(itemId);
  const unmet = item
    ? readAcceptanceCriteria(item.frontmatter).filter((c) => !c.done).map((c) => c.text)
    : [];

  const lines = [
    `Gate "${gate}" (${persona}) has failed ${MAX_GATE_FAILS} times in a row with no progress.`,
    '',
    'Findings from the latest review:',
    findings,
  ];
  if (unmet.length > 0) {
    lines.push('', 'Unmet acceptance criteria:');
    for (const text of unmet) lines.push(`- ${text}`);
  }
  lines.push(
    '',
    'Choose: approve (override-pass, ship it), revise (give an instruction for one directed retry), or drop (cancel this item).',
  );
  return lines.join('\n');
}

export type EscalateGateDeps = { repos: Repositories; queue: ApprovalQueue };

/**
 * Enqueue the +prime escalation question for a gate that hit the fail threshold.
 * The item is left in `test` (paused) — runTestCycle skips an item with an open
 * escalation until +prime answers.
 */
export function escalateGate(
  deps: EscalateGateDeps,
  itemId: string,
  gate: Gate,
  failCount: number,
): PendingQuestion {
  const question = buildEscalationReason(deps.repos, itemId, gate);
  const created = deps.queue.enqueue({
    runId: null,
    question,
    choices: [...ESCALATION_CHOICES],
    persona: '+prime',
    phase: ESCALATION_PHASE,
    metadata: { itemId, gate, failCount },
  });
  deps.repos.auditLog.append({
    actor: 'orchestrator',
    action: 'gate.escalation.raised',
    resource_type: 'backlog_item',
    resource_id: itemId,
    payload: { gate, failCount, questionId: created.id },
  });
  return created;
}

export type ConsumeGateEscalationDeps = { repos: Repositories; by?: string };

/**
 * Process an answered gate-escalation question (dispatched from the approvals
 * route). Safe to call on any answered question — a missing itemId is a no-op.
 *
 *   approve → test → review (override-pass).
 *   revise  → reset the counter + record the directive on the item + bounce to
 *             in_progress for one directed dev turn.
 *   drop    → cancel the item.
 *
 * The answer convention mirrors the staging consumer: `approve` / `drop` are
 * exact; anything else is a `revise` whose text (minus an optional `revise:`
 * prefix) is the directive handed to the next dev turn.
 */
export function consumeGateEscalation(
  question: PendingQuestion,
  deps: ConsumeGateEscalationDeps,
): void {
  const { repos } = deps;
  const by = deps.by ?? '+prime';
  const metadata = question.metadata as { itemId?: unknown; gate?: unknown } | null;
  const itemId = typeof metadata?.itemId === 'string' ? metadata.itemId : null;
  const gate = typeof metadata?.gate === 'string' ? (metadata.gate as Gate) : null;
  if (!itemId || !gate) return;

  const item = repos.backlog.get(itemId);
  if (!item) return;

  const answer = (question.answer ?? '').trim();

  if (answer === 'approve') {
    // Override-pass: +prime accepts the work despite the gate. Advance to review.
    repos.backlog.transitionStatus(itemId, 'review');
    repos.auditLog.append({
      actor: by,
      action: 'gate.escalation.override_pass',
      resource_type: 'backlog_item',
      resource_id: itemId,
      payload: { gate },
    });
    return;
  }

  if (answer === 'drop') {
    // Cancel so the item never blocks its epic.
    repos.backlog.transitionStatus(itemId, 'cancelled');
    repos.auditLog.append({
      actor: by,
      action: 'gate.escalation.dropped',
      resource_type: 'backlog_item',
      resource_id: itemId,
      payload: { gate },
    });
    return;
  }

  // Anything else → revise: one DIRECTED retry with the counter reset.
  const directive = answer.replace(/^revise\s*:?\s*/i, '').trim() || 'address the gate findings above';

  // Record the directive durably so the next dev turn is directed, not blind.
  repos.backlog.updateFrontmatter(itemId, {
    ...item.frontmatter,
    revision_directive: directive,
  });
  repos.auditLog.append({
    actor: by,
    action: 'item_comment',
    resource_type: 'backlog_item',
    resource_id: itemId,
    payload: { text: `Revision directive (${gate}): ${directive}` },
  });

  // Reset the fail counter for this gate — the next dev turn gets a fresh budget.
  resetGateCounter(repos, itemId, gate, by);

  // Bounce to in_progress so the driver re-runs the dev cycle (directed).
  repos.backlog.transitionStatus(itemId, 'in_progress');
  repos.auditLog.append({
    actor: by,
    action: 'gate.escalation.revised',
    resource_type: 'backlog_item',
    resource_id: itemId,
    payload: { gate, directive },
  });
}
