import { describe, expect, it } from 'vitest';
import { createExecutor } from '../server/cli/executor-factory.ts';
import { PersonaRoutedExecutor } from '../server/engine/executors/persona-routed-executor.ts';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import type { Executor, ExecutorContext } from '../server/engine/executor.ts';
import type { WorkflowStep } from '../server/engine/workflow-parser.ts';

function makeStep(persona: string | null, key = 'p.1'): WorkflowStep {
  return {
    key,
    index: 0,
    phase: 'P',
    persona,
    description: 'test',
    inputs: [],
    outputs: [],
    approver: null,
    reviewer: null,
  };
}

function makeCtx(): ExecutorContext {
  return {
    workflowId: 'test',
    runId: 1,
    runStepId: 1,
    worktreePath: '/tmp',
    signal: new AbortController().signal,
  };
}

const cliOpts = {
  binary: '/usr/bin/true',
  agentsDir: '/tmp/agents',
  logsDir: '/tmp/logs',
};

describe('createExecutor', () => {
  it('returns a MockExecutor for kind "mock"', () => {
    const ex = createExecutor('mock', cliOpts);
    expect(ex.name).toBe('mock');
    expect(ex).toBeInstanceOf(MockExecutor);
  });

  it('returns a ClaudeCliExecutor for kind "claude"', () => {
    const ex = createExecutor('claude', cliOpts);
    expect(ex.name).toBe('claude-cli');
  });

  it('returns a CodexCliExecutor for kind "codex"', () => {
    const ex = createExecutor('codex', cliOpts);
    expect(ex.name).toBe('codex-cli');
  });

  it('returns a GeminiCliExecutor for kind "gemini"', () => {
    const ex = createExecutor('gemini', cliOpts);
    expect(ex.name).toBe('gemini-cli');
  });

  it('throws on an unknown executor kind', () => {
    expect(() => createExecutor('grok' as never, cliOpts)).toThrow(/unknown executor/);
  });
});

describe('PersonaRoutedExecutor', () => {
  it('routes to the matching persona executor', async () => {
    const claudeLike = new MockExecutor(() => ({ summary: 'from-claude' }));
    const geminiLike = new MockExecutor(() => ({ summary: 'from-gemini' }));
    const fallback = new MockExecutor(() => ({ summary: 'from-fallback' }));

    const routed: Executor = new PersonaRoutedExecutor({
      routes: new Map<string, Executor>([
        ['+developer', claudeLike],
        ['+reviewer', geminiLike],
      ]),
      fallback,
    });

    const r1 = await routed.execute(makeStep('+developer'), makeCtx());
    expect(r1.outputSummary).toBe('from-claude');

    const r2 = await routed.execute(makeStep('+reviewer'), makeCtx());
    expect(r2.outputSummary).toBe('from-gemini');
  });

  it('falls back when persona has no explicit route', async () => {
    const fallback = new MockExecutor(() => ({ summary: 'fb' }));
    const routed = new PersonaRoutedExecutor({
      routes: new Map<string, Executor>([['+developer', new MockExecutor(() => ({ summary: 'd' }))]]),
      fallback,
    });

    const r = await routed.execute(makeStep('+unknown-persona'), makeCtx());
    expect(r.outputSummary).toBe('fb');
  });

  it('falls back when step has no persona', async () => {
    const fallback = new MockExecutor(() => ({ summary: 'fb' }));
    const routed = new PersonaRoutedExecutor({
      routes: new Map<string, Executor>(),
      fallback,
    });
    const r = await routed.execute(makeStep(null), makeCtx());
    expect(r.outputSummary).toBe('fb');
  });

  it('reports a composite name listing all routed executors', () => {
    const routed = new PersonaRoutedExecutor({
      routes: new Map<string, Executor>([
        ['+developer', new MockExecutor()],
      ]),
      fallback: new MockExecutor(),
    });
    expect(routed.name).toMatch(/routed/);
  });
});
