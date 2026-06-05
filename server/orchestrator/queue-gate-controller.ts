import { basename } from 'node:path';
import type { ApprovalQueue } from './approval-queue.ts';
import type {
  GateController,
  GatePauseContext,
  GateDecision,
} from '../engine/worker-pool.ts';

/**
 * Backs the worker-pool's gate barrier with the human-in-the-loop approval
 * queue. When a +prime gate fires mid-run, this enqueues a question (with the
 * just-completed step's artifact metadata) and blocks the run until a human
 * answers it via the REST surface (`POST /api/questions/:id/answer` etc).
 *
 * Mapping: an `approve` answer resumes the run; ANY other answer rejects it,
 * carrying the raw answer text as the rejection reason (so a "revise" answer
 * cancels the run with `rejected: revise`, surfacing the human's intent).
 *
 * Must be constructed with the SAME ApprovalQueue instance the server mounts on
 * its REST routes — otherwise the human's answer would land in a different DB
 * view than the one this controller polls.
 */
export class QueueGateController implements GateController {
  constructor(private readonly queue: ApprovalQueue) {}

  async pauseAtGate(ctx: GatePauseContext): Promise<GateDecision> {
    const { gate, runId } = ctx;
    const persona = gate.persona ?? 'Bir ajan';
    const filename = gate.artifactPath ? basename(gate.artifactPath) : 'çıktı';

    const created = this.queue.enqueue({
      runId,
      question: `${persona}, ${filename} dosyasını üretti. Onaylıyor musun?`,
      choices: ['approve', 'revise'],
      artifactPath: gate.artifactPath,
      persona: gate.persona,
      phase: gate.phase,
    });

    const answered = await this.queue.waitForAnswer(created.id);
    const answer = answered.answer ?? '';
    return answer === 'approve'
      ? { decision: 'approve' }
      : { decision: 'reject', reason: answer };
  }
}
