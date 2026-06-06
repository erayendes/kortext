import { Router, type Request, type Response } from 'express';
import type { Repositories } from '../db/repositories/index.ts';
import type { ApprovalQueue } from '../orchestrator/approval-queue.ts';
import { consumeStagingApproval } from '../orchestrator/staging-approval-consumer.ts';

/**
 * REST surface for the human-in-the-loop approval flow.
 *
 *   GET  /api/questions                 → list open questions
 *   POST /api/questions/:id/answer      → answer a specific question
 *   POST /api/runs/:runId/approve       → approve the oldest open question for a run
 */

export type ApprovalRouterDeps = {
  repos: Repositories;
  queue: ApprovalQueue;
};

export function approvalRouter(deps: ApprovalRouterDeps): Router {
  const r = Router();

  r.get('/questions', (_req: Request, res: Response) => {
    const questions = deps.repos.pendingQuestions.listOpen();
    res.json({ questions });
  });

  r.post('/questions/:id/answer', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'invalid_id' });
      return;
    }
    const existing = deps.repos.pendingQuestions.get(id);
    if (!existing) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const body = req.body as { answer?: unknown; answered_by?: unknown };
    if (typeof body.answer !== 'string' || typeof body.answered_by !== 'string') {
      res.status(400).json({ error: 'missing_fields' });
      return;
    }
    try {
      const answered = deps.queue.answer(id, body.answer, body.answered_by);

      // Fire-and-forget consumer for staging-approval questions. The route
      // MUST return the answered question even if the consumer errors.
      if (answered.phase === 'staging-approval') {
        consumeStagingApproval(answered, { repos: deps.repos, queue: deps.queue }).catch(
          (err: unknown) => {
            console.error('[approvals] consumeStagingApproval error:', err);
          },
        );
      }

      res.json({ question: answered });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(409).json({ error: 'cannot_answer', message });
    }
  });

  r.post('/runs/:runId/approve', (req, res) => {
    const runId = Number(req.params.runId);
    if (!Number.isFinite(runId)) {
      res.status(400).json({ error: 'invalid_run_id' });
      return;
    }
    const open = deps.queue.findOpenForRun(runId);
    if (!open) {
      res.status(404).json({ error: 'no_open_question' });
      return;
    }
    const body = req.body as { answered_by?: unknown; answer?: unknown };
    const answeredBy = typeof body.answered_by === 'string' ? body.answered_by : 'unknown';
    const answer = typeof body.answer === 'string' ? body.answer : 'approve';
    const answered = deps.queue.answer(open.id, answer, answeredBy);
    res.json({ question: answered });
  });

  return r;
}
