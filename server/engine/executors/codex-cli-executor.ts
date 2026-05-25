import { join } from 'node:path';
import type { Executor, ExecutorContext, ExecutorResult } from '../executor.ts';
import type { WorkflowStep } from '../workflow-parser.ts';
import { findActualOutputFiles } from '../output-resolver.ts';
import { spawnCli, tailLines } from './cli-spawn.ts';
import { readPersonaPrompt, type PersonaRegistry } from '../persona-registry.ts';

/**
 * Runs a step by shelling out to the Codex CLI (OpenAI's coding CLI).
 *
 * Behaviour matches ClaudeCliExecutor — only the binary identity and prompt
 * preamble differ. Kept as its own file so reviewers can read the full
 * lifecycle of a single executor in one place (no shared subclass).
 *
 * Prompt cache discipline (Faz 12.7):
 *   `codex exec` accepts the full instruction set on stdin and has no
 *   `--system-prompt` flag (verified via `codex exec --help` 2026-05); base
 *   instructions live in `~/.codex/config.toml`, not in argv. To still get
 *   prefix-based server-side cache reuse, we put the STABLE persona body
 *   first in stdin and the VARIABLE per-task block second. Anything added
 *   to the prefix must be a pure function of `step.persona` — no run ids,
 *   no timestamps.
 */

export type CodexCliExecutorOptions = {
  binary: string;
  agentsDir: string;
  logsDir: string;
  /** Preferred persona source. When set, agentsDir is only a fallback. */
  personaRegistry?: PersonaRegistry;
  extraArgs?: string[];
  summaryTailLines?: number;
  timeoutMs?: number;
  sigkillDelayMs?: number;
};

export class CodexCliExecutor implements Executor {
  readonly name = 'codex-cli';

  constructor(private readonly opts: CodexCliExecutorOptions) {}

  async execute(step: WorkflowStep, ctx: ExecutorContext): Promise<ExecutorResult> {
    const personaBody = readPersonaPrompt(
      step.persona,
      this.opts.personaRegistry ?? { agentsDir: this.opts.agentsDir },
    );
    const prompt = buildPrompt(step, ctx, personaBody);
    const logPath = join(this.opts.logsDir, `run-${ctx.runId}-step-${ctx.runStepId}.log`);
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

    const tail = tailLines(res.stdoutTail, this.opts.summaryTailLines ?? 20);

    if (res.aborted) return { ok: false, errorMessage: 'aborted by signal', logPath };
    if (res.exitCode === null) {
      return { ok: false, errorMessage: `killed by signal ${res.signal ?? 'unknown'}`, logPath };
    }
    if (res.exitCode !== 0) {
      return {
        ok: false,
        errorMessage: `cli exited with code ${res.exitCode}`,
        logPath,
        outputSummary: tail,
      };
    }

    const missing = step.outputs.filter(
      (rel) => findActualOutputFiles(rel, ctx.worktreePath).length === 0,
    );
    if (missing.length > 0) {
      return {
        ok: false,
        errorMessage: `declared outputs not produced: ${missing.join(', ')}`,
        logPath,
        outputSummary: tail,
      };
    }

    return { ok: true, outputSummary: tail, logPath };
  }
}

function buildPrompt(step: WorkflowStep, ctx: ExecutorContext, personaBody: string): string {
  const inputs = step.inputs.length > 0 ? step.inputs.join(', ') : '(none)';
  const outputs = step.outputs.length > 0 ? step.outputs.join(', ') : '(none)';
  return `${personaBody}

--- Codex Step ---
Workflow: ${ctx.workflowId}
Phase:    ${step.phase}
Persona:  ${step.persona ?? '(none)'}
Task:     ${step.description}
Inputs:   ${inputs}
Outputs:  ${outputs}
`;
}
