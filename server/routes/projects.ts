import { Router } from 'express';
import { listProjects, type Registry, type ProjectStatus } from '../registry/projects.ts';

/**
 * GET  /api/projects             — list registered projects (for the wizard)
 * POST /api/projects/:slug/start — start a project's daemon, return its handoff URL
 *
 * GUI-first (UAT #10): a bare `kortext start` opens the wizard even when
 * projects already exist. The wizard lists those projects (this route) so the
 * user can pick one — selecting it starts that project's daemon and the browser
 * hands off to it — or continue into onboarding for a new project. The wizard
 * is the ephemeral bootstrap daemon; after a handoff it schedules its own
 * shutdown (onHandoff) so it stops holding the bootstrap port.
 */

export type ProjectSummary = {
  slug: string;
  name: string;
  path: string;
  port: number;
  status: ProjectStatus;
  /** The local dashboard URL the browser hands off to. */
  url: string;
};

/** Map the registry into the wizard's list shape, sorted by display name. */
export function serializeProjects(registry: Registry): ProjectSummary[] {
  return listProjects(registry)
    .map((p) => ({
      slug: p.slug,
      name: p.name || p.slug,
      path: p.path,
      port: p.port,
      status: p.status,
      url: `http://localhost:${p.port}/`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type ProjectsRouterDeps = {
  /** Read the global registry. Wired to readRegistry(defaultRegistryDir()). */
  readRegistry: () => Registry;
  /** Start (or reuse) a project's daemon by slug. Wired to startProject. */
  startProject: (slug: string) => { ok: true; url: string } | { ok: false; message: string };
  /** Called after a successful handoff so the bootstrap wizard can self-exit. */
  onHandoff?: () => void;
};

export function projectsRouter(deps: ProjectsRouterDeps): Router {
  const r = Router();

  r.get('/projects', (_req, res) => {
    res.json({ projects: serializeProjects(deps.readRegistry()) });
  });

  r.post('/projects/:slug/start', (req, res) => {
    const slug = req.params.slug;
    if (typeof slug !== 'string' || slug.length === 0) {
      res.status(400).json({ ok: false, error: 'invalid_slug' });
      return;
    }
    const known = serializeProjects(deps.readRegistry()).some((p) => p.slug === slug);
    if (!known) {
      res.status(404).json({ ok: false, error: 'not_found', message: `No project '${slug}'.` });
      return;
    }

    const result = deps.startProject(slug);
    if (!result.ok) {
      res.status(502).json({ ok: false, error: 'start_failed', message: result.message });
      return;
    }

    // Handed off — let the wizard schedule its own shutdown.
    deps.onHandoff?.();
    res.json({ ok: true, handoffUrl: result.url });
  });

  return r;
}
