/**
 * Pure derivations for the dashboard's Active Work table.
 *
 * The runs list (`/api/runs`) carries no step/title/actor detail, so the table
 * enriches each active run with its ordered steps (`/api/runs/:id`) and the
 * backlog item (`/api/backlog`). These helpers keep that derivation pure and
 * testable; the components just fetch and render the result.
 */
import type { Run, RunStep, BacklogItem } from './api-types.ts';

export type StepProgress = { current: number; total: number };

/**
 * Progress as "current / total" steps. The running step counts as the current
 * one (3 done + 1 running of 7 → 4/7). Returns null when the run has no steps
 * yet (e.g. queued), so the caller can render a neutral "–".
 */
export function stepProgress(steps: RunStep[]): StepProgress | null {
  const total = steps.length;
  if (total === 0) return null;
  const done = steps.filter(
    (s) => s.status === 'succeeded' || s.status === 'skipped',
  ).length;
  const running = steps.some((s) => s.status === 'running');
  const current = Math.min(total, running ? done + 1 : done);
  return { current, total };
}

/**
 * The persona actually working the run right now: the running step's persona,
 * falling back to the last completed step's persona, else null.
 */
export function currentStepPersona(steps: RunStep[]): string | null {
  const running = steps.find((s) => s.status === 'running');
  if (running) return running.persona;
  const last = steps.filter((s) => s.status === 'succeeded').at(-1);
  return last ? last.persona : null;
}

export type ActiveRunView = {
  /** Best-known actor; null → caller applies a workflow-level fallback. */
  persona: string | null;
  /** Human task title from the backlog; null → caller falls back to the workflow. */
  taskTitle: string | null;
  step: StepProgress | null;
};

/**
 * Combine a run with its steps and the backlog into a display view: the current
 * actor (step persona, else the item owner), the task title, and step progress.
 */
export function resolveActiveRun(
  run: Run,
  steps: RunStep[],
  items: BacklogItem[],
): ActiveRunView {
  const item = run.item_id
    ? items.find((i) => i.id === run.item_id) ?? null
    : null;
  return {
    persona: currentStepPersona(steps) ?? item?.owner ?? null,
    taskTitle: item?.title ?? null,
    step: stepProgress(steps),
  };
}
