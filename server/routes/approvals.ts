import { Router, type Request, type Response } from 'express';
import type { Repositories } from '../db/repositories/index.ts';
import type { ApprovalQueue } from '../orchestrator/approval-queue.ts';
import type { Deployer } from '../engine/deployer.ts';
import { consumeStagingApproval } from '../orchestrator/staging-approval-consumer.ts';
import { consumePreprodApproval } from '../orchestrator/preprod-approval-consumer.ts';

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
  /** Deployer threaded in for staging-approval (deployPreprod) and preprod-approval (deployProd). */
  deployer?: Deployer;
};

export function approvalRouter(deps: ApprovalRouterDeps): Router {
  const r = Router();

  r.get('/questions', (_req: Request, res: Response) => {
    const questions = deps.repos.pendingQuestions.listOpen();
    res.json({ questions });
  });

  r.post('/questions/:id/answer', async (req, res) => {
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

      // Run the staging-approval consumer to completion BEFORE responding, so
      // its side-effects (bug on reject, reports approved + preprod question on
      // approve) are durable by the time the caller sees 200. A consumer error
      // is logged but does NOT fail the answer (the question is already answered).
      if (answered.phase === 'staging-approval') {
        try {
          await consumeStagingApproval(answered, {
            repos: deps.repos,
            queue: deps.queue,
            deployer: deps.deployer,
          });
        } catch (err: unknown) {
          console.error('[approvals] consumeStagingApproval error:', err);
        }
      }

      // Run the preprod-approval consumer (chain ends at preprod per §5.11:
      // approve → deployProd; reject → bug). Best-effort; a consumer error
      // is logged but does NOT fail the answer.
      if (answered.phase === 'preprod-approval' && deps.deployer) {
        try {
          await consumePreprodApproval(answered, {
            repos: deps.repos,
            queue: deps.queue,
            deployer: deps.deployer,
          });
        } catch (err: unknown) {
          console.error('[approvals] consumePreprodApproval error:', err);
        }
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
