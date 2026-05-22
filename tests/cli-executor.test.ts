import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeCliExecutor } from '../server/engine/executors/claude-cli-executor.ts';
import { CodexCliExecutor } from '../server/engine/executors/codex-cli-executor.ts';
import { GeminiCliExecutor } from '../server/engine/executors/gemini-cli-executor.ts';
import type { WorkflowStep } from '../server/engine/workflow-parser.ts';
import type { ExecutorContext } from '../server/engine/executor.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';

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
    description: 'write api/health endpoint',
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
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-cli-exec-'));
  workdir = join(tmpRoot, 'work');
  agentsDir = join(tmpRoot, 'agents');
  logsDir = join(tmpRoot, 'logs');
  mkdirSync(workdir, { recursive: true });
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(logsDir, { recursive: true });
  // seed a persona file
  writeFileSync(
    join(agentsDir, 'backend-developer.md'),
    '# backend-developer\n\nSen sunucu tarafı geliştiricisin.\n',
  );
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('ClaudeCliExecutor', () => {
  it('runs the configured binary and returns ok on success', async () => {
    const bin = makeMockBinary('claude-mock', `echo "hello from claude"\nexit 0`);
    const exec = new ClaudeCliExecutor({
      binary: bin,
      agentsDir,
      logsDir,
    });
    const result = await exec.execute(makeStep(), makeCtx());
    expect(result.ok).toBe(true);
    expect(result.outputSummary).toContain('hello from claude');
    expect(result.logPath).toBeTruthy();
    expect(existsSync(result.logPath!)).toBe(true);
    const logBody = readFileSync(result.logPath!, 'utf8');
    expect(logBody).toContain('hello from claude');
  });

  it('returns ok=false when the binary exits non-zero', async () => {
    const bin = makeMockBinary('claude-fail', `echo "boom"\nexit 7`);
    const exec = new ClaudeCliExecutor({ binary: bin, agentsDir, logsDir });
    const result = await exec.execute(makeStep(), makeCtx());
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toMatch(/code 7/);
  });

  it('passes persona prompt via stdin (so binary sees it)', async () => {
    // mock binary that echoes its stdin back
    const bin = makeMockBinary('claude-echo-stdin', `cat`);
    const exec = new ClaudeCliExecutor({ binary: bin, agentsDir, logsDir });
    const result = await exec.execute(makeStep(), makeCtx());
    expect(result.ok).toBe(true);
    // persona file content + step description should appear in stdout (echoed from stdin)
    expect(result.outputSummary).toContain('backend-developer');
    expect(result.outputSummary).toContain('write api/health endpoint');
  });

  it('honours AbortSignal — kills the child', async () => {
    // long-running mock binary
    const bin = makeMockBinary(
      'claude-sleep',
      `for i in $(seq 1 50); do echo "tick $i"; sleep 0.2; done`,
    );
    const exec = new ClaudeCliExecutor({
      binary: bin,
      agentsDir,
      logsDir,
      sigkillDelayMs: 200,
    });
    const ctrl = new AbortController();
    const run = exec.execute(makeStep(), makeCtx({ signal: ctrl.signal }));
    setTimeout(() => ctrl.abort(), 100);
    const result = await run;
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toMatch(/abort|kill|sig/i);
  });

  it('fails if a declared output file is not produced', async () => {
    const bin = makeMockBinary('claude-noout', `echo "did nothing"\nexit 0`);
    const exec = new ClaudeCliExecutor({ binary: bin, agentsDir, logsDir });
    const result = await exec.execute(
      makeStep({ outputs: ['reports/never-written.md'] }),
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toMatch(/output.*never-written/);
  });

  it('succeeds when declared output file IS produced inside the worktree', async () => {
    const targetRel = 'reports/done.md';
    const bin = makeMockBinary(
      'claude-makesout',
      `mkdir -p "$PWD/reports"\necho "result" > "$PWD/reports/done.md"`,
    );
    const exec = new ClaudeCliExecutor({ binary: bin, agentsDir, logsDir });
    const result = await exec.execute(
      makeStep({ outputs: [targetRel] }),
      makeCtx(),
    );
    expect(result.ok).toBe(true);
    expect(existsSync(join(workdir, targetRel))).toBe(true);
  });

  it('prefers personaRegistry over disk-direct read when both are provided', async () => {
    // Disk fixture (seeded in beforeEach) has no description bullet — not a
    // valid registry entry. We point a separate dir at a valid persona file
    // and load it into a registry. The registry version must win.
    const regDir = join(tmpRoot, 'registered-agents');
    mkdirSync(regDir, { recursive: true });
    writeFileSync(
      join(regDir, 'backend-developer.md'),
      '# backend-developer\n\n- description: registry version.\n\nFROM_REGISTRY_PROMPT\n',
    );
    const personaRegistry = loadPersonasFromDir(regDir);

    const bin = makeMockBinary('claude-echo-reg', `cat`);
    const exec = new ClaudeCliExecutor({
      binary: bin,
      agentsDir,
      logsDir,
      personaRegistry,
    });
    const result = await exec.execute(makeStep(), makeCtx());
    expect(result.ok).toBe(true);
    expect(result.outputSummary).toContain('FROM_REGISTRY_PROMPT');
  });

  it('truncates outputSummary to the last N lines', async () => {
    const bin = makeMockBinary(
      'claude-bigout',
      `for i in $(seq 1 50); do echo "line $i"; done`,
    );
    const exec = new ClaudeCliExecutor({
      binary: bin,
      agentsDir,
      logsDir,
      summaryTailLines: 5,
    });
    const result = await exec.execute(makeStep(), makeCtx());
    expect(result.ok).toBe(true);
    const lines = result.outputSummary!.split('\n').filter(Boolean);
    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines[lines.length - 1]).toBe('line 50');
  });
});

describe('CodexCliExecutor', () => {
  it('runs the configured codex binary', async () => {
    const bin = makeMockBinary('codex-mock', `echo "codex ran"`);
    const exec = new CodexCliExecutor({ binary: bin, agentsDir, logsDir });
    const result = await exec.execute(makeStep(), makeCtx());
    expect(result.ok).toBe(true);
    expect(result.outputSummary).toContain('codex ran');
    expect(exec.name).toBe('codex-cli');
  });

  it('records non-zero exit', async () => {
    const bin = makeMockBinary('codex-fail', `exit 3`);
    const exec = new CodexCliExecutor({ binary: bin, agentsDir, logsDir });
    const result = await exec.execute(makeStep(), makeCtx());
    expect(result.ok).toBe(false);
  });
});

describe('GeminiCliExecutor', () => {
  it('runs the configured gemini binary', async () => {
    const bin = makeMockBinary('gemini-mock', `echo "gemini ran"`);
    const exec = new GeminiCliExecutor({ binary: bin, agentsDir, logsDir });
    const result = await exec.execute(makeStep(), makeCtx());
    expect(result.ok).toBe(true);
    expect(result.outputSummary).toContain('gemini ran');
    expect(exec.name).toBe('gemini-cli');
  });
});
