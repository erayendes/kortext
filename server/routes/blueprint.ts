import { Router } from 'express';
import {
  readBlueprintStatus,
  readProjectMeta,
  resolveBlueprintPaths,
  triggerWorkflowIdFor,
  writeBlueprint,
  writeProjectMeta,
  type ProjectMeta,
  type ProjectType,
} from '../blueprint/io.ts';

export type BlueprintRouterDeps = {
  workspaceRoot: string;
  onApproved?: (workflowId: string) => Promise<void> | void;
};

/**
 * GET  /api/blueprint/status   — current frontmatter status + project meta (if any)
 * POST /api/blueprint          — accept onboarding form, write blueprint.md + project.json
 */
export function blueprintRouter(deps: BlueprintRouterDeps): Router {
  const r = Router();
  const paths = resolveBlueprintPaths(deps.workspaceRoot);

  r.get('/blueprint/status', (_req, res) => {
    const status = readBlueprintStatus(paths.blueprintPath);
    const meta = readProjectMeta(paths.projectJsonPath);
    res.json({
      status,
      blueprintPath: paths.blueprintPath,
      project: meta,
    });
  });

  r.post('/blueprint', async (req, res) => {
    const body = req.body as Partial<{
      projectName: string;
      projectCode: string;
      projectType: string;
      platforms: string[];
      blueprintBody: string;
      githubRepo: string | null;
    }>;

    const errors: string[] = [];
    const projectName = typeof body.projectName === 'string' ? body.projectName.trim() : '';
    if (projectName.length < 2 || projectName.length > 60) {
      errors.push('projectName must be 2-60 characters');
    }
    const projectCode = typeof body.projectCode === 'string' ? body.projectCode.trim().toUpperCase() : '';
    if (!/^[A-Z0-9]{2,6}$/.test(projectCode)) {
      errors.push('projectCode must match [A-Z0-9]{2,6}');
    }
    const projectType: ProjectType | null =
      body.projectType === 'new' || body.projectType === 'existing'
        ? body.projectType
        : null;
    if (projectType === null) {
      errors.push('projectType must be "new" or "existing"');
    }
    const platforms = Array.isArray(body.platforms)
      ? body.platforms.filter((p): p is string => typeof p === 'string' && p.length > 0)
      : [];
    if (platforms.length === 0) {
      errors.push('at least one platform required');
    }
    const blueprintBody = typeof body.blueprintBody === 'string' ? body.blueprintBody : '';
    if (blueprintBody.trim().length < 10) {
      errors.push('blueprintBody is empty or too short');
    }
    let githubRepo: string | null = null;
    if (typeof body.githubRepo === 'string' && body.githubRepo.trim().length > 0) {
      const trimmed = body.githubRepo.trim();
      if (!/^github\.com\/[\w.-]+\/[\w.-]+$/.test(trimmed)) {
        errors.push('githubRepo must look like github.com/org/repo');
      } else {
        githubRepo = trimmed;
      }
    }

    if (errors.length > 0 || projectType === null) {
      res.status(422).json({ error: 'validation_failed', details: errors });
      return;
    }

    try {
      writeBlueprint(paths.blueprintPath, { blueprintBody });
    } catch (err) {
      res.status(500).json({
        error: 'write_failed',
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const meta: ProjectMeta = {
      name: projectName,
      code: projectCode,
      type: projectType,
      platforms,
      githubRepo,
      createdAt: Date.now(),
    };
    try {
      writeProjectMeta(paths.projectJsonPath, meta);
    } catch (err) {
      res.status(500).json({
        error: 'write_failed',
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const triggerWorkflowId = triggerWorkflowIdFor(projectType);
    if (deps.onApproved) {
      try {
        await deps.onApproved(triggerWorkflowId);
      } catch (err) {
        res.status(500).json({
          error: 'trigger_failed',
          message: err instanceof Error ? err.message : String(err),
        });
        return;
      }
    }

    res.status(201).json({
      ok: true,
      triggerWorkflowId,
      project: meta,
    });
  });

  return r;
}
