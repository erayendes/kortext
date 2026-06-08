import { join } from 'node:path';
import type { Executor, ExecutorContext, ExecutorResult } from '../executor.ts';
import type { WorkflowStep } from '../workflow-parser.ts';
import { findMissingFileOutputs } from '../output-resolver.ts';
import { buildRulesBlock } from '../rules-injection.ts';
import { spawnCli, tailLines } from './cli-spawn.ts';
import { readPersonaPrompt, type PersonaRegistry } from '../persona-registry.ts';

/**
 * Runs a step by shelling out to the Antigravity CLI (`agy`).
 *
 * Antigravity is the successor to Gemini CLI (Google IO 2026). Invoked as
 * `agy -p --dangerously-skip-permissions` for autonomous, single-prompt runs.
 *
 *   -p / --print                 — non-interactive, single-prompt mode
 *   --dangerously-skip-permissions — auto-approve tool calls (required for
 *                                    headless agent runs)
 *   --print-timeout              — defaults to 5m; we extend to 10m for
 *                                    long-running persona work
 *
 * Headless tool-use contract (Faz 11.3 fix):
 *   Like claude --print, `agy -p` only reliably calls Write/Edit tools when
 *   the prompt is imperative ("use the Write tool to create file X") rather
 *   than descriptive ("Outputs: file X"). The contract lives in the prompt
 *   body — we deliberately avoid passing CLI flags Antigravity may not
 *   recognise yet (e.g. an --append-system-prompt analogue) and instead
 *   bake the instructions into stdin where every CLI reads them.
 *
 * Prompt cache discipline (Faz 12.7):
 *   AGY does not expose a `--system-prompt` flag (`agy --help` 2026-05), so
 *   we cannot route the persona body through a dedicated cacheable channel
 *   the way ClaudeCliExecutor does. We still get *some* server-side cache
 *   reuse if the leading bytes of stdin are byte-identical across runs —
 *   most LLM providers cache on a stable prefix. To exploit that, we
 *   emit the prompt in a strict order: STABLE PREFIX first (persona body +
 *   headless contract; depends only on `step.persona`), then VARIABLE TAIL
 *   (workflow/phase/task/inputs/outputs/cwd). Anything you add to the
 *   prefix MUST be a pure function of `step.persona` — no run ids, no
 *   timestamps — or the cache will miss every step.
 */

const AGY_HEADLESS_CONTRACT = [
  '═══════════════════════════════════════════════════════════════════════',
  'KORTEXT v3 HEADLESS EXECUTION CONTRACT',
  '═══════════════════════════════════════════════════════════════════════',
  'You are executing one step of a non-interactive workflow run.',
  'Your text response is NOT shown to a human until after the orchestrator',
  'validates every declared Output file on disk. Missing files = step failed.',
  '',
  'Hard rules:',
  '  1. For every path in the "Outputs" list below, call your write/file tool',
  '     with that EXACT path and the deliverable body. Paths are relative to',
  '     your current working directory.',
  '  2. Do NOT paste the deliverable in your text answer. The file tool call',
  '     is the only acceptable channel.',
  '  3. Read each Input file (if any) before writing Outputs.',
  '  4. After every Output is on disk, reply with ONE short confirmation line.',
  '  5. Do not ask clarifying questions — no human is present to answer.',
  '═══════════════════════════════════════════════════════════════════════',
].join('\n');

export type AntigravityCliExecutorOptions = {
  binary: string;
  agentsDir: string;
  logsDir: string;
  /** Rules dir (`rules/`). behavior.md + step-declared rules injected after the
   *  persona body (UAT #7). */
  rulesDir?: string;
  /** Preferred persona source. When set, agentsDir is only a fallback. */
  personaRegistry?: PersonaRegistry;
  /** Extra args appended after the defaults. Useful for `--add-dir` etc. */
  extraArgs?: string[];
  /** Tail of stdout used as outputSummary. Default 20 lines. */
  summaryTailLines?: number;
  /** Soft timeout. Default unset (worker pool's abort is authoritative). */
  timeoutMs?: number;
  /** Override SIGKILL grace period. Default 5s. */
  sigkillDelayMs?: number;
};

export class AntigravityCliExecutor implements Executor {
  readonly name = 'antigravity-cli';

  constructor(private readonly opts: AntigravityCliExecutorOptions) {}

  async execute(step: WorkflowStep, ctx: ExecutorContext): Promise<ExecutorResult> {
    const personaBody = readPersonaPrompt(
      step.persona,
      this.opts.personaRegistry ?? { agentsDir: this.opts.agentsDir },
    );
    const prompt = buildPrompt(step, ctx, personaBody, buildRulesBlock(step.inputs, this.opts.rulesDir));
    const logPath = join(this.opts.logsDir, `run-${ctx.runId}-step-${ctx.runStepId}.log`);

    // Headless agent defaults. `-p` for non-interactive print mode,
    // `--dangerously-skip-permissions` to auto-approve tool use (required for
    // unattended workflow runs), `--print-timeout=10m` extends the default 5m
    // for longer persona work. Callers can override via `extraArgs` to set
    // `--add-dir` for additional context paths.
    const args = [
      '-p',
      '--dangerously-skip-permissions',
      '--print-timeout',
      '10m',
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

    const missing = findMissingFileOutputs(step.outputs, ctx.worktreePath);
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

function formatPathList(paths: string[]): string {
  if (paths.length === 0) return '  (none)';
  return paths.map((p) => `  - ${p}`).join('\n');
}

function buildPrompt(
  step: WorkflowStep,
  ctx: ExecutorContext,
  personaBody: string,
  rulesBlock = '',
): string {
  const rules = rulesBlock ? `\n\n--- Rules ---\n${rulesBlock}` : '';
  return `${personaBody}${rules}

${AGY_HEADLESS_CONTRACT}

Workflow: ${ctx.workflowId}
Phase:    ${step.phase}
Persona:  ${step.persona ?? '(none)'}
CWD:      ${ctx.worktreePath}

Task:
${step.description}

Inputs (read first if relevant):
${formatPathList(step.inputs)}

Outputs — call your write tool ONCE per path, using these EXACT paths:
${formatPathList(step.outputs)}

Now perform the Task. For each Output path, invoke your write/edit tool with
the path verbatim and the deliverable body. End with one short confirmation
line.
`;
}
