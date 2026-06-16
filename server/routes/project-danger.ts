/**
 * Lifecycle + danger-zone operations for the CURRENT project (the one this
 * daemon serves). Four escalating levels, by blast radius:
 *
 *   POST /api/project/archive   delist only — set status 'archived', delete nothing
 *   POST /api/project/reset     clear SQLite + worktrees (keep docs/settings/code)
 *   POST /api/project/remove    delete the whole .kortext/ (keep your code) + unregister
 *   POST /api/project/delete    delete the ENTIRE project folder (incl. your code) + unregister
 *
 * Every one of these takes the daemon down (reset restarts clean, the rest stop
 * it). They are self-referential — they touch the very project this daemon
 * serves — so we respond FIRST, then self-terminate (TODO #10: never linger as
 * an orphan). The frontend gates the destructive three behind a
 * type-the-project-code confirm (delete also needs the word DELETE).
 *
 * Side effects (fs removal, registry mutation, self-exit) are injectable so a
 * unit test drives the full flow without deleting anything real.
 */
import { resolve } from 'node:path';
import { rmSync, mkdirSync } from 'node:fs';
import { Router } from 'express';
import { projectLayout } from '../paths.ts';
import {
  readRegistry,
  writeRegistry,
  listProjects,
  upsertProject,
  defaultRegistryDir,
  type ProjectEntry,
} from '../registry/projects.ts';
import { removeFromRegistry, purgeProject } from '../cli/cmd-projects.ts';

export type ProjectDangerDeps = {
  /** The project root this daemon serves (process.cwd() in production). */
  projectRoot: string;
  /** Global registry dir (defaults to ~/.kortext). Injectable for tests. */
  registryDir?: string;
  /** Remove dirs (injectable for tests). Defaults to a recursive rmSync. */
  rm?: (path: string) => void;
  /** Schedule daemon self-termination after the response flushes. */
  selfExit?: () => void;
};

export function projectDangerRouter(deps: ProjectDangerDeps): Router {
  const r = Router();
  const layout = projectLayout(deps.projectRoot);
  const rm = deps.rm ?? ((p: string) => rmSync(p, { recursive: true, force: true }));
  const selfExit = deps.selfExit ?? (() => setTimeout(() => process.exit(0), 300));

  /** The registry entry whose recorded path is this project (null if unregistered). */
  function ownEntry(): ProjectEntry | null {
    const reg = readRegistry(deps.registryDir);
    return listProjects(reg).find((p) => resolve(p.path) === layout.root) ?? null;
  }

  // Archive: non-destructive. Just delist (status → 'archived') and stop the
  // daemon; every file stays. Restoring = starting it again from the picker.
  r.post('/project/archive', (_req, res) => {
    const me = ownEntry();
    if (!me) {
      res.status(409).json({ error: 'not_registered', message: 'This project is not in the registry.' });
      return;
    }
    const reg = readRegistry(deps.registryDir);
    writeRegistry(deps.registryDir ?? defaultRegistryDir(), upsertProject(reg, { ...me, status: 'archived', pid: null }));
    res.json({ ok: true, archived: true });
    selfExit();
  });

  // Reset: drop the engine's working state (DB + worktrees) but keep the agent
  // markdown (memory/foundation/references/reports) AND settings/secrets — those
  // live beside `data`, not inside it. The daemon restarts into a clean DB.
  r.post('/project/reset', (_req, res) => {
    try {
      rm(layout.data); // kortext.db + worktrees + logs
      rm(layout.worktreesQuarantine);
      mkdirSync(layout.data, { recursive: true });
      res.json({ ok: true, restarting: true });
      selfExit();
    } catch (err) {
      res.status(500).json({ error: 'reset_failed', message: err instanceof Error ? err.message : String(err) });
    }
  });

  // Remove: delete the whole .kortext/ (db + worktrees + ALL docs + settings) and
  // unregister — but leave your project code on disk. We suppress the pid/port
  // kill (we ARE that pid) and self-exit after responding.
  r.post('/project/remove', (_req, res) => {
    const me = ownEntry();
    if (!me) {
      res.status(409).json({ error: 'not_registered', message: 'This project is not in the registry.' });
      return;
    }
    const result = purgeProject(me.slug, {
      registryDir: deps.registryDir,
      rm,
      kill: () => false,
      killPort: () => [],
    });
    if (!result.ok) {
      res.status(500).json({ error: 'remove_failed', message: result.message });
      return;
    }
    res.json({ ok: true, removed: true });
    selfExit();
  });

  // Delete: nuke the ENTIRE project folder (your code included) and unregister.
  // The strongest, irreversible action.
  r.post('/project/delete', (_req, res) => {
    const me = ownEntry();
    // Unregister first (best-effort; ok even if it was never registered), then
    // remove the whole directory tree.
    if (me) {
      removeFromRegistry(me.slug, { registryDir: deps.registryDir, kill: () => false, killPort: () => [] });
    }
    try {
      rm(layout.root);
      res.json({ ok: true, deleted: true });
      selfExit();
    } catch (err) {
      res.status(500).json({ error: 'delete_failed', message: err instanceof Error ? err.message : String(err) });
    }
  });

  return r;
}
