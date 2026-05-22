import { Router } from 'express';
import type { Repositories } from '../db/repositories/index.ts';
import type { WorkflowRegistry } from '../engine/workflow-loader.ts';
import type { PersonaRegistry } from '../engine/persona-registry.ts';
import { runDoctor } from '../cli/doctor.ts';

/**
 * GET /api/doctor — same report shape as `kortext doctor`. Drives the
 * dashboard health badge + Faz 6.6 toast for new errors.
 */
export function doctorRouter(deps: {
  repos: Repositories;
  workflows: WorkflowRegistry;
  personas: PersonaRegistry;
}): Router {
  const r = Router();

  r.get('/doctor', (_req, res) => {
    const report = runDoctor({
      repos: deps.repos,
      workflows: deps.workflows,
      personas: deps.personas,
    });
    res.json(report);
  });

  return r;
}
