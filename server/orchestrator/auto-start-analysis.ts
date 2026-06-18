import type { Repositories } from '../db/repositories/index.ts';
import {
  readBlueprintStatus, readProjectMeta, triggerWorkflowIdFor,
  type BlueprintStatus, type ProjectMeta,
} from '../blueprint/io.ts';

export type AutoStartDeps = {
  repos: Repositories;
  blueprintPath: string;
  projectJsonPath: string;
  trigger: (workflowId: string) => void;
  readStatus?: (p: string) => BlueprintStatus;
  readMeta?: (p: string) => ProjectMeta | null;
};

export type AutoStartResult = { started: boolean; reason?: string; workflowId?: string };

/**
 * On daemon boot: if this project's blueprint is approved and no analysis run
 * has ever started, kick the analysis pipeline once. Lets a project spawned by
 * the bootstrap wizard begin work without a human clicking anything. Idempotent
 * across restarts (guards on an existing run for the workflow).
 */
export function autoStartPendingAnalysis(deps: AutoStartDeps): AutoStartResult {
  const readStatus = deps.readStatus ?? readBlueprintStatus;
  const readMeta = deps.readMeta ?? readProjectMeta;

  if (readStatus(deps.blueprintPath) !== 'approved') {
    return { started: false, reason: 'not-approved' };
  }
  const meta = readMeta(deps.projectJsonPath);
  if (!meta) return { started: false, reason: 'no-meta' };

  const workflowId = triggerWorkflowIdFor(meta.type);
  // Idempotency: look at the LATEST run of this workflow (listRuns is created_at
  // DESC). Skip re-trigger when it's succeeded or still in flight. BUT if the
  // only run died — cancelled/failed, e.g. a daemon crash mid-analysis — re-fire
  // so the project recovers on restart instead of staying permanently stuck.
  const latest = deps.repos.runs.listRuns({ workflow_id: workflowId, limit: 1 })[0];
  if (latest && latest.status !== 'cancelled' && latest.status !== 'failed') {
    return { started: false, reason: 'already-ran', workflowId };
  }
  deps.trigger(workflowId);
  return { started: true, workflowId, reason: latest ? 'retried-after-failure' : undefined };
}
