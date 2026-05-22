import { Router } from 'express';
import type { WorkflowRegistry } from '../engine/workflow-loader.ts';

/**
 * GET /api/workflows         — list (id, title, step count, gate count)
 * GET /api/workflows/:id     — single workflow definition (steps + gates)
 *
 * Faz 6.5 Workflows pane consumes the list endpoint; the detail endpoint
 * feeds the DAG visualisation drawer.
 */
export function workflowsRouter(deps: { workflows: WorkflowRegistry }): Router {
  const r = Router();

  r.get('/workflows', (_req, res) => {
    const workflows = deps.workflows.list().map((w) => ({
      id: w.id,
      title: w.title,
      startCommand: w.startCommand,
      nextWorkflowId: w.nextWorkflowId,
      stepCount: w.steps.length,
      gateCount: w.gates.length,
    }));
    const errors = deps.workflows.errors();
    res.json({ workflows, errors });
  });

  r.get('/workflows/:id', (req, res) => {
    const id = req.params.id;
    if (typeof id !== 'string' || id.length === 0) {
      res.status(400).json({ error: 'invalid_id' });
      return;
    }
    const workflow = deps.workflows.get(id);
    if (!workflow) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ workflow });
  });

  return r;
}
