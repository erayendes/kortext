import { Router } from 'express';
import { join } from 'node:path';
import { readJsonStore, writeJsonStore } from '../services/json-store.ts';
import { projectLayout } from '../paths.ts';

/**
 * Lifecycle hooks settings (A4).
 *
 * The Hooks pane shows on/off toggles + an optional shell command for each
 * lifecycle event. We persist only the user's overrides (id → enabled/command)
 * in `<project>/.kortext/settings/hooks.json`; the canonical event set and its
 * human labels live here in code so adding/renaming an event is a one-liner.
 */

export type Hook = {
  id: string;
  label: string;
  enabled: boolean;
  command: string;
};

/** Canonical lifecycle events, in display order. */
const HOOK_DEFS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'on_item_created', label: 'When a backlog item is created' },
  { id: 'on_status_change', label: 'When an item changes column' },
  { id: 'on_review_requested', label: 'When an item enters review' },
  { id: 'on_gate_failed', label: 'When a test/review gate fails' },
  { id: 'on_item_done', label: 'When an item is marked done' },
  { id: 'on_handover', label: 'When a persona hands work off' },
];

const KNOWN_IDS = new Set(HOOK_DEFS.map((d) => d.id));

/** Persisted shape: only the per-hook overrides, keyed by id. */
type HookOverrides = Record<string, { enabled: boolean; command: string }>;

/** Merge saved overrides onto the canonical defaults, in canonical order. */
function mergeHooks(overrides: HookOverrides): Hook[] {
  return HOOK_DEFS.map((def) => {
    const saved = overrides[def.id];
    return {
      id: def.id,
      label: def.label,
      enabled: typeof saved?.enabled === 'boolean' ? saved.enabled : false,
      command: typeof saved?.command === 'string' ? saved.command : '',
    };
  });
}

/**
 * GET /api/hooks   — all known hooks, defaults merged with saved overrides.
 * PUT /api/hooks   — validate + persist overrides, return merged shape.
 */
export function hooksRouter(deps: { projectRoot: string }): Router {
  const r = Router();
  const hooksPath = join(projectLayout(deps.projectRoot).settings, 'hooks.json');

  r.get('/hooks', (_req, res) => {
    const overrides = readJsonStore<HookOverrides>(hooksPath, {});
    res.json({ hooks: mergeHooks(overrides) });
  });

  r.put('/hooks', (req, res) => {
    const body = req.body as Partial<{ hooks: unknown }>;
    const errors: string[] = [];

    if (!Array.isArray(body.hooks)) {
      res
        .status(422)
        .json({ error: 'validation_failed', details: ['hooks must be an array'] });
      return;
    }

    const overrides: HookOverrides = {};
    body.hooks.forEach((raw, i) => {
      const entry = raw as Partial<{ id: unknown; enabled: unknown; command: unknown }>;

      if (typeof entry.id !== 'string' || !KNOWN_IDS.has(entry.id)) {
        errors.push(`hooks[${i}].id is not a known hook event`);
        return;
      }
      if (typeof entry.enabled !== 'boolean') {
        errors.push(`hooks[${i}].enabled must be a boolean`);
        return;
      }
      if (entry.command !== undefined && typeof entry.command !== 'string') {
        errors.push(`hooks[${i}].command must be a string`);
        return;
      }

      overrides[entry.id] = {
        enabled: entry.enabled,
        command: typeof entry.command === 'string' ? entry.command : '',
      };
    });

    if (errors.length > 0) {
      res.status(422).json({ error: 'validation_failed', details: errors });
      return;
    }

    try {
      writeJsonStore<HookOverrides>(hooksPath, overrides);
    } catch (err) {
      res.status(500).json({
        error: 'write_failed',
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    res.json({ hooks: mergeHooks(overrides) });
  });

  return r;
}
