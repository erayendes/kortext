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

  it('passes the per-task user prompt via stdin', async () => {
    // mock binary that echoes its stdin back. Faz 12.7: persona body now lives
    // in --append-system-prompt; stdin carries only the per-task variable
    // payload (Task/Inputs/Outputs/Workflow/Phase).
    const bin = makeMockBinary('claude-echo-stdin', `cat`);
    const exec = new ClaudeCliExecutor({ binary: bin, agentsDir, logsDir });
    const result = await exec.execute(makeStep(), makeCtx());
    expect(result.ok).toBe(true);
    // Task description (variable per step) must appear in stdin
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
    //
    // Faz 12.7: persona body is now passed via --append-system-prompt, so we
    // observe argv (not stdin) to confirm which source won.
    const regDir = join(tmpRoot, 'registered-agents');
    mkdirSync(regDir, { recursive: true });
    writeFileSync(
      join(regDir, 'backend-developer.md'),
      '# backend-developer\n\n- description: registry version.\n\nFROM_REGISTRY_PROMPT\n',
    );
    const personaRegistry = loadPersonasFromDir(regDir);

    const argsFile = join(tmpRoot, 'persona-source-args');
    const bin = makeMockBinary('claude-echo-reg', `printf '%s\\n' "$@" > "${argsFile}"\necho ok`);
    const exec = new ClaudeCliExecutor({
      binary: bin,
      agentsDir,
      logsDir,
      personaRegistry,
    });
    const result = await exec.execute(makeStep(), makeCtx());
    expect(result.ok).toBe(true);
    const args = readFileSync(argsFile, 'utf8');
    expect(args).toContain('FROM_REGISTRY_PROMPT');
  });

  // Faz 12.7 — prompt cache activation
  //
  // Claude CLI auto-caches the system prompt when its content is stable across
  // invocations. To make the (large, ~1.2K-token) persona body cacheable, the
  // executor must pass it via `--append-system-prompt` rather than embedding it
  // in user-prompt stdin. The user prompt remains the per-task variable carrier
  // (Workflow/Phase/Task/Inputs/Outputs). The headless contract also lives in
  // the system prompt (same as before).
  //
  // Cache invalidation guard: the system-prompt content MUST NOT contain
  // per-run identifiers (runId, runStepId, timestamps). Otherwise every step
  // produces a different system prompt and we get zero cache hits.
  describe('Faz 12.7 — prompt cache', () => {
    it('passes the persona body via --append-system-prompt (cacheable), NOT stdin', async () => {
      // Mock binary writes both the args (as $@) and stdin to separate files so
      // we can inspect what landed where.
      const argsFile = join(tmpRoot, 'observed-args');
      const stdinFile = join(tmpRoot, 'observed-stdin');
      const bin = makeMockBinary(
        'claude-spy',
        `printf '%s\\n' "$@" > "${argsFile}"\ncat > "${stdinFile}"\necho ok`,
      );
      const exec = new ClaudeCliExecutor({ binary: bin, agentsDir, logsDir });
      const result = await exec.execute(makeStep(), makeCtx());
      expect(result.ok).toBe(true);

      const args = readFileSync(argsFile, 'utf8');
      const stdin = readFileSync(stdinFile, 'utf8');

      // Persona content lands in args (after --append-system-prompt), not stdin
      expect(args).toContain('--append-system-prompt');
      expect(args).toContain('backend-developer');
      expect(args).toContain('Sen sunucu tarafı geliştiricisin');
      // Stdin (user prompt) must NOT carry the persona body anymore
      expect(stdin).not.toContain('Sen sunucu tarafı geliştiricisin');
      // Stdin still carries the per-task variable parts
      expect(stdin).toContain('write api/health endpoint');
    });

    it('keeps --append-system-prompt content stable across runs (cache-friendly)', async () => {
      // Same persona + same step body → identical system prompt → cache hit.
      // The system prompt MUST NOT embed runId, runStepId, or timestamps.
      const argsFile1 = join(tmpRoot, 'args-run-1');
      const argsFile2 = join(tmpRoot, 'args-run-2');
      const bin1 = makeMockBinary(
        'claude-spy-1',
        `printf '%s\\n' "$@" > "${argsFile1}"\necho ok`,
      );
      const bin2 = makeMockBinary(
        'claude-spy-2',
        `printf '%s\\n' "$@" > "${argsFile2}"\necho ok`,
      );
      const ex1 = new ClaudeCliExecutor({ binary: bin1, agentsDir, logsDir });
      const ex2 = new ClaudeCliExecutor({ binary: bin2, agentsDir, logsDir });
      await ex1.execute(makeStep(), makeCtx({ runId: 11, runStepId: 101 }));
      await ex2.execute(makeStep(), makeCtx({ runId: 22, runStepId: 202 }));

      const extractSysPrompt = (raw: string): string => {
        // The arg list is one-per-line; --append-system-prompt is followed by
        // its value on the next line.
        const lines = raw.split('\n');
        const i = lines.findIndex((l) => l === '--append-system-prompt');
        return i >= 0 && i + 1 < lines.length ? (lines[i + 1] ?? '') : '';
      };
      const sys1 = extractSysPrompt(readFileSync(argsFile1, 'utf8'));
      const sys2 = extractSysPrompt(readFileSync(argsFile2, 'utf8'));
      expect(sys1.length).toBeGreaterThan(0);
      // No run-id / step-id leakage into the system prompt
      expect(sys1).not.toMatch(/\b(11|101)\b/);
      expect(sys2).not.toMatch(/\b(22|202)\b/);
      // Both runs use byte-identical system prompts → fully cache-eligible
      expect(sys1).toBe(sys2);
    });

    it('uses --exclude-dynamic-system-prompt-sections to widen cache reuse', async () => {
      // Per-machine sections (cwd, env info, git status) would otherwise be
      // embedded in Claude's default system prompt and bust the cache across
      // worktrees. This flag moves them into the first user message instead.
      const argsFile = join(tmpRoot, 'args');
      const bin = makeMockBinary(
        'claude-spy-excl',
        `printf '%s\\n' "$@" > "${argsFile}"\necho ok`,
      );
      const exec = new ClaudeCliExecutor({ binary: bin, agentsDir, logsDir });
      await exec.execute(makeStep(), makeCtx());
      const args = readFileSync(argsFile, 'utf8');
      expect(args).toContain('--exclude-dynamic-system-prompt-sections');
    });
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
