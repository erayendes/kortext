import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isTransientCliFailure } from '../server/engine/executors/cli-spawn.ts';
import { ClaudeCliExecutor } from '../server/engine/executors/claude-cli-executor.ts';
import type { WorkflowStep } from '../server/engine/workflow-parser.ts';
import type { ExecutorContext } from '../server/engine/executor.ts';

// ---------------------------------------------------------------------------
// Pure classifier
// ---------------------------------------------------------------------------

describe('isTransientCliFailure', () => {
  const base = { exitCode: 1, stdoutTail: '', stderrTail: '', aborted: false };

  it('flags the live-run failure (socket closed) as transient', () => {
    // The exact message that killed the live UAT analysis step.
    expect(
      isTransientCliFailure({
        ...base,
        stdoutTail: 'API Error: The socket connection was closed unexpectedly',
      }),
    ).toBe(true);
  });

  it('flags network/overload/rate-limit markers as transient', () => {
    for (const msg of [
      'Error: ECONNRESET',
      'fetch failed',
      'request timed out',
      'overloaded_error',
      'rate limit exceeded',
      'HTTP 503 Service Unavailable',
      'API Error: 529 overloaded',
    ]) {
      expect(isTransientCliFailure({ ...base, stderrTail: msg }), msg).toBe(true);
    }
  });

  it('does NOT retry a clean success', () => {
    expect(
      isTransientCliFailure({ ...base, exitCode: 0, stdoutTail: 'done' }),
    ).toBe(false);
  });

  it('does NOT retry a user-cancelled (aborted) run', () => {
    expect(
      isTransientCliFailure({
        ...base,
        aborted: true,
        stdoutTail: 'API Error: socket connection was closed',
      }),
    ).toBe(false);
  });

  it('does NOT retry a deterministic / config failure', () => {
    // A bad model id, a missing binary, an auth-rejected key — re-running won't help.
    for (const msg of [
      'Error: invalid model "claude-nope"',
      'spawn ENOENT',
      'declared outputs not produced: foo.md',
      'boom',
    ]) {
      expect(isTransientCliFailure({ ...base, stderrTail: msg }), msg).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Executor-level retry (real spawn, counter-driven mock binary)
// ---------------------------------------------------------------------------

let tmpRoot: string;
let workdir: string;
let agentsDir: string;
let logsDir: string;

function makeMockBinary(name: string, body: string): string {
  const path = join(tmpRoot, name);
  writeFileSync(path, `#!/bin/bash\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

function makeStep(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    key: 'phase-a.1',
    index: 0,
    phase: 'Phase A',
    persona: '+backend-developer',
    description: 'do the thing',
    inputs: [],
    outputs: [],
    approver: null,
    reviewer: null,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<ExecutorContext> = {}): ExecutorContext {
  return {
    workflowId: 'test-wf',
    runId: 1,
    runStepId: 1,
    worktreePath: workdir,
    signal: new AbortController().signal,
    ...overrides,
  };
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-cli-retry-'));
  workdir = join(tmpRoot, 'work');
  agentsDir = join(tmpRoot, 'agents');
  logsDir = join(tmpRoot, 'logs');
  mkdirSync(workdir, { recursive: true });
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(logsDir, { recursive: true });
  writeFileSync(join(agentsDir, 'backend-developer.md'), '# backend-developer\n\nx\n');
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('ClaudeCliExecutor — transient retry', () => {
  it('retries a transient socket failure and succeeds on the next attempt', async () => {
    const counter = join(tmpRoot, 'attempts');
    // Fails transiently on attempt 1, succeeds on attempt 2.
    const bin = makeMockBinary(
      'claude-flaky',
      [
        `n=$(cat "${counter}" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "${counter}"`,
        `if [ "$n" -lt 2 ]; then echo "API Error: The socket connection was closed unexpectedly"; exit 1; fi`,
        `echo "ok on attempt $n"; exit 0`,
      ].join('\n'),
    );
    const exec = new ClaudeCliExecutor({
      binary: bin,
      agentsDir,
      logsDir,
      maxAttempts: 3,
      retryBaseDelayMs: 0,
    });
    const result = await exec.execute(makeStep(), makeCtx());
    expect(result.ok).toBe(true);
    expect(readFileSync(counter, 'utf8').trim()).toBe('2'); // spawned twice
  });

  it('gives up after maxAttempts when the transient failure persists', async () => {
    const counter = join(tmpRoot, 'attempts');
    const bin = makeMockBinary(
      'claude-always-flaky',
      [
        `n=$(cat "${counter}" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "${counter}"`,
        `echo "API Error: The socket connection was closed unexpectedly"; exit 1`,
      ].join('\n'),
    );
    const exec = new ClaudeCliExecutor({
      binary: bin,
      agentsDir,
      logsDir,
      maxAttempts: 3,
      retryBaseDelayMs: 0,
    });
    const result = await exec.execute(makeStep(), makeCtx());
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toMatch(/code 1/);
    expect(readFileSync(counter, 'utf8').trim()).toBe('3'); // exhausted all attempts
  });

  it('does NOT retry a deterministic non-transient failure', async () => {
    const counter = join(tmpRoot, 'attempts');
    const bin = makeMockBinary(
      'claude-hardfail',
      [
        `n=$(cat "${counter}" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "${counter}"`,
        `echo "Error: invalid model"; exit 2`,
      ].join('\n'),
    );
    const exec = new ClaudeCliExecutor({
      binary: bin,
      agentsDir,
      logsDir,
      maxAttempts: 3,
      retryBaseDelayMs: 0,
    });
    const result = await exec.execute(makeStep(), makeCtx());
    expect(result.ok).toBe(false);
    expect(readFileSync(counter, 'utf8').trim()).toBe('1'); // spawned once, no retry
  });
});
