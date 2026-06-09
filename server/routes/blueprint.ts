import { Router } from 'express';
import {
  readBlueprintStatus,
  readProjectMeta,
  resolveBlueprintPaths,
  resolveBlueprintTarget,
  triggerWorkflowIdFor,
  writeBlueprint,
  writeProjectMeta,
  normalizeExecutor,
  type ExecutorChoice,
  type ProjectMeta,
  type ProjectType,
} from '../blueprint/io.ts';
import { pickDirectoryNative } from '../blueprint/pick-directory.ts';
import { existsSync, statSync } from 'node:fs';

export type BlueprintRouterDeps = {
  workspaceRoot: string;
  onApproved?: (workflowId: string) => Promise<void> | void;
  bootstrap?: boolean; // this daemon is the ephemeral wizard
  // Called once the wizard has handed off to the real project daemon and the
  // 201 (with handoffUrl) has been sent. The wizard uses this to schedule its
  // own shutdown so it stops holding port 3199 — see scheduleBootstrapSelfExit.
  onBootstrapHandoff?: () => void;
  createProject?: (input: {
    projectDir: string;
    meta: ProjectMeta;
    blueprintBody: string;
    port?: number;
  }) =>
    | { ok: true; handoffUrl: string; projectDir: string; gitWarning?: string }
    | { ok: false; message: string };
  // Pick a port that is BOTH registry-unclaimed AND actually free at the OS level
  // (catches foreign processes / dev servers the registry can't see). Injected so
  // it stays testable; wired in server/index.ts to findAvailablePort.
  reserveFreePort?: () => Promise<number>;
  // Confirm the freshly-spawned daemon is really serving on its port before we
  // hand the browser off — otherwise a port collision / crash strands the user on
  // "Cannot GET /". Wired in server/index.ts to waitForHealthy.
  confirmHealthy?: (url: string) => Promise<boolean>;
  // Refuse to scaffold a project into Kortext's OWN package dir (its dev/demo
  // .kortext/ would otherwise be mistaken for a user project). Wired in
  // server/index.ts to isKortextPackageDir.
  isSelfDir?: (dir: string) => boolean;
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

  r.post('/pick-directory', async (_req, res) => {
    try {
      const path = await pickDirectoryNative();
      res.json({ path });
    } catch (err) {
      res.status(500).json({
        error: 'pick_failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  r.post('/blueprint', async (req, res) => {
    const body = req.body as Partial<{
      projectName: string;
      projectCode: string;
      projectType: string;
      platforms: string[];
      blueprintBody: string;
      githubRepo: string | null;
      executor: string;
      executors: unknown;
      executorBinary: string | null;
      projectDir: string | null;
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

    const executor: ExecutorChoice = normalizeExecutor(body.executor);
    // UAT #10: optional ordered fallback chain. Validate + de-dupe each entry;
    // ensure the primary (`executor`) leads the chain. Persisted as `executors`
    // (primary first) alongside the single `executor` for back-compat. When the
    // client sends nothing meaningful, the chain is just `[executor]`.
    const executors = buildExecutorChain(body.executors, executor);
    const executorBinary: string | null =
      typeof body.executorBinary === 'string' && body.executorBinary.trim().length > 0
        ? body.executorBinary.trim()
        : null;

    const target = resolveBlueprintTarget(body.projectDir, deps.workspaceRoot);
    // In bootstrap (wizard) mode the chosen directory is materialized by
    // createProject, so it need not exist yet — skip the existence check.
    if (
      !deps.bootstrap &&
      target.isElsewhere &&
      (!existsSync(target.root) || !statSync(target.root).isDirectory())
    ) {
      errors.push('projectDir does not exist or is not a directory');
    }

    if (errors.length > 0 || projectType === null) {
      res.status(422).json({ error: 'validation_failed', details: errors });
      return;
    }

    // Single source of truth for the project metadata — shared by the bootstrap
    // (wizard) path and the in-place path below (one createdAt timestamp, no
    // field drift between the two object literals).
    const meta: ProjectMeta = {
      name: projectName,
      code: projectCode,
      type: projectType,
      platforms,
      githubRepo,
      executor,
      executors,
      executorBinary,
      createdAt: Date.now(),
    };

    // Bootstrap (wizard) mode: the directory chosen in the GUI becomes a brand
    // new project with its own daemon. Delegate the whole create-and-launch and
    // return a handoffUrl the frontend redirects to.
    if (deps.bootstrap && deps.createProject) {
      const chosen = typeof body.projectDir === 'string' ? body.projectDir.trim() : '';
      if (chosen.length === 0) {
        res.status(422).json({
          error: 'validation_failed',
          details: ['projectDir (project directory) is required'],
        });
        return;
      }
      if (deps.isSelfDir?.(chosen)) {
        res.status(422).json({
          error: 'validation_failed',
          details: [
            "That folder is Kortext's own program directory — pick a separate, empty folder for your project.",
          ],
        });
        return;
      }
      // Choose a port that is actually free (not just registry-unclaimed) so the
      // spawned daemon does not lose a race to a foreign process and EADDRINUSE.
      const port = deps.reserveFreePort ? await deps.reserveFreePort() : undefined;
      const created = deps.createProject({ projectDir: chosen, meta, blueprintBody, port });
      if (!created.ok) {
        res.status(500).json({ error: 'create_failed', message: created.message });
        return;
      }
      // Don't redirect the browser until the real daemon is confirmed serving on
      // its port — otherwise a collision/crash lands the user on "Cannot GET /".
      if (deps.confirmHealthy) {
        const healthy = await deps.confirmHealthy(created.handoffUrl);
        if (!healthy) {
          res.status(503).json({
            error: 'daemon_not_ready',
            message:
              `The project was created but its daemon did not come up at ${created.handoffUrl}. ` +
              `The port may be held by another program — free it (see 'kortext list' / 'kortext stop') and run 'kortext start' again.`,
            ...(created.gitWarning ? { gitWarning: created.gitWarning } : {}),
          });
          return;
        }
      }
      res.status(201).json({
        ok: true,
        triggerWorkflowId: triggerWorkflowIdFor(projectType),
        project: meta,
        projectDir: created.projectDir,
        initializedElsewhere: false,
        handoffUrl: created.handoffUrl,
        ...(created.gitWarning ? { gitWarning: created.gitWarning } : {}),
      });
      // Handoff done: let the ephemeral wizard daemon schedule its own exit so it
      // stops holding port 3199. Fires only after the 201 is flushed above.
      deps.onBootstrapHandoff?.();
      return;
    }

    try {
      writeBlueprint(target.paths.blueprintPath, { blueprintBody });
    } catch (err) {
      res.status(500).json({
        error: 'write_failed',
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    try {
      writeProjectMeta(target.paths.projectJsonPath, meta);
    } catch (err) {
      res.status(500).json({
        error: 'write_failed',
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const triggerWorkflowId = triggerWorkflowIdFor(projectType);
    // Only trigger when initializing the daemon's own workspace. A project
    // created elsewhere is run by that folder's own daemon when started there.
    if (!target.isElsewhere && deps.onApproved) {
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
      projectDir: target.root,
      initializedElsewhere: target.isElsewhere,
    });
  });

  return r;
}

/**
 * Build the persisted executor fallback chain from an untrusted client value
 * (UAT #10). The primary `executor` always leads; the rest are the client's
 * ordered fallbacks, validated via normalizeExecutor and de-duplicated. Unknown
 * values normalize to 'mock' — we keep that (it's a valid choice) but never let
 * a fallback duplicate an earlier entry. Returns a list with the primary first.
 */
function buildExecutorChain(raw: unknown, primary: ExecutorChoice): ExecutorChoice[] {
  const chain: ExecutorChoice[] = [primary];
  const seen = new Set<ExecutorChoice>([primary]);
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry !== 'string') continue;
      const normalized = normalizeExecutor(entry);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      chain.push(normalized);
    }
  }
  return chain;
}
