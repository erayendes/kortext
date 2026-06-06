import type { Repositories } from '../db/repositories/index.ts';
import type { ApprovalQueue } from './approval-queue.ts';

export type StagingApprovalDeps = {
  repos: Repositories;
  queue: ApprovalQueue;
  /** Injected clock for deterministic tests. Default: Date.now. */
  now?: () => number;
};

export type StagingApprovalResult = {
  epicId: string;
  /** Distinct gate personas found across the epic's children. */
  gatePersonas: string[];
  /** Number of gate-staging report rows successfully registered. */
  reportsRegistered: number;
  /** True when the staging-approval question was enqueued. */
  approvalEnqueued: boolean;
};

/**
 * Post-deploy staging-approval fan-out (Task B5).
 *
 * After a successful staging deploy, this function:
 *   (a) Gathers the distinct gate personas that ran gates on ANY of the epic's
 *       children, then registers one `reports_index` row per persona
 *       (scope='gate-staging', author=persona). Fan-out is best-effort — a
 *       report failure is swallowed so it cannot block the approval question.
 *   (b) Enqueues a single `pending_questions` row for +prime to approve staging
 *       (phase='staging-approval', run_id=null) so a human can sign off before
 *       the next release cycle.
 *
 * This function is pure orchestrator logic — no LLM calls, no file I/O.
 * The `file_path` inserted into `reports_index` is a synthetic path that records
 * intent; the actual markdown files are produced by the approval consumer (not
 * implemented in this task — see SCOPE BOUND in B5 spec).
 */
export async function runStagingApproval(
  epicId: string,
  deps: StagingApprovalDeps,
): Promise<StagingApprovalResult> {
  const { repos, queue } = deps;
  const now = deps.now ?? (() => Date.now());

  // (a) Gather the epic's children.
  const children = repos.backlog.list({ parent_id: epicId, limit: 1000 });
  const childIds = children.map((c) => c.id);

  // Collect gate runs for every child, then deduplicate personas.
  const personaSet = new Set<string>();
  for (const childId of childIds) {
    const gateRuns = repos.gateRuns.listForItem(childId);
    for (const gr of gateRuns) {
      if (gr.persona) personaSet.add(gr.persona);
    }
  }
  const gatePersonas = [...personaSet].sort();

  // Register one reports_index row per distinct gate persona (best-effort).
  let reportsRegistered = 0;
  for (const persona of gatePersonas) {
    try {
      // Slug is deterministic: epic id + sanitised persona handle + scope marker.
      const safePersona = persona.replace(/[^a-zA-Z0-9_-]/g, '_');
      const slug = `gate-staging--${epicId}--${safePersona}`;
      // file_path records intent; the consumer produces the real file.
      const filePath = `reports/gate-staging/${epicId}/${safePersona}.md`;
      repos.reports.create({
        scope: 'gate-staging',
        slug,
        file_path: filePath,
        author: persona,
        status: 'uninitialized',
        tags: ['gate-staging', epicId],
        related_item: epicId,
        created_at: now(),
      });
      reportsRegistered++;
    } catch {
      // Best-effort: swallow individual report failures so the approval still fires.
    }
  }

  // (b) Enqueue staging-approval question for +prime.
  queue.enqueue({
    runId: null,
    question: `Epic ${epicId} has been deployed to staging. Please review and approve the staging build.`,
    choices: ['approve', 'reject'],
    phase: 'staging-approval',
    persona: '+prime',
  });

  return {
    epicId,
    gatePersonas,
    reportsRegistered,
    approvalEnqueued: true,
  };
}
