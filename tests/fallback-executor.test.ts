import { describe, expect, it, vi } from 'vitest';
import { FallbackExecutor } from '../server/engine/executors/fallback-executor.ts';
import type { Executor, ExecutorContext, ExecutorResult } from '../server/engine/executor.ts';
import type { WorkflowStep } from '../server/engine/workflow-parser.ts';

function makeStep(): WorkflowStep {
  return {
    key: 'p.1',
    index: 0,
    phase: 'P',
    persona: '+dev',
    description: 'do the thing',
    inputs: [],
    outputs: ['out.md'],
    approver: null,
    reviewer: null,
  };
}

function makeCtx(): ExecutorContext {
  return {
    workflowId: 'wf',
    runId: 1,
    runStepId: 1,
    worktreePath: '/tmp',
    signal: new AbortController().signal,
  };
}

/** A stub executor that records calls and returns a canned result. */
class StubExecutor implements Executor {
  calls = 0;
  constructor(
    readonly name: string,
    private readonly result: ExecutorResult,
  ) {}
  async execute(): Promise<ExecutorResult> {
    this.calls += 1;
    return this.result;
  }
}

const success: ExecutorResult = { ok: true, outputSummary: 'ok' };
const recoverableFail: ExecutorResult = {
  ok: false,
  recoverable: true,
  errorMessage: 'antigravity-cli produced no output (possible quota/rate-limit — 429)',
};
const hardFail: ExecutorResult = {
  ok: false,
  errorMessage: 'declared outputs not produced: out.md',
};

describe('FallbackExecutor', () => {
  it('single-entry chain is a zero-cost passthrough', async () => {
    const only = new StubExecutor('antigravity-cli', success);
    const fb = new FallbackExecutor([{ kind: 'antigravity', executor: only }]);
    const res = await fb.execute(makeStep(), makeCtx());
    expect(res).toEqual(success);
    expect(only.calls).toBe(1);
  });

  it('returns the first executor result when it succeeds (does not try the rest)', async () => {
    const first = new StubExecutor('antigravity-cli', success);
    const second = new StubExecutor('claude-cli', success);
    const fb = new FallbackExecutor([
      { kind: 'antigravity', executor: first },
      { kind: 'claude', executor: second },
    ]);
    const res = await fb.execute(makeStep(), makeCtx());
    expect(res.ok).toBe(true);
    expect(first.calls).toBe(1);
    expect(second.calls).toBe(0);
  });

  it('falls through on a RECOVERABLE failure and returns the next success', async () => {
    const first = new StubExecutor('antigravity-cli', recoverableFail);
    const second = new StubExecutor('claude-cli', success);
    const fb = new FallbackExecutor([
      { kind: 'antigravity', executor: first },
      { kind: 'claude', executor: second },
    ]);
    const res = await fb.execute(makeStep(), makeCtx());
    expect(res.ok).toBe(true);
    expect(first.calls).toBe(1);
    expect(second.calls).toBe(1);
  });

  it('chains through multiple recoverable failures to the first success', async () => {
    const a = new StubExecutor('antigravity-cli', recoverableFail);
    const b = new StubExecutor('claude-cli', recoverableFail);
    const c = new StubExecutor('codex-cli', success);
    const fb = new FallbackExecutor([
      { kind: 'antigravity', executor: a },
      { kind: 'claude', executor: b },
      { kind: 'codex', executor: c },
    ]);
    const res = await fb.execute(makeStep(), makeCtx());
    expect(res.ok).toBe(true);
    expect(a.calls).toBe(1);
    expect(b.calls).toBe(1);
    expect(c.calls).toBe(1);
  });

  // UAT #10 follow-up — "agy kota-uyarısı": a recoverable fallthrough (most
  // commonly agy's 429 quota) must be observable beyond a console line, so the
  // composition can write it into the audit feed (GUI Activity).
  it('fires onFallover with from/to/reason when it falls through (Faz 1)', async () => {
    const first = new StubExecutor('antigravity-cli', recoverableFail);
    const second = new StubExecutor('claude-cli', success);
    const onFallover = vi.fn();
    const fb = new FallbackExecutor(
      [
        { kind: 'antigravity', executor: first },
        { kind: 'claude', executor: second },
      ],
      { log: () => {}, onFallover },
    );
    await fb.execute(makeStep(), makeCtx());
    expect(onFallover).toHaveBeenCalledTimes(1);
    expect(onFallover).toHaveBeenCalledWith({
      from: 'antigravity',
      to: 'claude',
      stepKey: 'p.1',
      runId: 1,
      runStepId: 1,
      reason: 'antigravity-cli produced no output (possible quota/rate-limit — 429)',
    });
  });

  it('does NOT fire onFallover on success or on a hard fail (Faz 1)', async () => {
    const onFallover = vi.fn();
    const okFb = new FallbackExecutor(
      [
        { kind: 'antigravity', executor: new StubExecutor('a', success) },
        { kind: 'claude', executor: new StubExecutor('c', success) },
      ],
      { onFallover },
    );
    await okFb.execute(makeStep(), makeCtx());
    const hardFb = new FallbackExecutor(
      [
        { kind: 'antigravity', executor: new StubExecutor('a', hardFail) },
        { kind: 'claude', executor: new StubExecutor('c', success) },
      ],
      { log: () => {}, onFallover },
    );
    await hardFb.execute(makeStep(), makeCtx());
    expect(onFallover).not.toHaveBeenCalled();
  });

  it('fails fast on a HARD (non-recoverable) failure — does NOT try the next', async () => {
    const first = new StubExecutor('antigravity-cli', hardFail);
    const second = new StubExecutor('claude-cli', success);
    const fb = new FallbackExecutor([
      { kind: 'antigravity', executor: first },
      { kind: 'claude', executor: second },
    ]);
    const res = await fb.execute(makeStep(), makeCtx());
    expect(res.ok).toBe(false);
    expect(res).toEqual(hardFail);
    expect(first.calls).toBe(1);
    expect(second.calls).toBe(0);
  });

  it('returns the LAST failure when every executor recoverably fails', async () => {
    const lastFail: ExecutorResult = {
      ok: false,
      recoverable: true,
      errorMessage: 'claude-cli produced no output (possible quota/rate-limit — 429)',
    };
    const first = new StubExecutor('antigravity-cli', recoverableFail);
    const second = new StubExecutor('claude-cli', lastFail);
    const fb = new FallbackExecutor([
      { kind: 'antigravity', executor: first },
      { kind: 'claude', executor: second },
    ]);
    const res = await fb.execute(makeStep(), makeCtx());
    expect(res.ok).toBe(false);
    expect(res.errorMessage).toContain('claude-cli');
    expect(first.calls).toBe(1);
    expect(second.calls).toBe(1);
  });

  it('logs which executor failed and that it is falling over', async () => {
    const logged: string[] = [];
    const first = new StubExecutor('antigravity-cli', recoverableFail);
    const second = new StubExecutor('claude-cli', success);
    const fb = new FallbackExecutor(
      [
        { kind: 'antigravity', executor: first },
        { kind: 'claude', executor: second },
      ],
      { log: (m) => logged.push(m) },
    );
    await fb.execute(makeStep(), makeCtx());
    const joined = logged.join('\n');
    expect(joined).toMatch(/antigravity/);
    expect(joined).toMatch(/claude/);
    expect(joined).toMatch(/429|quota|fall/i);
  });

  it('name reflects the chain', () => {
    const fb = new FallbackExecutor([
      { kind: 'antigravity', executor: new StubExecutor('antigravity-cli', success) },
      { kind: 'claude', executor: new StubExecutor('claude-cli', success) },
    ]);
    expect(fb.name).toContain('fallback');
    expect(fb.name).toContain('antigravity');
    expect(fb.name).toContain('claude');
  });

  it('throws when constructed with an empty chain', () => {
    expect(() => new FallbackExecutor([])).toThrow();
  });

  it('honours abort — does not fall over after a cancelled run', async () => {
    const ac = new AbortController();
    ac.abort();
    const aborted: ExecutorResult = { ok: false, errorMessage: 'aborted by signal' };
    const first = new StubExecutor('antigravity-cli', aborted);
    const second = new StubExecutor('claude-cli', success);
    const fb = new FallbackExecutor([
      { kind: 'antigravity', executor: first },
      { kind: 'claude', executor: second },
    ]);
    const ctx = { ...makeCtx(), signal: ac.signal };
    const res = await fb.execute(makeStep(), ctx);
    expect(res.ok).toBe(false);
    expect(second.calls).toBe(0);
  });
});
