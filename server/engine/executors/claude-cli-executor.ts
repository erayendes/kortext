import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { Executor, ExecutorContext, ExecutorResult } from '../executor.ts';
import type { WorkflowStep } from '../workflow-parser.ts';
import { spawnCli, tailLines } from './cli-spawn.ts';
import { readPersonaPrompt, type PersonaRegistry } from '../persona-registry.ts';

/**
 * Runs a step by shelling out to the Claude CLI in headless print mode.
 *
 * Headless contract (Faz 11.3 fix):
 *   In `claude --print` mode the CLI runs a full agent loop with tools, but
 *   only does so when the prompt is *imperative* about producing file
 *   artifacts. Without explicit "use the Write tool" wording, Claude treats
 *   the request as a chat turn and prints the deliverable to stdout instead
 *   of writing it to disk — which then fails Kortext's declared-outputs
 *   validation. The executor enforces tool use through three mechanisms:
 *     1. `--setting-sources project,local` — strips the user's global Claude
 *        Code settings so a custom output style (e.g. "explanatory") cannot
 *        rewrite the system prompt and suppress tool calls.
 *     2. `--append-system-prompt` — appends an execution contract that tells
 *        Claude its response will not be read until files are validated.
 *     3. The user prompt itself lists Outputs as commands ("Use the Write
 *        tool to create …"), not as descriptive metadata.
 *   Workflow path convention (`../workspace/foo.md`) is normalised by the
 *   parser into project-root-relative paths before reaching the executor.
 *
 * Failure modes (unchanged from earlier fazes):
 *   - exit code ≠ 0
 *   - AbortSignal fired (worker pool cancelled us)
 *   - a declared output file in `step.outputs` is missing from worktree afterwards
 */

const CLAUDE_HEADLESS_CONTRACT = [
  'You are executing one step of a Kortext v3 headless workflow run.',
  'Your text response will NOT be read by a human until after the orchestrator',
  'validates every declared Output file on disk. Files missing = step failure.',
  '',
  'Hard rules:',
  '  1. For every path in the prompt\'s "Outputs" list, call the Write tool with',
  '     that EXACT path and the deliverable body. Paths are relative to your cwd.',
  '  2. Do NOT paste the deliverable in your text answer. The Write tool call is',
  '     the only acceptable channel.',
  '  3. Read each Input file (if any) before writing Outputs.',
  '  4. After every Output is on disk, reply with ONE short confirmation line.',
  '  5. Do not ask clarifying questions — no human is present to answer.',
].join('\n');

export type ClaudeCliExecutorOptions = {
  binary: string;
  agentsDir: string;
  logsDir: string;
  /** Preferred persona source. When set, agentsDir is only a fallback. */
  personaRegistry?: PersonaRegistry;
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
    const personaBody = readPersonaPrompt(
      step.persona,
      this.opts.personaRegistry ?? { agentsDir: this.opts.agentsDir },
    );
    const prompt = buildPrompt(step, ctx, personaBody);
    const logPath = join(this.opts.logsDir, `run-${ctx.runId}-step-${ctx.runStepId}.log`);

    // claude CLI must run in non-interactive print mode for headless workflow
    // execution — without `--print` it drops into a REPL and hangs reading
    // stdin forever. `--dangerously-skip-permissions` auto-approves tool use
    // so the agent can write files without prompting +prime each time.
    // `--setting-sources project,local` strips the user's global Claude Code
    // settings (output styles, hooks, CLAUDE.md auto-loads) — without this,
    // a user-set "explanatory" output style overrides our system prompt and
    // claude returns commentary instead of using the Write tool. Project &
    // local sources stay enabled so a future workspace `.claude/settings.json`
    // can still customise behaviour.
    // `--append-system-prompt` installs the headless execution contract.
    // Callers can still append model overrides etc. via `extraArgs`.
    const args = [
      '--print',
      '--dangerously-skip-permissions',
      '--setting-sources',
      'project,local',
      '--append-system-prompt',
      CLAUDE_HEADLESS_CONTRACT,
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

function formatPathList(paths: string[]): string {
  if (paths.length === 0) return '  (none)';
  return paths.map((p) => `  - ${p}`).join('\n');
}

function buildPrompt(step: WorkflowStep, ctx: ExecutorContext, personaBody: string): string {
  return `${personaBody}

═══════════════════════════════════════════════════════════════════════
WORKFLOW STEP — autonomous, non-interactive execution
═══════════════════════════════════════════════════════════════════════

Workflow: ${ctx.workflowId}
Phase:    ${step.phase}
Persona:  ${step.persona ?? '(none)'}
CWD:      ${ctx.worktreePath}

Task:
${step.description}

Inputs (read these first if relevant):
${formatPathList(step.inputs)}

Outputs — call the Write tool ONCE per path, using these EXACT paths:
${formatPathList(step.outputs)}

═══════════════════════════════════════════════════════════════════════
Now perform the Task. For each Output path above, invoke the Write tool with
the path verbatim and the deliverable body. Do NOT paste the deliverable
content into your text reply — the orchestrator only checks the filesystem.
End with one short confirmation line.
`;
}
