import { Router } from 'express';
import type { Repositories } from '../db/repositories/index.ts';
import type { WorkflowRegistry } from '../engine/workflow-loader.ts';
import { readProjectMeta, triggerWorkflowIdFor, type ProjectMeta } from '../blueprint/io.ts';
import { buildSetupView, type PipelineInput, type SetupPipelineKey } from '../orchestrator/setup-view.ts';

/**
 * GET /api/setup — live state of the three initialization pipelines
 * (analysis → planning → environment) for the onboarding Setup screen.
 *
 * Fuses the workflow definitions (full step plan, incl. queued), the latest
 * run + run_steps per pipeline (live status), and open pending_questions
 * (review gates) into one shape via the pure `buildSetupView`.
 */
export function setupRouter(deps: {
  repos: Repositories;
  workflows: WorkflowRegistry;
  projectJsonPath: string;
  /** Test seam — defaults to reading project.json from disk. */
  readMeta?: (path: string) => ProjectMeta | null;
}): Router {
  const r = Router();
  const readMeta = deps.readMeta ?? readProjectMeta;

  r.get('/setup', (_req, res) => {
    const meta = readMeta(deps.projectJsonPath);
    // The analysis workflow id depends on project kind (greenfield vs existing).
    const analysisWorkflowId = meta ? triggerWorkflowIdFor(meta.type) : 'new-project-analysis';

    const specs: { key: SetupPipelineKey; title: string; workflowId: string }[] = [
      { key: 'analysis', title: 'Analysis', workflowId: analysisWorkflowId },
      { key: 'planning', title: 'Planning', workflowId: 'planning-pipeline' },
      { key: 'environment', title: 'Environment Setup', workflowId: 'environment-setup' },
    ];

    const openQuestions = deps.repos.pendingQuestions.listOpen();

    const pipelines: PipelineInput[] = specs.map((s) => {
      // listRuns is created_at DESC — [0] is the latest run for this workflow.
      const latest = deps.repos.runs.listRuns({ workflow_id: s.workflowId, limit: 1 })[0] ?? null;
      const steps = latest ? deps.repos.runs.listSteps(latest.id) : [];
      return {
        key: s.key,
        title: s.title,
        workflowId: s.workflowId,
        definition: deps.workflows.get(s.workflowId),
        run: latest ? { id: latest.id, status: latest.status } : null,
        steps,
      };
    });

    res.json(buildSetupView(pipelines, openQuestions));
  });

  return r;
}
