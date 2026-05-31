import { describe, expect, it } from 'vitest';
import type { Executor, ExecutorContext, ExecutorResult } from '../server/engine/executor.ts';
import type { WorkflowStep } from '../server/engine/workflow-parser.ts';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import { AgentGateExecutor } from '../server/engine/executors/agent-gate-executor.ts';

const ctxFor = () => ({ runId: 1, runStepId: 1, worktreePath: '/wt' });

describe('AgentGateExecutor — gate judged by a real persona agent (capstone C5, §5.9 #4)', () => {
  it('a clean agent run → gate passes', async () => {
    const gx = new AgentGateExecutor({
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      resolveRunContext: ctxFor,
    });
    const out = await gx.runGate({ itemId: 'X', gate: 'code_review', persona: '+qa-engineer', attempt: 1 });
    expect(out.pass).toBe(true);
  });

  it("a failed agent run → gate fails, carrying the agent's findings", async () => {
    const gx = new AgentGateExecutor({
      executor: new MockExecutor(() => ({ fail: true, summary: 'missing tests on the new path' })),
      resolveRunContext: ctxFor,
    });
    const out = await gx.runGate({ itemId: 'X', gate: 'code_review', persona: '+qa-engineer', attempt: 1 });
    expect(out.pass).toBe(false);
    expect(out.findings).toContain('missing tests on the new path');
  });

  it('runs the gate persona inside the item worktree + run context', async () => {
    let seenStep: WorkflowStep | null = null;
    let seenCtx: ExecutorContext | null = null;
    const spy: Executor = {
      name: 'spy',
      async execute(step, ctx): Promise<ExecutorResult> {
        seenStep = step;
        seenCtx = ctx;
        return { ok: true, outputSummary: 'looks good' };
      },
    };
    const gx = new AgentGateExecutor({
      executor: spy,
      resolveRunContext: () => ({ runId: 7, runStepId: 3, worktreePath: '/wt/itemX' }),
    });
    const out = await gx.runGate({ itemId: 'itemX', gate: 'security_control', persona: '+security-engineer', attempt: 2 });

    expect(out.pass).toBe(true);
    // The gate ran as the gate's persona, in the item's resolved worktree + run.
    expect(seenStep!.persona).toBe('+security-engineer');
    expect(seenCtx!.worktreePath).toBe('/wt/itemX');
    expect(seenCtx!.runId).toBe(7);
    expect(seenCtx!.runStepId).toBe(3);
  });

  it('honors a cancellation signal passed through to the agent', async () => {
    const ac = new AbortController();
    let seenSignal: AbortSignal | null = null;
    const spy: Executor = {
      name: 'spy',
      async execute(_step, ctx): Promise<ExecutorResult> {
        seenSignal = ctx.signal;
        return { ok: true };
      },
    };
    const gx = new AgentGateExecutor({ executor: spy, resolveRunContext: ctxFor });
    await gx.runGate({
      itemId: 'X',
      gate: 'code_review',
      persona: '+qa-engineer',
      attempt: 1,
      signal: ac.signal,
    });
    expect(seenSignal).toBe(ac.signal);
  });
});
