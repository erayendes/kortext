import { writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { Router } from 'express';
import {
  parsePersonaMarkdown,
  type PersonaRegistry,
} from '../engine/persona-registry.ts';

/**
 * GET  /api/personas             — list summaries
 * GET  /api/personas/:handle     — single persona (full systemPrompt)
 * PUT  /api/personas/:handle     — replace the markdown body on disk + reload
 *
 * The Agents pane (Faz 6.5) uses GET for the library list, the detail
 * endpoint for the editor, and PUT to persist edits. Validation parses the
 * new body before writing — a broken H1 / missing description bullet is
 * rejected so the registry can never end up in an inconsistent state.
 */
export type PersonasRouterDeps = {
  personas: PersonaRegistry;
  /** Absolute path of the agents/ directory; PUT writes <id>.md here. */
  agentsDir: string;
};

const HANDLE_RE = /^\+?[\w-]+$/;
const FILENAME_RE = /^[\w-]+\.md$/;

export function personasRouter(deps: PersonasRouterDeps): Router {
  const r = Router();

  r.get('/personas', (_req, res) => {
    const personas = deps.personas.list().map((p) => ({
      handle: p.handle,
      id: p.id,
      description: p.description,
      promptLength: p.systemPrompt.length,
    }));
    const errors = deps.personas.errors();
    res.json({ personas, errors });
  });

  r.get('/personas/:handle', (req, res) => {
    const handle = req.params.handle;
    if (typeof handle !== 'string' || !HANDLE_RE.test(handle)) {
      res.status(400).json({ error: 'invalid_handle' });
      return;
    }
    const persona = deps.personas.get(handle);
    if (!persona) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ persona });
  });

  r.put('/personas/:handle', async (req, res) => {
    const handle = req.params.handle;
    if (typeof handle !== 'string' || !HANDLE_RE.test(handle)) {
      res.status(400).json({ error: 'invalid_handle' });
      return;
    }
    const existing = deps.personas.get(handle);
    if (!existing) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const body = req.body as { systemPrompt?: unknown };
    if (typeof body.systemPrompt !== 'string' || body.systemPrompt.length === 0) {
      res.status(400).json({ error: 'missing_systemPrompt' });
      return;
    }

    // Validate: parse must succeed AND yield the same handle.
    try {
      const parsed = parsePersonaMarkdown(body.systemPrompt, existing.id);
      if (parsed.handle !== existing.handle) {
        res.status(400).json({
          error: 'handle_changed',
          message: `parsed handle '${parsed.handle}' differs from URL handle '${existing.handle}'`,
        });
        return;
      }
    } catch (err) {
      res.status(400).json({
        error: 'parse_failed',
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const filename = `${existing.id}.md`;
    if (!FILENAME_RE.test(filename)) {
      res.status(400).json({ error: 'invalid_filename' });
      return;
    }
    const target = resolve(deps.agentsDir, filename);
    if (!target.startsWith(deps.agentsDir + sep)) {
      res.status(403).json({ error: 'outside_scope' });
      return;
    }

    try {
      await writeFile(target, body.systemPrompt, 'utf8');
      deps.personas.reload();
    } catch (err) {
      res.status(500).json({
        error: 'write_failed',
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const reloaded = deps.personas.get(handle);
    if (!reloaded) {
      res.status(500).json({ error: 'reload_lost_persona' });
      return;
    }
    res.json({ persona: reloaded });
  });

  return r;
}
