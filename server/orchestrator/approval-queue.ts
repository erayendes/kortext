import type { Repositories } from '../db/repositories/index.ts';
import type { PendingQuestion } from '../db/schemas.ts';

/**
 * Approval queue — manages `pending_questions` lifecycle.
 *
 * Building block for: gate pauses, +prime decisions, secret-detected manual
 * triage. The queue itself is dumb — callers enqueue a question, await an
 * answer (DB-polled), and the REST router exposes the dashboard endpoints.
 *
 * Why polling and not events? SQLite has no LISTEN/NOTIFY. A 500ms poll is
 * fine for human-in-the-loop where decisions take seconds-to-minutes.
 */

export type ApprovalQueueOptions = {
  repos: Repositories;
  /** How often waitForAnswer checks the DB. Default 500ms. */
  pollIntervalMs?: number;
};

export type EnqueueInput = {
  /** The run this question belongs to. `null` for epic-level questions (e.g. staging-approval)
   * that are not tied to a specific workflow run. The `pending_questions.run_id` column is
   * already nullable in the DB schema. */
  runId: number | null;
  stepId?: number | null;
  question: string;
  choices?: string[];
  /** Gate UI contract: artifact awaiting approval (step's first output). */
  artifactPath?: string | null;
  /** Gate UI contract: persona that produced the artifact. */
  persona?: string | null;
  /** Gate UI contract: the gate's phase. */
  phase?: string | null;
};

export type WaitOptions = {
  signal?: AbortSignal;
};

export class ApprovalQueue {
  private readonly repos: Repositories;
  private readonly pollIntervalMs: number;

  constructor(opts: ApprovalQueueOptions) {
    this.repos = opts.repos;
    this.pollIntervalMs = opts.pollIntervalMs ?? 500;
  }

  enqueue(input: EnqueueInput): PendingQuestion {
    const created = this.repos.pendingQuestions.create({
      run_id: input.runId,
      step_id: input.stepId ?? null,
      question: input.question,
      choices: input.choices ?? [],
      artifact_path: input.artifactPath ?? null,
      persona: input.persona ?? null,
      phase: input.phase ?? null,
    });
    this.repos.auditLog.append({
      actor: 'orchestrator',
      action: 'gate.awaiting-approval',
      resource_type: 'pending_question',
      resource_id: String(created.id),
      payload: {
        run_id: input.runId,
        question: input.question,
        choices: input.choices ?? [],
      },
    });
    return created;
  }

  answer(id: number, answer: string, answered_by: string): PendingQuestion {
    const answered = this.repos.pendingQuestions.answer(id, answer, answered_by);
    this.repos.auditLog.append({
      actor: answered_by,
      action: 'gate.answered',
      resource_type: 'pending_question',
      resource_id: String(id),
      payload: { answer, run_id: answered.run_id },
    });
    return answered;
  }

  /** Returns the first open question for a run (oldest by created_at). */
  findOpenForRun(runId: number): PendingQuestion | null {
    const open = this.repos.pendingQuestions.listOpen();
    return open.find((q) => q.run_id === runId) ?? null;
  }

  async waitForAnswer(id: number, opts: WaitOptions = {}): Promise<PendingQuestion> {
    const signal = opts.signal;
    while (true) {
      if (signal?.aborted) {
        throw new Error('waitForAnswer aborted');
      }
      const current = this.repos.pendingQuestions.get(id);
      if (!current) throw new Error(`pending_question not found: ${id}`);
      if (current.status === 'answered') return current;
      if (current.status === 'expired' || current.status === 'cancelled') {
        throw new Error(`pending_question ${id} ended without answer: ${current.status}`);
      }
      await delay(this.pollIntervalMs, signal);
    }
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('waitForAnswer aborted'));
      return;
    }
    const t = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new Error('waitForAnswer aborted'));
    };
    const cleanup = () => {
      clearTimeout(t);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
