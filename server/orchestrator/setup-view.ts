/**
 * Setup view — the live data behind the onboarding "Setup" screen's three
 * pipelines (analysis → planning → environment). It fuses three sources into
 * one shape the frontend rail/stream render directly:
 *
 *   - the workflow DEFINITION (parsed at boot) → the full ordered step list,
 *     so queued steps appear before they ever run;
 *   - the matching RUN + its run_steps → each step's live status;
 *   - open pending_questions → which steps are waiting on +prime (a gate).
 *
 * Pure + dependency-free (takes plain inputs, no DB/registry handles) so it is
 * unit-tested in tests/setup-view.test.ts and reused by routes/setup.ts.
 */
import type { WorkflowDefinition, WorkflowStep } from '../engine/workflow-parser.ts';
import type { RunStep, RunStatus, PendingQuestion } from '../db/schemas.ts';

export type SetupStepStatus = 'queued' | 'running' | 'review' | 'done' | 'failed';
export type SetupPipelineStatus = 'queued' | 'running' | 'done' | 'failed';
export type SetupPhase = 'analysis' | 'planning' | 'environment' | 'development';
export type SetupPipelineKey = 'analysis' | 'planning' | 'environment';

export type SetupStep = {
  /** Workflow step key, e.g. 'product-analysis.2' — stable React key. */
  key: string;
  /** Phase heading the step lives under, e.g. 'Product Analysis'. */
  phase: string;
  /** Short display label (artifact filename when there is one, else step text). */
  label: string;
  persona: string | null;
  status: SetupStepStatus;
  /** Artifact awaiting review, e.g. '.kortext/references/LEGAL.md' (review steps). */
  artifactPath: string | null;
  /** Open gate question id when this step needs +prime — else null. */
  questionId: number | null;
  /** When the step started (run_step.started_at, Unix ms) — null while queued. */
  startedAt: number | null;
};

export type SetupPipeline = {
  key: SetupPipelineKey;
  workflowId: string;
  title: string;
  status: SetupPipelineStatus;
  steps: SetupStep[];
};

export type SetupView = {
  /** The pipeline currently in flight, or 'development' once all three are done. */
  phase: SetupPhase;
  pipelines: SetupPipeline[];
};

/** One pipeline's raw inputs — assembled by the route from registry + repos. */
export type PipelineInput = {
  key: SetupPipelineKey;
  title: string;
  workflowId: string;
  /** Parsed workflow def (null when the workflow isn't in the registry). */
  definition: WorkflowDefinition | null;
  /** The latest run for this workflow, or null when it hasn't started. */
  run: { id: number; status: RunStatus } | null;
  /** run_steps rows for that run (empty when no run yet). */
  steps: RunStep[];
};

const FILE_RE = /\.(md|ya?ml)$/i;

/** Last path segment, e.g. '.kortext/references/LEGAL.md' → 'LEGAL.md'. */
function filename(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/**
 * Display label for a step: prefer a produced markdown artifact's filename
 * (the analysis docs — GROWTH.md, LEGAL.md…), else the step's own text, else
 * a phase-indexed fallback. Planning/environment steps mostly patch shared
 * yaml, so they fall through to their description (the real step text).
 */
export function setupStepLabel(step: WorkflowStep): string {
  const md = step.outputs.find((o) => /\.md$/i.test(o));
  if (md) return filename(md);
  const desc = step.description.trim().replace(/\s+/g, ' ');
  if (desc) return desc.length > 40 ? `${desc.slice(0, 39).trimEnd()}…` : desc;
  const firstOut = step.outputs.find((o) => FILE_RE.test(o));
  if (firstOut) return filename(firstOut);
  return `${step.phase} ${step.index + 1}`;
}

/** Map a run_step status to a setup-step status (no gate involved). */
function fromRunStep(status: RunStep['status']): SetupStepStatus {
  switch (status) {
    case 'succeeded':
    case 'skipped':
      return 'done';
    case 'running':
      return 'running';
    case 'failed':
      return 'failed';
    case 'pending':
    default:
      return 'queued';
  }
}

/** Does this open question guard the given step (by step_id or artifact match)? */
function gateForStep(
  step: WorkflowStep,
  runStep: RunStep | undefined,
  openQuestions: PendingQuestion[],
): PendingQuestion | null {
  for (const q of openQuestions) {
    if (q.status !== 'open') continue;
    if (runStep && q.step_id === runStep.id) return q;
    if (q.artifact_path && step.outputs.some((o) => o === q.artifact_path)) return q;
  }
  return null;
}

function pipelineStatus(run: PipelineInput['run'], steps: SetupStep[]): SetupPipelineStatus {
  if (run) {
    if (run.status === 'succeeded') return 'done';
    if (run.status === 'failed' || run.status === 'cancelled') return 'failed';
  }
  if (steps.length > 0 && steps.every((s) => s.status === 'done')) return 'done';
  if (steps.some((s) => s.status === 'running' || s.status === 'review' || s.status === 'failed')) {
    return 'running';
  }
  if (run && (run.status === 'running' || run.status === 'awaiting_approval')) return 'running';
  return 'queued';
}

function buildSteps(p: PipelineInput, openQuestions: PendingQuestion[]): SetupStep[] {
  const runSucceeded = p.run?.status === 'succeeded';

  // Prefer the definition (full ordered plan incl. queued steps). Fall back to
  // run_steps when the workflow isn't in the registry, so we still show *something*.
  if (p.definition) {
    return p.definition.steps.map((step) => {
      // Match the run_step by ORDER (step_index), not name: the engine names
      // run_steps by their long description ("Product Analysis — +x: …"), which
      // never equals the workflow step `key` (`phase-slug.index`). Index is the
      // stable join — run_steps are inserted in definition order.
      const runStep = p.steps.find((s) => s.step_index === step.index);
      const gate = gateForStep(step, runStep, openQuestions);
      let status: SetupStepStatus;
      if (gate) status = 'review';
      else if (runStep) status = fromRunStep(runStep.status);
      else status = runSucceeded ? 'done' : 'queued';
      const md = step.outputs.find((o) => /\.md$/i.test(o)) ?? null;
      return {
        key: step.key,
        phase: step.phase,
        label: setupStepLabel(step),
        persona: step.persona,
        status,
        artifactPath: gate?.artifact_path ?? md,
        questionId: gate?.id ?? null,
        startedAt: runStep?.started_at ?? null,
      };
    });
  }

  return p.steps.map((rs) => {
    const gate = openQuestions.find((q) => q.status === 'open' && q.step_id === rs.id) ?? null;
    return {
      key: rs.step_name,
      phase: rs.step_name.split('.')[0] ?? '',
      label: rs.step_name,
      persona: rs.persona,
      status: gate ? 'review' : fromRunStep(rs.status),
      artifactPath: gate?.artifact_path ?? null,
      questionId: gate?.id ?? null,
      startedAt: rs.started_at ?? null,
    };
  });
}

/**
 * Build the three-pipeline setup view. `phase` is the first pipeline that
 * isn't done (the one in flight); once all three are done it's 'development'
 * (the project is ready for the dashboard / development cycle).
 */
export function buildSetupView(
  pipelines: PipelineInput[],
  openQuestions: PendingQuestion[],
): SetupView {
  const built: SetupPipeline[] = pipelines.map((p) => {
    const steps = buildSteps(p, openQuestions);
    return {
      key: p.key,
      workflowId: p.workflowId,
      title: p.title,
      status: pipelineStatus(p.run, steps),
      steps,
    };
  });

  const inFlight = built.find((p) => p.status !== 'done');
  const phase: SetupPhase = inFlight ? inFlight.key : 'development';

  return { phase, pipelines: built };
}
