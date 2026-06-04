import { Router } from 'express';
import {
  normalizeExecutor,
  readProjectMeta,
  resolveBlueprintPaths,
  writeProjectMeta,
  type ProjectMeta,
} from '../blueprint/io.ts';

export type ProjectMetaRouterDeps = {
  workspaceRoot: string;
};

// Accept either `github.com/owner/repo` or `https://github.com/owner/repo`
// (optional trailing slash). The captured repo path is normalized down to the
// bare `github.com/owner/repo` form before persisting.
const GITHUB_REPO_RE =
  /^(?:https?:\/\/)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/;

/**
 * GET  /api/project-meta   — current project metadata (null when not onboarded)
 * PUT  /api/project-meta   — merge edits onto existing metadata and persist
 *
 * Only edits an already-onboarded project; it never creates one. `type` and
 * `createdAt` are immutable and always carried over from the existing meta.
 */
export function projectMetaRouter(deps: ProjectMetaRouterDeps): Router {
  const r = Router();
  const paths = resolveBlueprintPaths(deps.workspaceRoot);

  r.get('/project-meta', (_req, res) => {
    const meta = readProjectMeta(paths.projectJsonPath);
    res.json({ meta });
  });

  r.put('/project-meta', (req, res) => {
    const existing = readProjectMeta(paths.projectJsonPath);
    if (existing === null) {
      res.status(404).json({ error: 'no_project' });
      return;
    }

    const body = (req.body ?? {}) as Partial<{
      name: string;
      code: string;
      githubRepo: string | null;
      platforms: string[];
      executor: string;
      executorBinary: string | null;
    }>;

    const errors: string[] = [];
    const next: ProjectMeta = { ...existing };

    if ('name' in body) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        errors.push('name must be a non-empty string');
      } else {
        next.name = body.name.trim();
      }
    }

    if ('code' in body) {
      if (typeof body.code !== 'string' || body.code.trim().length === 0) {
        errors.push('code must be a non-empty string');
      } else {
        next.code = body.code.trim();
      }
    }

    if ('githubRepo' in body) {
      const raw = body.githubRepo;
      if (raw === null) {
        next.githubRepo = null;
      } else if (typeof raw === 'string') {
        const match = GITHUB_REPO_RE.exec(raw.trim());
        if (match === null) {
          errors.push('githubRepo must be null or a github.com/owner/repo URL');
        } else {
          next.githubRepo = `github.com/${match[1]}/${match[2]}`;
        }
      } else {
        errors.push('githubRepo must be null or a github.com/owner/repo URL');
      }
    }

    if ('platforms' in body) {
      if (
        !Array.isArray(body.platforms) ||
        !body.platforms.every((p) => typeof p === 'string')
      ) {
        errors.push('platforms must be an array of strings');
      } else {
        next.platforms = body.platforms;
      }
    }

    if ('executor' in body) {
      next.executor = normalizeExecutor(body.executor);
    }

    if ('executorBinary' in body) {
      const raw = body.executorBinary;
      next.executorBinary =
        typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
    }

    if (errors.length > 0) {
      res.status(422).json({ error: 'validation_failed', details: errors });
      return;
    }

    // type + createdAt are immutable; carried over via the spread above.
    next.type = existing.type;
    next.createdAt = existing.createdAt;

    try {
      writeProjectMeta(paths.projectJsonPath, next);
    } catch (err) {
      res.status(500).json({
        error: 'write_failed',
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    res.status(200).json({ meta: next });
  });

  return r;
}
