import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AntigravityCliExecutor } from '../server/engine/executors/antigravity-cli-executor.ts';
import { ClaudeCliExecutor } from '../server/engine/executors/claude-cli-executor.ts';
import { CodexCliExecutor } from '../server/engine/executors/codex-cli-executor.ts';
import { GeminiCliExecutor } from '../server/engine/executors/gemini-cli-executor.ts';
import type { WorkflowStep } from '../server/engine/workflow-parser.ts';
import type { ExecutorContext } from '../server/engine/executor.ts';

// UAT #10: each CLI executor, when it produces no usable output (exit-0 but the
// declared FILE outputs are missing AND stdout is empty / quota-shaped), must
// return a CLEAR errorMessage mentioning quota/429 and mark the result
// `recoverable` so the FallbackExecutor falls over to the next executor.

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
    description: 'write the report',
    inputs: [],
    outputs: ['report.md'],
    approver: null,
    reviewer: null,
    ...overrides,
  };
}

function makeCtx(): ExecutorContext {
  return {
    workflowId: 'test-wf',
    runId: 1,
    runStepId: 1,
    worktreePath: workdir,
    signal: new AbortController().signal,
  };
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-cli-recov-'));
  workdir = join(tmpRoot, 'work');
  agentsDir = join(tmpRoot, 'agents');
  logsDir = join(tmpRoot, 'logs');
  mkdirSync(workdir, { recursive: true });
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(logsDir, { recursive: true });
  writeFileSync(join(agentsDir, 'backend-developer.md'), '# backend-developer\n');
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('CLI executors — empty/quota output is a recoverable failure (UAT #10)', () => {
  it('antigravity: exit-0 + empty stdout + missing output → clear quota error, recoverable', async () => {
    // The agy 429 shape: exits 0, prints nothing useful, writes no file.
    const binary = makeMockBinary('agy', 'cat >/dev/null; exit 0');
    const ex = new AntigravityCliExecutor({ binary, agentsDir, logsDir });
    const res = await ex.execute(makeStep(), makeCtx());
    expect(res.ok).toBe(false);
    expect(res.recoverable).toBe(true);
    expect(res.errorMessage).toMatch(/no output/i);
    expect(res.errorMessage).toMatch(/429|quota/i);
    // It must NOT be the misleading bare "declared outputs not produced".
    expect(res.errorMessage).not.toBe('declared outputs not produced: report.md');
  });

  it('antigravity: exit-0 that prints a 429 marker but no file → recoverable quota error', async () => {
    const binary = makeMockBinary(
      'agy',
      'cat >/dev/null; echo "RESOURCE_EXHAUSTED (code 429): Individual quota reached"; exit 0',
    );
    const ex = new AntigravityCliExecutor({ binary, agentsDir, logsDir });
    const res = await ex.execute(makeStep(), makeCtx());
    expect(res.ok).toBe(false);
    expect(res.recoverable).toBe(true);
    expect(res.errorMessage).toMatch(/429|quota/i);
  });

  it('claude: exit-0 + empty stdout + missing output → recoverable quota error', async () => {
    const binary = makeMockBinary('claude', 'cat >/dev/null; exit 0');
    const ex = new ClaudeCliExecutor({ binary, agentsDir, logsDir, maxAttempts: 1 });
    const res = await ex.execute(makeStep(), makeCtx());
    expect(res.ok).toBe(false);
    expect(res.recoverable).toBe(true);
    expect(res.errorMessage).toMatch(/no output/i);
  });

  it('codex: exit-0 + empty stdout + missing output → recoverable quota error', async () => {
    const binary = makeMockBinary('codex', 'cat >/dev/null; exit 0');
    const ex = new CodexCliExecutor({ binary, agentsDir, logsDir });
    const res = await ex.execute(makeStep(), makeCtx());
    expect(res.ok).toBe(false);
    expect(res.recoverable).toBe(true);
    expect(res.errorMessage).toMatch(/no output/i);
  });

  it('gemini: exit-0 + empty stdout + missing output → recoverable quota error', async () => {
    const binary = makeMockBinary('gemini', 'cat >/dev/null; exit 0');
    const ex = new GeminiCliExecutor({ binary, agentsDir, logsDir });
    const res = await ex.execute(makeStep(), makeCtx());
    expect(res.ok).toBe(false);
    expect(res.recoverable).toBe(true);
    expect(res.errorMessage).toMatch(/no output/i);
  });

  it('claude: missing output WITH real non-empty stdout → hard failure (NOT recoverable)', async () => {
    // The agent did real work and talked, but forgot to write the file — a
    // genuine declared-output-missing bug that must NOT silently fall through.
    const binary = makeMockBinary(
      'claude',
      'cat >/dev/null; echo "I analysed the requirements and decided not to write a file."; exit 0',
    );
    const ex = new ClaudeCliExecutor({ binary, agentsDir, logsDir, maxAttempts: 1 });
    const res = await ex.execute(makeStep(), makeCtx());
    expect(res.ok).toBe(false);
    expect(res.recoverable).not.toBe(true);
    expect(res.errorMessage).toMatch(/declared outputs not produced/);
  });

  it('claude: produces the file → ok (no regression)', async () => {
    const binary = makeMockBinary(
      'claude',
      'cat >/dev/null; echo "done"; echo "hi" > report.md; exit 0',
    );
    const ex = new ClaudeCliExecutor({ binary, agentsDir, logsDir, maxAttempts: 1 });
    const res = await ex.execute(makeStep(), makeCtx());
    expect(res.ok).toBe(true);
  });

  it('non-zero exit with a quota marker → recoverable', async () => {
    const binary = makeMockBinary(
      'agy',
      'cat >/dev/null; echo "RESOURCE_EXHAUSTED (code 429): quota reached" >&2; exit 1',
    );
    const ex = new AntigravityCliExecutor({ binary, agentsDir, logsDir });
    const res = await ex.execute(makeStep(), makeCtx());
    expect(res.ok).toBe(false);
    expect(res.recoverable).toBe(true);
  });
});
