import { readFileSync } from 'node:fs';
import type { GateExecutor, GateContext, GateOutcome } from '../gate-executor.ts';
import type { Executor, ExecutorContext } from '../executor.ts';
import type { WorkflowStep } from '../workflow-parser.ts';
import type { Repositories } from '../../db/repositories/index.ts';
import { readAcceptanceCriteria } from '../acceptance-criteria.ts';
import { findActualOutputFiles } from '../output-resolver.ts';
import { parseGateVerdict } from '../gate-verdict.ts';

/** The run/step/worktree the gate agent runs inside — the item's live cycle. */
export type GateRunContext = {
  runId: number;
  runStepId: number;
  worktreePath: string;
};

export type AgentGateExecutorDeps = {
  /** The agent substrate that actually runs the persona (a real CLI executor; mocked in tests). */
  executor: Executor;
  /** Resolve the run/step/worktree the gate runs in (the item's live test-cycle). */
  resolveRunContext: (ctx: GateContext) => GateRunContext;
  /** Read the item under judgment (title + acceptance criteria) and other reads. */
  repos: Repositories;
};

/**
 * Real {@link GateExecutor} (capstone C5) — the gate's judgment is delegated to an
 * actual persona agent via the injected {@link Executor} (the gate counterpart of
 * how the worker pool runs workflow steps). The engine still owns the mechanics
 * (fan-out, join fold, gate_runs); this only supplies the pass/fail verdict by
 * running the persona in the item's worktree and reading its written report.
 *
 * STRICT (#4): the persona is told the item's acceptance criteria and instructed
 * to write a machine-readable verdict report (`verdict: pass|fail` + `ac_results`)
 * to an exact output path. Merely running clean is NOT a pass — the gate reads the
 * report via {@link parseGateVerdict}. No report, a `verdict: fail`, or any unmet
 * AC → gate FAIL → the item bounces back to coding. The run/step/worktree are
 * resolved per item (injected so the slice stays self-contained).
 */
export class AgentGateExecutor implements GateExecutor {
  readonly name = 'persona-agent';

  constructor(private readonly deps: AgentGateExecutorDeps) {}

  async runGate(ctx: GateContext): Promise<GateOutcome> {
    const rc = this.deps.resolveRunContext(ctx);

    const item = this.deps.repos.backlog.get(ctx.itemId);
    const title = item?.title ?? ctx.itemId;
    const criteria = item ? readAcceptanceCriteria(item.frontmatter) : [];
    const previewUrl = item?.preview_url ?? null;

    // Patterned output path (output-resolver grammar): the executor's declared
    // output check + this gate's findActualOutputFiles both match the file the
    // agent writes, regardless of the slug/timestamp it invents.
    const declaredOutput = `.kortext/reports/${ctx.gate}-reports_<slug>_<ts>.md`;

    const acBlock =
      criteria.length > 0
        ? criteria.map((c, i) => `  ${i + 1}. ${c.text}`).join('\n')
        : '  (no acceptance criteria recorded)';

    const description = [
      `Run the ${ctx.gate} gate on item "${title}" (${ctx.itemId}, attempt ${ctx.attempt}).`,
      '',
      'Acceptance criteria:',
      acBlock,
      '',
      'Inspect the implemented code in this worktree' +
        (previewUrl ? ` (and the live preview at ${previewUrl})` : '') +
        '. Judge whether EACH acceptance criterion is met. Write your verdict to the',
      `EXACT output path below with frontmatter \`verdict: pass|fail\` and \`ac_results:\``,
      '(each entry: `text` of the criterion + `status: met|unmet`). Put human findings',
      'in the body. FAIL the gate if ANY acceptance criterion is unmet or a real issue exists.',
    ].join('\n');

    const step: WorkflowStep = {
      key: `gate:${ctx.gate}#${ctx.attempt}`,
      index: 0,
      phase: 'Gate',
      persona: ctx.persona,
      description,
      inputs: [],
      outputs: [declaredOutput],
      approver: null,
      reviewer: null,
    };

    const execCtx: ExecutorContext = {
      workflowId: `gate:${ctx.gate}`,
      runId: rc.runId,
      runStepId: rc.runStepId,
      worktreePath: rc.worktreePath,
      signal: ctx.signal ?? new AbortController().signal,
    };

    const result = await this.deps.executor.execute(step, execCtx);
    // Token/cost the gate persona spent rides on every outcome (UAT #10 Faz 1),
    // even a fail — a gate that burned tokens to reject still cost something.
    const usage = result.usage;
    if (!result.ok) {
      return { pass: false, findings: result.errorMessage ?? result.outputSummary ?? null, usage };
    }

    // Locate the report the agent wrote and read its machine-readable verdict.
    const produced = findActualOutputFiles(declaredOutput, rc.worktreePath);
    if (produced.length === 0) {
      return {
        pass: false,
        findings:
          'gate produced no verdict report — the persona must write ' +
          `${declaredOutput} with frontmatter \`verdict: pass|fail\``,
        usage,
      };
    }

    let reportText: string;
    try {
      reportText = readFileSync(produced[0]!, 'utf8');
    } catch (err) {
      return {
        pass: false,
        findings: `gate verdict report unreadable: ${err instanceof Error ? err.message : String(err)}`,
        usage,
      };
    }

    const verdict = parseGateVerdict(reportText);
    return { pass: verdict.pass, findings: verdict.findings, acResults: verdict.acResults, usage };
  }
}
