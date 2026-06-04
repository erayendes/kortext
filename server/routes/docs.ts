import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { Router } from 'express';

/**
 * /api/docs/:scope        — list .md files in the scope
 * /api/docs/:scope/:file  — return raw markdown body
 *
 * Scopes are an allow-list of workspace subdirectories. The resolved
 * absolute path of the requested file is verified to live under its scope
 * root — that's the path-traversal barrier ('..' or absolute paths cannot
 * escape).
 */

const FILE_RE = /^[\w][\w.-]*\.md$/;

export type DocsRouterDeps = {
  /** Map scope name → absolute directory path. Only these scopes are reachable. */
  scopes: Record<string, string>;
};

export function docsRouter(deps: DocsRouterDeps): Router {
  const r = Router();

  r.get('/docs/:scope', async (req, res) => {
    const scope = req.params.scope;
    const root = scope ? deps.scopes[scope] : undefined;
    if (!scope || !root) {
      res.status(404).json({ error: 'unknown_scope' });
      return;
    }
    try {
      const entries = await readdir(root, { withFileTypes: true });
      const names = entries
        .filter((e) => e.isFile() && FILE_RE.test(e.name))
        .map((e) => e.name)
        .sort();
      const files = await Promise.all(
        names.map(async (name) => {
          try {
            const s = await stat(resolve(root, name));
            return { name, size: s.size, mtime: s.mtimeMs };
          } catch {
            return { name, size: 0, mtime: 0 };
          }
        }),
      );
      res.json({ scope, files });
    } catch (err) {
      // A scope dir is created lazily by the agent that first writes into it
      // (memory/reports don't exist until handover/reports are produced). Until
      // then the scope is simply empty — not an error. Mirrors the single-file
      // handler's ENOENT → not-found handling.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        res.json({ scope, files: [] });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: 'list_failed', message });
    }
  });

  r.get('/docs/:scope/:file', async (req, res) => {
    const scope = req.params.scope;
    const file = req.params.file;
    const root = scope ? deps.scopes[scope] : undefined;
    if (!scope || !root) {
      res.status(404).json({ error: 'unknown_scope' });
      return;
    }
    if (!file || !FILE_RE.test(file)) {
      res.status(400).json({ error: 'invalid_filename' });
      return;
    }
    const target = resolve(root, file);
    // Path-traversal barrier: the resolved file must live directly under root.
    if (!target.startsWith(root + sep)) {
      res.status(403).json({ error: 'outside_scope' });
      return;
    }
    try {
      const body = await readFile(target, 'utf8');
      res.json({ scope, file, body });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: 'read_failed', message });
    }
  });

  return r;
}
