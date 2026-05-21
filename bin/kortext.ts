#!/usr/bin/env tsx
/**
 * Kortext CLI entry — Faz 3 orchestrator surface.
 *
 *   kortext start <workflow-id>          run a workflow with the mock executor
 *   kortext approve <run-id> [answer]    answer the oldest open question for a run
 *   kortext status                       print recent runs + open questions
 *
 * In Faz 7 this file will be compiled to JS as part of `npm run build:server`.
 * For now invoke via `npx tsx bin/kortext.ts <cmd>` or `bin/kortext.js` shim.
 */

import { resolve } from 'node:path';
import { getDb } from '../server/db/client.ts';
import { ApprovalQueue } from '../server/orchestrator/approval-queue.ts';
import {
  startCommand,
  approveCommand,
  statusCommand,
} from '../server/cli/commands.ts';

const args = process.argv.slice(2);
const cmd = args[0];

async function main(): Promise<number> {
  const { repositories: repos } = getDb();
  const queue = new ApprovalQueue({ repos });

  switch (cmd) {
    case 'start': {
      const workflowId = args[1];
      if (!workflowId) {
        console.error('usage: kortext start <workflow-id>');
        return 2;
      }
      const result = await startCommand({
        repos,
        workflowsDir: resolve(process.cwd(), 'workflows'),
        workflowId,
        executor: 'mock',
      });
      if (!result.ok) {
        console.error(`start failed: ${result.errorMessage}`);
        return 1;
      }
      console.log(
        `run #${result.runId} → ${result.status}` +
          (result.failedStepKey ? ` (failed step: ${result.failedStepKey})` : ''),
      );
      return result.status === 'succeeded' ? 0 : 1;
    }

    case 'approve': {
      const runId = Number(args[1]);
      const answer = args[2] ?? 'approve';
      if (!Number.isFinite(runId)) {
        console.error('usage: kortext approve <run-id> [answer]');
        return 2;
      }
      const result = await approveCommand({
        repos,
        queue,
        runId,
        answer,
        answeredBy: process.env.USER ?? 'cli',
      });
      if (!result.ok) {
        console.error(`approve failed: ${result.errorMessage}`);
        return 1;
      }
      console.log(`approved question #${result.questionId} with '${result.answer}'`);
      return 0;
    }

    case 'status': {
      const result = statusCommand({ repos });
      console.log('Recent runs:');
      for (const r of result.recentRuns) {
        console.log(`  #${r.id}  ${r.workflow_id}  ${r.status}  by ${r.triggered_by}`);
      }
      console.log('Open questions:');
      if (result.openQuestions.length === 0) {
        console.log('  (none)');
      } else {
        for (const q of result.openQuestions) {
          console.log(`  #${q.id}  run=${q.run_id}  ${q.question}`);
        }
      }
      return 0;
    }

    case 'help':
    case undefined:
      console.log(
        [
          'kortext v3 — orchestrator CLI',
          '',
          '  start <workflow-id>        run a workflow now (mock executor)',
          '  approve <run-id> [answer]  answer the oldest open question for a run',
          '  status                     show recent runs + open questions',
        ].join('\n'),
      );
      return 0;

    default:
      console.error(`unknown command: ${cmd}`);
      return 2;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
