import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { Executor, ExecutorContext, ExecutorResult } from '../executor.ts';
import type { WorkflowStep } from '../workflow-parser.ts';
import { spawnCli, tailLines } from './cli-spawn.ts';

/**
 * Runs a step by shelling out to the Claude CLI.
 *
 * Inputs:
 *   - binary:   path to the claude executable (configurable; tests pass a mock script).
 *   - agentsDir: directory containing `[handle].md` persona files.
 *   - logsDir:  where step log files are written.
 *
 * Prompt assembly (passed via stdin so we never put untrusted text in argv):
 *   <persona markdown>
 *
 *   --- Step ---
 *   Workflow: <id>
 *   Phase:    <phase>
 *   Persona:  <persona>
 *   Task:     <description>
 *   Inputs:   <comma list>
 *   Outputs:  <comma list>
 *
 * Failure modes:
 *   - exit code ≠ 0
 *   - AbortSignal fired (worker pool cancelled us)
 *   - a declared output file in `step.outputs` is missing from worktree afterwards
 */

export type ClaudeCliExecutorOptions = {
  binary: string;
  agentsDir: string;
  logsDir: string;
  /** Extra args appended after the default ones. Useful for `--model` etc. */
  extraArgs?: string[];
  /** Tail of stdout used as outputSummary. Default 20 lines. */
  summaryTailLines?: number;
  /** Soft timeout. Default unset (worker pool's abort is authoritative). */
  timeoutMs?: number;
  /** Override SIGKILL grace period. Default 5s. */
  sigkillDelayMs?: number;
};

export class ClaudeCliExecutor implements Executor {
  readonly name = 'claude-cli';

  constructor(private readonly opts: ClaudeCliExecutorOptions) {}

  async execute(step: WorkflowStep, ctx: ExecutorContext): Promise<ExecutorResult> {
    const prompt = buildPrompt(step, ctx, this.opts.agentsDir);
    const logPath = join(this.opts.logsDir, `run-${ctx.runId}-step-${ctx.runStepId}.log`);

    // claude CLI default args — kept minimal so behaviour is predictable in tests.
    // Real prod call sites can pass `--print --output-format=json` via extraArgs.
    const args = [...(this.opts.extraArgs ?? [])];

    const res = await spawnCli({
      binary: this.opts.binary,
      args,
      cwd: ctx.worktreePath,
      stdin: prompt,
      logPath,
      signal: ctx.signal,
      sigkillDelayMs: this.opts.sigkillDelayMs,
      timeoutMs: this.opts.timeoutMs,
    });

    if (res.aborted) {
      return {
        ok: false,
        errorMessage: 'aborted by signal',
        logPath,
      };
    }

    if (res.exitCode === null) {
      return {
        ok: false,
        errorMessage: `killed by signal ${res.signal ?? 'unknown'}`,
        logPath,
      };
    }

    if (res.exitCode !== 0) {
      return {
        ok: false,
        errorMessage: `cli exited with code ${res.exitCode}`,
        logPath,
        outputSummary: tailLines(res.stdoutTail, this.opts.summaryTailLines ?? 20),
      };
    }

    const missing = step.outputs.filter((rel) => {
      const p = isAbsolute(rel) ? rel : join(ctx.worktreePath, rel);
      return !existsSync(p);
    });
    if (missing.length > 0) {
      return {
        ok: false,
        errorMessage: `declared outputs not produced: ${missing.join(', ')}`,
        logPath,
        outputSummary: tailLines(res.stdoutTail, this.opts.summaryTailLines ?? 20),
      };
    }

    return {
      ok: true,
      outputSummary: tailLines(res.stdoutTail, this.opts.summaryTailLines ?? 20),
      logPath,
    };
  }
}

function buildPrompt(step: WorkflowStep, ctx: ExecutorContext, agentsDir: string): string {
  const personaBody = readPersona(step.persona, agentsDir);
  const inputs = step.inputs.length > 0 ? step.inputs.join(', ') : '(none)';
  const outputs = step.outputs.length > 0 ? step.outputs.join(', ') : '(none)';
  return `${personaBody}

--- Step ---
Workflow: ${ctx.workflowId}
Phase:    ${step.phase}
Persona:  ${step.persona ?? '(none)'}
Task:     ${step.description}
Inputs:   ${inputs}
Outputs:  ${outputs}
`;
}

function readPersona(persona: string | null, agentsDir: string): string {
  if (!persona) return '';
  const handle = persona.replace(/^\+/, '');
  const path = join(agentsDir, `${handle}.md`);
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}
