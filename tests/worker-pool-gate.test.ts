import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { parseWorkflowMarkdown } from '../server/engine/workflow-parser.ts';
import { buildGraph } from '../server/engine/dag.ts';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import { runWorkflow, type GateController } from '../server/engine/worker-pool.ts';
import { ApprovalQueue } from '../server/orchestrator/approval-queue.ts';
import {
  NotificationDispatcher,
  type NotificationTransport,
} from '../server/notifications/dispatcher.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

// Two-step workflow with a gate between them. Faz 13: gate signal comes
// from `approver: +prime` on the step itself — no more `> [!NOTE]` callouts.
const wfWithGate = parseWorkflowMarkdown(
  `# Two-Step Gated

## Phase 1
1. **+a:** first
   - Outputs: a.md
   - approver: +prime

## Phase 2
2. **+b:** second
   - Inputs: a.md
   - Outputs: b.md
`,
  'gated',
);

const wfNoGate = parseWorkflowMarkdown(
  `# Ungated
## P
1. **+a:** first
   - Outputs: a.md
2. **+b:** second
   - Outputs: b.md
`,
  'ungated',
);

class FakeTransport implements NotificationTransport {
  readonly sent: string[] = [];
  readonly channel = 'slack' as const;
  isEnabled(): boolean {
    return true;
  }
  async send(text: string, _payload: Record<string, unknown>): Promise<void> {
    this.sent.push(text);
  }
  hasKind(kind: string): boolean {
    return this.sent.some((line) => line.includes(kind));
  }
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-gate-'));
  const bundle = openDb({ path: join(tmpRoot, 'gate.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('runWorkflow — gate integration', () => {
  it('is a regression-free no-op when no gates are configured', async () => {
    const graph = buildGraph(wfNoGate);
    const result = await runWorkflow(graph, new MockExecutor(() => ({ durationMs: 1 })), repos, {
      concurrency: 1,
    });
    expect(result.run.status).toBe('succeeded');
  });

  it('pauses at the gate and only resumes after approve', async () => {
    const graph = buildGraph(wfWithGate);
    const executor = new MockExecutor(() => ({ durationMs: 5 }));

    let pauseCalled = false;
    const controller: GateController = {
      pauseAtGate: async () => {
        pauseCalled = true;
        // At pause-time, the second step must NOT have started yet.
        expect(executor.startedOrder).toEqual(['phase-1.1']);
        return { decision: 'approve' };
      },
    };

    const result = await runWorkflow(graph, executor, repos, {
      concurrency: 2,
      gates: wfWithGate.gates,
      gateController: controller,
    });

    expect(pauseCalled).toBe(true);
    expect(result.run.status).toBe('succeeded');
    expect(executor.startedOrder).toEqual(['phase-1.1', 'phase-2.1']);
  });

  it('cancels the run with rejected: <reason> when controller rejects', async () => {
    const graph = buildGraph(wfWithGate);
    const executor = new MockExecutor(() => ({ durationMs: 5 }));

    const controller: GateController = {
      pauseAtGate: async () => ({
        decision: 'reject',
        reason: 'blueprint missing acceptance criteria',
      }),
    };

    const result = await runWorkflow(graph, executor, repos, {
      concurrency: 2,
      gates: wfWithGate.gates,
      gateController: controller,
    });

    expect(result.run.status).toBe('cancelled');
    expect(result.run.error_message).toBe(
      'rejected: blueprint missing acceptance criteria',
    );
    // Second step never started.
    expect(executor.startedOrder).toEqual(['phase-1.1']);
    // Remaining step is recorded as skipped.
    const steps = repos.runs.listSteps(result.run.id);
    const second = steps.find((s) => s.step_index === 1);
    expect(second?.status).toBe('skipped');
  });

  it('dispatches gate.awaiting-approval when a dispatcher is given on options', async () => {
    const graph = buildGraph(wfWithGate);
    const transport = new FakeTransport();
    const dispatcher = new NotificationDispatcher({ repos, transports: [transport] });

    const controller: GateController = {
      pauseAtGate: async (ctx) => {
        await dispatcher.dispatch({
          kind: 'gate.awaiting-approval',
          runId: ctx.runId,
          workflowId: ctx.workflowId,
          summary: `awaiting approval for ${ctx.gate.phase}`,
          payload: { phase: ctx.gate.phase },
          questionId: 1,
        });
        return { decision: 'approve' };
      },
    };

    await runWorkflow(graph, new MockExecutor(() => ({ durationMs: 1 })), repos, {
      concurrency: 1,
      gates: wfWithGate.gates,
      gateController: controller,
    });

    expect(transport.hasKind('gate.awaiting-approval')).toBe(true);
  });

  it('integrates with ApprovalQueue: enqueue + external answer drives resume', async () => {
    const graph = buildGraph(wfWithGate);
    const queue = new ApprovalQueue({ repos, pollIntervalMs: 20 });

    const controller: GateController = {
      pauseAtGate: async ({ gate, runId }) => {
        const q = queue.enqueue({
          runId,
          question: `approve gate after ${gate.phase}?`,
          choices: ['approve', 'reject'],
        });
        // Answer asynchronously to mimic a human poking the REST endpoint.
        setTimeout(() => {
          queue.answer(q.id, 'approve', 'tester');
        }, 30);
        const answered = await queue.waitForAnswer(q.id);
        return answered.answer === 'approve'
          ? { decision: 'approve' }
          : { decision: 'reject', reason: answered.answer ?? 'unknown' };
      },
    };

    const result = await runWorkflow(graph, new MockExecutor(() => ({ durationMs: 1 })), repos, {
      concurrency: 1,
      gates: wfWithGate.gates,
      gateController: controller,
    });

    expect(result.run.status).toBe('succeeded');
    const questions = repos.pendingQuestions.listOpen();
    expect(questions).toHaveLength(0); // answered, not open
  });

  it('records audit log entries for gate.paused and gate.resumed', async () => {
    const graph = buildGraph(wfWithGate);
    const controller: GateController = {
      pauseAtGate: async () => ({ decision: 'approve' }),
    };

    const result = await runWorkflow(
      graph,
      new MockExecutor(() => ({ durationMs: 1 })),
      repos,
      {
        concurrency: 1,
        gates: wfWithGate.gates,
        gateController: controller,
      },
    );

    const entries = repos.auditLog.list({ resource_id: String(result.run.id) });
    expect(entries.some((e) => e.action === 'gate.paused')).toBe(true);
    expect(entries.some((e) => e.action === 'gate.resumed')).toBe(true);
  });
});

describe('Orchestrator.retryRun', () => {
  it('retries a rejected run, reusing the worktree and skipping succeeded steps', async () => {
    const { Orchestrator } = await import('../server/orchestrator/orchestrator.ts');

    let attempts = 0;
    const orchestrator = new Orchestrator({
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadWorkflowById: (id) => (id === 'gated' ? wfWithGate : null),
      approvalQueue: new ApprovalQueue({ repos }),
      gateController: {
        pauseAtGate: async () => {
          attempts += 1;
          if (attempts === 1) {
            return { decision: 'reject', reason: 'fix me' };
          }
          return { decision: 'approve' };
        },
      },
      acquireWorktree: async (runId) => ({
        path: join(tmpRoot, `wt-${runId}`),
        release: async () => {},
      }),
    });

    const first = await orchestrator.triggerWorkflow('gated');
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.run.status).toBe('cancelled');
      expect(first.run.error_message).toContain('rejected: fix me');
    }
    if (!first.ok) throw new Error('expected ok');

    const retried = await orchestrator.retryRun(first.run.id);
    expect(retried.ok).toBe(true);
    if (retried.ok) {
      expect(retried.run.status).toBe('succeeded');
      // The retried run shares the worktree of the original (same key path).
      expect(retried.run.worktree_path).toBe(first.run.worktree_path);
      // First-phase step was already done; on the retry it should be marked skipped(resumed).
      const steps = repos.runs.listSteps(retried.run.id);
      const firstStep = steps.find((s) => s.step_index === 0);
      expect(firstStep?.status).toBe('skipped');
      expect(firstStep?.output_summary).toBe('resumed-from-previous-run');
    }
  });

  it('refuses to retry a run that was not rejected', async () => {
    const { Orchestrator } = await import('../server/orchestrator/orchestrator.ts');
    const orchestrator = new Orchestrator({
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadWorkflowById: (id) => (id === 'gated' ? wfWithGate : null),
      approvalQueue: new ApprovalQueue({ repos }),
      gateController: { pauseAtGate: async () => ({ decision: 'approve' }) },
    });

    const result = await orchestrator.triggerWorkflow('gated');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');

    // Run already succeeded — retry should refuse.
    const retried = await orchestrator.retryRun(result.run.id);
    expect(retried.ok).toBe(false);
    if (!retried.ok) {
      expect(retried.reason).toBe('not-retryable');
    }
  });

  it('returns workflow-not-found when the original workflow definition is gone', async () => {
    const { Orchestrator } = await import('../server/orchestrator/orchestrator.ts');
    // Seed a cancelled+rejected run directly.
    const run = repos.runs.createRun({
      workflow_id: 'vanished',
      item_id: null,
      status: 'queued',
      worktree_path: null,
      triggered_by: 'test',
    });
    repos.runs.transitionRun(run.id, 'cancelled', {
      error_message: 'rejected: gone',
    });

    const orchestrator = new Orchestrator({
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadWorkflowById: () => null,
      approvalQueue: new ApprovalQueue({ repos }),
    });

    const retried = await orchestrator.retryRun(run.id);
    expect(retried.ok).toBe(false);
    if (!retried.ok) {
      expect(retried.reason).toBe('workflow-not-found');
    }
  });
});
