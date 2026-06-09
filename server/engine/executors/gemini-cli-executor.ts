import { join } from 'node:path';
import type { Executor, ExecutorContext, ExecutorResult } from '../executor.ts';
import type { WorkflowStep } from '../workflow-parser.ts';
import { buildMissingOutputResult, findMissingFileOutputs, sweepSignalMarkers } from '../output-resolver.ts';
import { buildRulesBlock } from '../rules-injection.ts';
import { isRecoverableCliFailure, spawnCli, tailLines } from './cli-spawn.ts';
import { readPersonaPrompt, type PersonaRegistry } from '../persona-registry.ts';

/**
 * Runs a step by shelling out to the Gemini CLI (Google's gemini cli).
 *
 * Mirrors ClaudeCliExecutor / CodexCliExecutor so reviewers can read the full
 * lifecycle in one place. Differences: name, default prompt preamble.
 *
 * Prompt cache discipline (Faz 12.7):
 *   Gemini CLI has no `--system-prompt` flag (full instructions land via
 *   stdin / argv prompt). Same prefix-stability discipline as the AGY and
 *   Codex executors: persona body sits at the top, per-task variable block
 *   below. Anything in the stable prefix must depend only on `step.persona`.
 */

export type GeminiCliExecutorOptions = {
  binary: string;
  agentsDir: string;
  logsDir: string;
  /** Rules dir (`rules/`). behavior.md + step-declared rules injected after the
   *  persona body (UAT #7). */
  rulesDir?: string;
  /** Preferred persona source. When set, agentsDir is only a fallback. */
  personaRegistry?: PersonaRegistry;
  extraArgs?: string[];
  summaryTailLines?: number;
  timeoutMs?: number;
  sigkillDelayMs?: number;
};

export class GeminiCliExecutor implements Executor {
  readonly name = 'gemini-cli';

  constructor(private readonly opts: GeminiCliExecutorOptions) {}

  async execute(step: WorkflowStep, ctx: ExecutorContext): Promise<ExecutorResult> {
    const personaBody = readPersonaPrompt(
      step.persona,
      this.opts.personaRegistry ?? { agentsDir: this.opts.agentsDir },
    );
    const prompt = buildPrompt(step, ctx, personaBody, buildRulesBlock(step.inputs, this.opts.rulesDir));
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
        recoverable: isRecoverableCliFailure(res),
        errorMessage: `cli exited with code ${res.exitCode}`,
        logPath,
        outputSummary: tail,
      };
    }

    // UAT #9 #7: keep the project root clean — move stray signal-marker files
    // the agent wrote (backlog-drafted, item-in-test, …) into .kortext/temp/.
    sweepSignalMarkers(step.outputs, ctx.worktreePath);

    const missing = findMissingFileOutputs(step.outputs, ctx.worktreePath);
    if (missing.length > 0) {
      return buildMissingOutputResult({
        missing,
        kind: this.name,
        stdoutTail: res.stdoutTail,
        stderrTail: res.stderrTail,
        logPath,
        outputSummary: tail,
      });
    }

    return { ok: true, outputSummary: tail, logPath };
  }
}

function buildPrompt(
  step: WorkflowStep,
  ctx: ExecutorContext,
  personaBody: string,
  rulesBlock = '',
): string {
  const inputs = step.inputs.length > 0 ? step.inputs.join(', ') : '(none)';
  const outputs = step.outputs.length > 0 ? step.outputs.join(', ') : '(none)';
  const rules = rulesBlock ? `\n\n--- Rules ---\n${rulesBlock}` : '';
  return `${personaBody}${rules}

--- Gemini Step ---
Workflow: ${ctx.workflowId}
Phase:    ${step.phase}
Persona:  ${step.persona ?? '(none)'}
Task:     ${step.description}
Inputs:   ${inputs}
Outputs:  ${outputs}
`;
}
