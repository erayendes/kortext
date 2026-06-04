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
  description: string;
  enabled: boolean;
  command: string;
};

/**
 * Canonical lifecycle events, in display order. Ids + labels + default-on
 * values mirror the Hooks pane in the v4 wireframe (the single visual spec) —
 * the dashboard sends these ids back on PUT.
 */
const HOOK_DEFS: ReadonlyArray<{
  id: string;
  description: string;
  defaultEnabled: boolean;
}> = [
  { id: 'PreToolUse', description: 'Runs before any tool call · blocks dangerous patterns', defaultEnabled: true },
  { id: 'PostToolUse', description: 'Audit logger · persists to audit.log', defaultEnabled: true },
  { id: 'UserPromptSubmit', description: 'Adds context (project, agent, date) when +prime types', defaultEnabled: true },
  { id: 'SessionStart', description: 'Loads workflow state & memory on session resume', defaultEnabled: true },
  { id: 'HandoverStart', description: 'Captures context bundle on persona handover', defaultEnabled: false },
  { id: 'BlockerDetected', description: 'Notify +prime when an agent reports it cannot proceed', defaultEnabled: false },
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
      label: def.id,
      description: def.description,
      enabled: typeof saved?.enabled === 'boolean' ? saved.enabled : def.defaultEnabled,
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
