import { join } from 'node:path';
import type { Executor, ExecutorContext, ExecutorResult, UsageMetadata } from '../executor.ts';
import type { WorkflowStep } from '../workflow-parser.ts';
import { buildMissingOutputResult, findMissingFileOutputs, sweepSignalMarkers } from '../output-resolver.ts';
import { buildRulesBlock, filterInjectedRuleInputs } from '../rules-injection.ts';
import { isRecoverableCliFailure, spawnCli, tailLines } from './cli-spawn.ts';
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
  /** Rules dir (`rules/`). behavior.md + step-declared rules are injected after
   *  the persona body (UAT #7). */
  rulesDir?: string;
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
    // Rules block from the ORIGINAL inputs; the prompt's Inputs list drops the
    // already-injected rules (UAT #10 — no double-send).
    const rulesBlock = buildRulesBlock(step.inputs, this.opts.rulesDir);
    const displayStep: WorkflowStep = {
      ...step,
      inputs: filterInjectedRuleInputs(step.inputs, this.opts.rulesDir),
    };
    const prompt = buildPrompt(displayStep, ctx, personaBody, rulesBlock);
    const logPath = join(this.opts.logsDir, `run-${ctx.runId}-step-${ctx.runStepId}.log`);
    // `exec` runs Codex NON-interactively (the bare `codex` binary drops into a
    // TUI and dies on piped stdin with "stdin is not a terminal" — UAT
    // 2026-06-08). The prompt is read from stdin (no PROMPT arg → Codex reads
    // stdin). `--sandbox workspace-write` is REQUIRED: the default read-only
    // policy can't create the declared output files. `--skip-git-repo-check`
    // lets it run in a fresh worktree that isn't its own git root.
    // `--json` streams events to stdout as JSONL; each turn's `turn.completed`
    // event carries token usage (UAT #10 Faz 1 — verified live, codex 0.137.0).
    // Only the stdout format changes — the agent loop / file writes don't.
    // Callers can still append `--model` etc. via `extraArgs`.
    const args = [
      'exec',
      '--json',
      '--sandbox',
      'workspace-write',
      '--skip-git-repo-check',
      ...(this.opts.extraArgs ?? []),
    ];

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
    // Token telemetry rides on every non-killed exit (UAT #10 Faz 1): a run
    // that failed output validation still spent tokens.
    const usage = parseCodexUsage(res.stdoutTail) ?? undefined;

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

/**
 * Pull token usage out of `codex exec --json` JSONL stdout (UAT #10 Faz 1).
 * Each turn ends with a `turn.completed` event (verified live, codex 0.137.0):
 *
 *   {"type":"turn.completed","usage":{"input_tokens":N,
 *     "cached_input_tokens":N,"output_tokens":N,"reasoning_output_tokens":N}}
 *
 * Multi-turn runs emit one per turn — sum them. JSONL is naturally robust to
 * the spawn helper's 64 KiB tail cap: only the first (possibly cut) line fails
 * to parse and is skipped; complete lines still count.
 *
 * Normalization: codex `input_tokens` INCLUDES the cached subset (OpenAI
 * convention) while UsageMetadata follows claude's convention (input = uncached
 * only, cache reads separate). We subtract so cross-executor rollups add up.
 * Codex reports no dollar cost — `total_cost_usd` stays unset.
 */
export function parseCodexUsage(stdout: string): UsageMetadata | null {
  let input = 0;
  let cached = 0;
  let output = 0;
  let seen = false;
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.includes('"turn.completed"')) continue;
    try {
      const evt = JSON.parse(trimmed) as {
        type?: string;
        usage?: { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number };
      };
      if (evt.type !== 'turn.completed' || !evt.usage) continue;
      seen = true;
      input += evt.usage.input_tokens ?? 0;
      cached += evt.usage.cached_input_tokens ?? 0;
      output += evt.usage.output_tokens ?? 0;
    } catch {
      // Cut or malformed line (tail truncation) — skip, count the rest.
    }
  }
  if (!seen) return null;
  return {
    executor: 'codex-cli',
    input_tokens: Math.max(0, input - cached),
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

--- Codex Step ---
Workflow: ${ctx.workflowId}
Phase:    ${step.phase}
Persona:  ${step.persona ?? '(none)'}
Task:     ${step.description}
Inputs:   ${inputs}
Outputs:  ${outputs}
`;
}
