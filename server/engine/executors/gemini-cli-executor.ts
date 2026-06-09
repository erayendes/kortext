import { join } from 'node:path';
import type { Executor, ExecutorContext, ExecutorResult, UsageMetadata } from '../executor.ts';
import type { WorkflowStep } from '../workflow-parser.ts';
import { buildMissingOutputResult, findMissingFileOutputs, sweepSignalMarkers } from '../output-resolver.ts';
import { buildRulesBlock, filterInjectedRuleInputs } from '../rules-injection.ts';
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
    // Rules block from the ORIGINAL inputs; the prompt's Inputs list drops the
    // already-injected rules (UAT #10 — no double-send).
    const rulesBlock = buildRulesBlock(step.inputs, this.opts.rulesDir);
    const displayStep: WorkflowStep = {
      ...step,
      inputs: filterInjectedRuleInputs(step.inputs, this.opts.rulesDir),
    };
    const prompt = buildPrompt(displayStep, ctx, personaBody, rulesBlock);
    const logPath = join(this.opts.logsDir, `run-${ctx.runId}-step-${ctx.runStepId}.log`);
    // `--output-format json` (GA since gemini-cli v0.6.0, 2025-09) makes the CLI
    // print one machine-readable envelope: {response, stats, error?} — stats
    // carries per-model token usage (UAT #10 Faz 1). Only the stdout format
    // changes; the agent loop / file writes are unaffected. NOTE: format taken
    // from the official docs + source (binary not present on the dev machine);
    // parseGeminiUsage is tolerant — anything unexpected yields usage=undefined,
    // never a failed step.
    const args = ['--output-format', 'json', ...(this.opts.extraArgs ?? [])];

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
    // Token telemetry rides on every non-killed exit (UAT #10 Faz 1).
    const usage = parseGeminiUsage(res.stdoutTail) ?? undefined;

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
        usage,
      };
    }

    // UAT #9 #7: keep the project root clean — move stray signal-marker files
    // the agent wrote (backlog-drafted, item-in-test, …) into .kortext/temp/.
    sweepSignalMarkers(step.outputs, ctx.worktreePath);

    const missing = findMissingFileOutputs(step.outputs, ctx.worktreePath);
    if (missing.length > 0) {
      return {
        ...buildMissingOutputResult({
          missing,
          kind: this.name,
          stdoutTail: res.stdoutTail,
          stderrTail: res.stderrTail,
          logPath,
          outputSummary: tail,
        }),
        usage,
      };
    }

    return { ok: true, outputSummary: tail, logPath, usage };
  }
}

type GeminiTokenStats = {
  input?: number;
  candidates?: number;
  cached?: number;
  thoughts?: number;
};

/**
 * Pull token usage out of `gemini --output-format json` stdout (UAT #10 Faz 1).
 * The CLI prints one envelope — {response, stats, error?} — where
 * `stats.models.<model>.tokens` is {input, prompt, candidates, total, cached,
 * thoughts, tool} (gemini-cli docs/cli/headless.md + telemetry source).
 *
 * Mapping to UsageMetadata: gemini's `tokens.input` is ALREADY prompt-minus-
 * cached (the claude convention) so no normalization is needed; output =
 * candidates + thoughts (both billed as output). Multiple models in one run
 * (e.g. flash routing + pro main) are summed. The per-role breakdown under
 * `roles` repeats the same token shape and is deliberately NOT counted.
 *
 * Strict JSON.parse only: a kortext step's `response` is a short confirmation
 * line (deliverables go to disk), so the envelope realistically never exceeds
 * the spawn helper's 64 KiB stdout tail. Anything unparseable → null, never a
 * failed step. Gemini reports no dollar cost — `total_cost_usd` stays unset.
 */
export function parseGeminiUsage(stdout: string): UsageMetadata | null {
  const text = stdout.trim();
  if (!text.startsWith('{')) return null;
  let envelope: { stats?: { models?: Record<string, { tokens?: GeminiTokenStats }> } };
  try {
    envelope = JSON.parse(text) as typeof envelope;
  } catch {
    return null;
  }
  const models = envelope.stats?.models;
  if (!models) return null;

  let input = 0;
  let output = 0;
  let cached = 0;
  let seen = false;
  for (const model of Object.values(models)) {
    const t = model?.tokens;
    if (!t) continue;
    seen = true;
    input += t.input ?? 0;
    output += (t.candidates ?? 0) + (t.thoughts ?? 0);
    cached += t.cached ?? 0;
  }
  if (!seen) return null;
  return {
    executor: 'gemini-cli',
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: cached,
  };
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
