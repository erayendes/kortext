import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { ApprovalQueue } from '../server/orchestrator/approval-queue.ts';
import {
  MAX_GATE_FAILS,
  ESCALATION_PHASE,
  gateFailCount,
  resetGateCounter,
  findOpenEscalation,
  buildEscalationReason,
  escalateGate,
  consumeGateEscalation,
} from '../server/orchestrator/gate-escalation.ts';
import type { Gate } from '../server/db/schemas.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;
let queue: ApprovalQueue;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-esc-'));
  const bundle = openDb({ path: join(tmpRoot, 'esc.db') });
  db = bundle.db;
  repos = bundle.repositories;
  queue = new ApprovalQueue({ repos });
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

/** Seed an item in `test` with the given AC; returns its id. */
function seedItem(id: string, ac: { text: string; done: boolean }[] = []): void {
  repos.backlog.create({
    id,
    type: 'task',
    title: id,
    status: 'test',
    frontmatter: ac.length ? { acceptance_criteria: ac } : {},
  });
}

/** Record a failed gate_run for item+gate at the given attempt. */
function failGate(itemId: string, gate: Gate, attempt: number, findings = 'fail reason'): void {
  const row = repos.gateRuns.create({ item_id: itemId, gate, persona: '+designer', attempt, status: 'running' });
  repos.gateRuns.transition(row.id, 'fail', { findings });
}

describe('gateFailCount (item+gate fail counter, derived from gate_runs)', () => {
  it('counts fails for the given gate, ignoring other gates and passes', () => {
    seedItem('T1');
    failGate('T1', 'design_review', 1);
    failGate('T1', 'design_review', 2);
    // a passing gate on the same item must not count
    const ok = repos.gateRuns.create({ item_id: 'T1', gate: 'design_review', persona: '+designer', attempt: 3, status: 'running' });
    repos.gateRuns.transition(ok.id, 'pass');
    // a different gate must not count toward design_review
    failGate('T1', 'security_control', 1);

    expect(gateFailCount(repos, 'T1', 'design_review')).toBe(2);
    expect(gateFailCount(repos, 'T1', 'security_control')).toBe(1);
  });

  it('is 0 for a gate that never failed', () => {
    seedItem('T1');
    expect(gateFailCount(repos, 'T1', 'design_review')).toBe(0);
  });

  it('counts only fails AFTER the latest reset marker', () => {
    seedItem('T1');
    failGate('T1', 'design_review', 1);
    failGate('T1', 'design_review', 2);
    failGate('T1', 'design_review', 3);
    expect(gateFailCount(repos, 'T1', 'design_review')).toBe(3);

    // +prime revises → reset; subsequent fails restart the count.
    resetGateCounter(repos, 'T1', 'design_review');
    expect(gateFailCount(repos, 'T1', 'design_review')).toBe(0);

    failGate('T1', 'design_review', 4);
    expect(gateFailCount(repos, 'T1', 'design_review')).toBe(1);
  });
});

describe('escalateGate + findOpenEscalation', () => {
  it('enqueues a +prime question with the escalation phase, choices, and metadata', () => {
    seedItem('T1', [{ text: 'must be accessible', done: false }]);
    failGate('T1', 'design_review', 3, 'contrast ratio 2.1:1 fails WCAG AA');

    const q = escalateGate({ repos, queue }, 'T1', 'design_review', MAX_GATE_FAILS);

    expect(q.phase).toBe(ESCALATION_PHASE);
    expect(q.persona).toBe('+prime');
    expect(q.choices).toEqual(['approve', 'revise', 'drop']);
    expect(q.metadata).toMatchObject({ itemId: 'T1', gate: 'design_review' });
    // The question body carries the concrete reason — not a dry "failed".
    expect(q.question).toContain('design_review');
    expect(q.question).toContain('contrast ratio 2.1:1 fails WCAG AA');
    expect(q.question).toContain('must be accessible'); // the unmet AC

    // It is now discoverable as the open escalation for the item.
    const open = findOpenEscalation(repos, 'T1');
    expect(open?.id).toBe(q.id);
  });

  it('findOpenEscalation returns null when no open escalation exists for the item', () => {
    seedItem('T1');
    expect(findOpenEscalation(repos, 'T1')).toBeNull();
  });
});

describe('buildEscalationReason', () => {
  it('includes the gate findings and the unmet acceptance criteria', () => {
    seedItem('T1', [
      { text: 'contrast ≥ 4.5:1', done: false },
      { text: 'keyboard navigable', done: true },
    ]);
    failGate('T1', 'design_review', 3, 'Karar: FAIL — contrast 2.1:1, focus ring yok');

    const reason = buildEscalationReason(repos, 'T1', 'design_review');
    expect(reason).toContain('contrast 2.1:1');
    expect(reason).toContain('contrast ≥ 4.5:1'); // unmet AC listed
    expect(reason).not.toContain('keyboard navigable'); // met AC excluded
  });
});

describe('consumeGateEscalation (+prime answer)', () => {
  it('approve → override-pass: item moves test → review', async () => {
    seedItem('T1');
    failGate('T1', 'design_review', 3);
    const q = escalateGate({ repos, queue }, 'T1', 'design_review', 3);
    const answered = queue.answer(q.id, 'approve', '+prime');

    await consumeGateEscalation(answered, { repos });

    expect(repos.backlog.get('T1')?.status).toBe('review');
    const log = repos.auditLog.list({ action: 'gate.escalation.override_pass', resource_id: 'T1' });
    expect(log.length).toBe(1);
  });

  it('revise → directed bounce to in_progress + counter reset + directive recorded', async () => {
    seedItem('T1');
    failGate('T1', 'design_review', 1);
    failGate('T1', 'design_review', 2);
    failGate('T1', 'design_review', 3);
    const q = escalateGate({ repos, queue }, 'T1', 'design_review', 3);
    const answered = queue.answer(q.id, 'revise: use a darker text color for AA contrast', '+prime');

    await consumeGateEscalation(answered, { repos });

    expect(repos.backlog.get('T1')?.status).toBe('in_progress');
    // Counter reset → 0 (the next dev turn gets a fresh budget).
    expect(gateFailCount(repos, 'T1', 'design_review')).toBe(0);
    // The directive is durably recorded on the item so the next turn is directed.
    const item = repos.backlog.get('T1')!;
    expect(String(item.frontmatter.revision_directive)).toContain('darker text color');
  });

  it('drop → item is cancelled (epic not blocked)', async () => {
    seedItem('T1');
    failGate('T1', 'design_review', 3);
    const q = escalateGate({ repos, queue }, 'T1', 'design_review', 3);
    const answered = queue.answer(q.id, 'drop', '+prime');

    await consumeGateEscalation(answered, { repos });

    expect(repos.backlog.get('T1')?.status).toBe('cancelled');
  });
});
