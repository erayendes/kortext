import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename, isAbsolute } from 'node:path';
import type { Executor, ExecutorContext, ExecutorResult, UsageMetadata } from '../executor.ts';
import type { WorkflowStep } from '../workflow-parser.ts';

// ponytail: a small, complete, canned backlog so a `mock` UAT produces a real
// Board in seconds (2 epics, 2 versions, assignees incl. a +prime prereq, gates,
// deps). Fixed content — mock can't show what a real LLM would write for THIS
// project; it's for fast flow/UI/engine validation only.
const FIXTURE_BACKLOG = `items:
  - id: NOT-E01
    type: epic
    title: "Offline notes core"
    version: v0.1
    assignee: +engineering-manager
    description: "The offline-first note-taking core: a local markdown editor, tagging, and instant search that work with no account and no network."
  - id: NOT-E02
    type: epic
    title: "Cloud sync"
    version: v1.0
    assignee: +engineering-manager
    description: "Optional cloud layer: sync notes across devices via an external backend, with conflict resolution and an AI summary feature."
  - id: NOT-001
    type: task
    title: "Markdown note editor"
    priority: P0
    parent_epic: NOT-E01
    version: v0.1
    assignee: +frontend-developer
    description: "Build the core editor: write notes in plain markdown, live preview, and persist them locally so they survive a reload with no network."
    acceptance_criteria: ["Notes render as markdown", "Edits persist offline"]
    review_gates: [design_review, quality_control]
    blocked_by: []
    blocks: [NOT-002]
  - id: NOT-002
    type: task
    title: "Tagging + instant search"
    priority: P1
    parent_epic: NOT-E01
    version: v0.1
    assignee: +backend-developer
    description: "Let the user organise notes with tags and find any note instantly via full-text search over the local store."
    acceptance_criteria: ["Filter by tag", "Search returns matches instantly"]
    review_gates: [quality_control]
    blocked_by: [NOT-001]
    blocks: []
  - id: NOT-003
    type: task
    title: "Set up Supabase account + API key"
    priority: P1
    parent_epic: NOT-E02
    version: v1.0
    assignee: +prime
    description: "Human prerequisite: create the Supabase project, generate the API key + connection string, and place them in .env (never committed)."
    acceptance_criteria: ["Supabase project created", "Keys placed in .env"]
    review_gates: [security_control]
    blocked_by: []
    blocks: [NOT-004]
  - id: NOT-004
    type: task
    title: "Cloud sync engine + conflict resolution"
    priority: P1
    parent_epic: NOT-E02
    version: v1.0
    assignee: +backend-developer
    description: "Sync the local notes to the cloud backend and reconcile edits made on two devices, so the same note never silently loses changes."
    acceptance_criteria: ["Notes sync across devices", "Edit conflicts resolved"]
    review_gates: [security_control, code_review]
    blocked_by: [NOT-003]
    blocks: []
`;

export type MockStepBehavior = {
  /** Delay before resolving, ms. Default 10. */
  durationMs?: number;
  /** Force failure for this step. */
  fail?: boolean;
  /** Output summary string surfaced into run_steps.output_summary. */
  summary?: string;
  /** Token/cost telemetry surfaced into run_steps.usage_metadata (UAT #10 Faz 1). */
  usage?: UsageMetadata;
};

/**
 * Deterministic executor for tests. Records the order in which steps started
 * and finished, plus their concurrent overlap, so engine tests can assert
 * that the worker pool actually parallelises.
 */
export class MockExecutor implements Executor {
  readonly name = 'mock';

  /** Order in which execute() was entered. */
  readonly startedOrder: string[] = [];
  /** Order in which execute() resolved or rejected. */
  readonly endedOrder: string[] = [];
  /** Max number of executes running simultaneously. */
  maxConcurrent = 0;

  private inFlight = 0;

  constructor(
    private readonly behavior: (step: WorkflowStep) => MockStepBehavior = () => ({}),
    /** When true, write each step's declared file outputs with fixture content so
     *  a `mock` UAT produces a real Board + readable docs. Off for engine tests. */
    private readonly writeFixtures = false,
  ) {}

  async execute(step: WorkflowStep, ctx: ExecutorContext): Promise<ExecutorResult> {
    if (ctx.signal.aborted) {
      return { ok: false, errorMessage: 'aborted before start' };
    }

    this.startedOrder.push(step.key);
    this.inFlight += 1;
    if (this.inFlight > this.maxConcurrent) this.maxConcurrent = this.inFlight;

    const cfg = this.behavior(step);
    const duration = cfg.durationMs ?? 10;

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, duration);
        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        };
        ctx.signal.addEventListener('abort', onAbort, { once: true });
      });
    } catch (e) {
      this.inFlight -= 1;
      this.endedOrder.push(step.key);
      return { ok: false, errorMessage: e instanceof Error ? e.message : String(e) };
    }

    this.inFlight -= 1;
    this.endedOrder.push(step.key);

    if (cfg.fail) {
      return { ok: false, errorMessage: cfg.summary ?? 'mock-forced-failure', usage: cfg.usage };
    }
    if (this.writeFixtures) this.writeStepFixtures(step, ctx.worktreePath);
    return { ok: true, outputSummary: cfg.summary ?? `mock:${step.key}`, usage: cfg.usage };
  }

  /** Write fixture content for each declared FILE output (skip bare signals). */
  private writeStepFixtures(step: WorkflowStep, worktreePath: string): void {
    for (const out of step.outputs) {
      if (!out.includes('/') && !out.includes('.')) continue; // signal, not a file
      const abs = isAbsolute(out) ? out : join(worktreePath, out);
      try {
        mkdirSync(dirname(abs), { recursive: true });
        const name = basename(abs);
        if (name === 'backlog.yaml') writeFileSync(abs, FIXTURE_BACKLOG);
        else if (name.endsWith('.md')) {
          writeFileSync(abs, `# ${name}\n\n_Mock fixture — ${step.persona ?? 'agent'} · ${step.phase}._\n`);
        }
        // else (.yaml patches, .env.example, …): skip — backlog.yaml is already complete
      } catch {
        // ponytail: best-effort; a write failure just means an empty doc, not a crash
      }
    }
  }
}
