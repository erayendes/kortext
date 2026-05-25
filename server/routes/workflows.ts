import { Router } from 'express';
import type { WorkflowRegistry } from '../engine/workflow-loader.ts';
import type { Repositories } from '../db/repositories/index.ts';

/**
 * GET /api/workflows                       — list (id, title, step count, gate count)
 * GET /api/workflows/:id                   — single workflow definition (steps + gates)
 * GET /api/workflows/:id/dependencies      — Faz 12.8 cross-cut: distinct inputs/outputs
 *
 * Faz 6.5 Workflows pane consumes the list endpoint; the detail endpoint
 * feeds the DAG visualisation drawer. The dependencies endpoint answers
 * "what references does this workflow read/write?" — built from the
 * SQL index, not the registry, so it's a single grouped read.
 */
export function workflowsRouter(deps: {
  workflows: WorkflowRegistry;
  /** Optional — when provided, exposes the Faz 12.8 dependencies endpoint. */
  repos?: Repositories;
}): Router {
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

  r.get('/workflows/:id/dependencies', (req, res) => {
    if (!deps.repos) {
      res.status(503).json({ error: 'sql_index_unavailable' });
      return;
    }
    const id = req.params.id;
    if (typeof id !== 'string' || id.length === 0) {
      res.status(400).json({ error: 'invalid_id' });
      return;
    }
    // 404 when the workflow isn't known at all — guards against a stale
    // dashboard link querying a removed workflow.
    if (!deps.workflows.get(id)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const deps_ = deps.repos.workflowSteps.dependencies(id);
    res.json({ workflow_id: id, ...deps_ });
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
