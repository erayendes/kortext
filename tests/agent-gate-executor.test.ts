import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import type { Executor, ExecutorContext, ExecutorResult } from '../server/engine/executor.ts';
import type { WorkflowStep } from '../server/engine/workflow-parser.ts';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import { AgentGateExecutor } from '../server/engine/executors/agent-gate-executor.ts';

let tmpRoot: string;
let worktree: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-age-'));
  worktree = join(tmpRoot, 'wt');
  mkdirSync(worktree, { recursive: true });
  const bundle = openDb({ path: join(tmpRoot, 'age.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

const ctxFor = () => ({ runId: 1, runStepId: 1, worktreePath: worktree });

/** Seed a backlog item with a title + acceptance criteria. */
function seedItem(id: string, title: string, ac: { text: string; done: boolean }[]) {
  repos.backlog.create({ id, type: 'task', title });
  repos.backlog.updateFrontmatter(id, { acceptance_criteria: ac });
}

/** An executor that writes a gate report to the worktree before returning ok. */
function reportWriter(reportRelPath: string, frontmatter: string): Executor {
  return {
    name: 'report-writer',
    async execute(_step, ctx): Promise<ExecutorResult> {
      const abs = join(ctx.worktreePath, reportRelPath);
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, frontmatter);
      return { ok: true, outputSummary: 'wrote report' };
    },
  };
}

describe('AgentGateExecutor — gate judged by a real persona agent (capstone C5, §5.9 #4)', () => {
  it('a clean agent run that wrote verdict: pass → gate passes', async () => {
    seedItem('X', 'Login works', [{ text: 'User can log in', done: false }]);
    const report = '.kortext/reports/quality_control-reports_X_2026-06-09_10-00-00.md';
    const gx = new AgentGateExecutor({
      executor: reportWriter(
        report,
        '---\nverdict: pass\nac_results:\n  - text: "User can log in"\n    status: met\n---\nlooks good\n',
      ),
      resolveRunContext: ctxFor,
      repos,
    });
    const out = await gx.runGate({ itemId: 'X', gate: 'quality_control', persona: '+qa-engineer', attempt: 1 });
    expect(out.pass).toBe(true);
    expect(out.acResults).toEqual([{ text: 'User can log in', status: 'met' }]);
  });

  it('a verdict: fail report → gate fails, carrying the agent findings + unmet AC', async () => {
    seedItem('X', 'Login works', [{ text: 'User can log in', done: false }]);
    const report = '.kortext/reports/quality_control-reports_X_2026-06-09_10-00-00.md';
    const gx = new AgentGateExecutor({
      executor: reportWriter(
        report,
        '---\nverdict: fail\nac_results:\n  - text: "User can log in"\n    status: unmet\n---\nlogin button does nothing\n',
      ),
      resolveRunContext: ctxFor,
      repos,
    });
    const out = await gx.runGate({ itemId: 'X', gate: 'quality_control', persona: '+qa-engineer', attempt: 1 });
    expect(out.pass).toBe(false);
    expect(out.findings).toContain('login button does nothing');
    expect(out.acResults).toEqual([{ text: 'User can log in', status: 'unmet' }]);
  });

  it('agent ran clean but produced NO report file → STRICT fail', async () => {
    seedItem('X', 'Login works', [{ text: 'User can log in', done: false }]);
    const gx = new AgentGateExecutor({
      executor: new MockExecutor(() => ({ durationMs: 1 })), // never writes a report
      resolveRunContext: ctxFor,
      repos,
    });
    const out = await gx.runGate({ itemId: 'X', gate: 'quality_control', persona: '+qa-engineer', attempt: 1 });
    expect(out.pass).toBe(false);
    expect(out.findings).toMatch(/no .*report|report.*not/i);
  });

  it("a failed agent run → gate fails, carrying the agent's error", async () => {
    seedItem('X', 'Login works', []);
    const gx = new AgentGateExecutor({
      executor: new MockExecutor(() => ({ fail: true, summary: 'missing tests on the new path' })),
      resolveRunContext: ctxFor,
      repos,
    });
    const out = await gx.runGate({ itemId: 'X', gate: 'code_review', persona: '+qa-engineer', attempt: 1 });
    expect(out.pass).toBe(false);
    expect(out.findings).toContain('missing tests on the new path');
  });

  it('synthesizes a rich step: AC text in the description + a patterned report output', async () => {
    seedItem('itemX', 'Build the login form', [
      { text: 'User can log in', done: false },
      { text: 'Errors are shown', done: false },
    ]);
    let seenStep: WorkflowStep | null = null;
    let seenCtx: ExecutorContext | null = null;
    const spy: Executor = {
      name: 'spy',
      async execute(step, ctx): Promise<ExecutorResult> {
        seenStep = step;
        seenCtx = ctx;
        // Write a report so the executor finds it.
        const out = step.outputs[0]!.replace('<slug>', 'itemX').replace('<ts>', '2026-06-09_10-00-00');
        const abs = join(ctx.worktreePath, out);
        mkdirSync(join(abs, '..'), { recursive: true });
        writeFileSync(abs, '---\nverdict: pass\n---\nok\n');
        return { ok: true, outputSummary: 'looks good' };
      },
    };
    const gx = new AgentGateExecutor({
      executor: spy,
      resolveRunContext: () => ({ runId: 7, runStepId: 3, worktreePath: worktree }),
      repos,
    });
    const out = await gx.runGate({ itemId: 'itemX', gate: 'security_control', persona: '+security-engineer', attempt: 2 });

    expect(out.pass).toBe(true);
    expect(seenStep!.persona).toBe('+security-engineer');
    expect(seenStep!.description).toContain('Build the login form');
    expect(seenStep!.description).toContain('User can log in');
    expect(seenStep!.description).toContain('Errors are shown');
    expect(seenStep!.outputs[0]).toContain('<slug>');
    expect(seenStep!.outputs[0]).toContain('<ts>');
    expect(seenStep!.outputs[0]).toContain('security_control-reports');
    expect(seenCtx!.worktreePath).toBe(worktree);
    expect(seenCtx!.runId).toBe(7);
    expect(seenCtx!.runStepId).toBe(3);
  });

  it('honors a cancellation signal passed through to the agent', async () => {
    seedItem('X', 'x', []);
    const ac = new AbortController();
    let seenSignal: AbortSignal | null = null;
    const spy: Executor = {
      name: 'spy',
      async execute(_step, ctx): Promise<ExecutorResult> {
        seenSignal = ctx.signal;
        const abs = join(ctx.worktreePath, '.kortext/reports/code_review-reports_X_2026-06-09_10-00-00.md');
        mkdirSync(join(abs, '..'), { recursive: true });
        writeFileSync(abs, '---\nverdict: pass\n---\nok\n');
        return { ok: true };
      },
    };
    const gx = new AgentGateExecutor({ executor: spy, resolveRunContext: ctxFor, repos });
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
