import { join } from 'node:path';
import { Router } from 'express';
import { projectLayout } from '../paths.ts';
import {
  readSecrets,
  setSecret,
  deleteSecret,
  maskSecret,
  isValidSecretKey,
} from '../services/secret-store.ts';

/**
 * GET    /api/env/:env          — list this environment's vars (masked secrets,
 *                                 plain public values), sorted, INTEGRATION_*
 *                                 excluded (those are project-level, env-agnostic
 *                                 and belong to the Integrations pane).
 * PUT    /api/env/:env/:key     — add/update a var in this environment.
 * DELETE /api/env/:env/:key     — remove a var from this environment. 404 absent.
 *
 * Backs the Environments settings pane (A6). Per-environment storage
 * (dev / staging / production) lives in `.kortext/env/<env>.env` — one
 * `.env` file per environment. Integration tokens stay in `.kortext/secrets.env`.
 *
 * Public vs secret: keys matching PUBLIC_RE (NEXT_PUBLIC_* / VITE_* / *PUBLIC*)
 * are non-secret identifiers (domain, app id, public keys) and their raw value
 * IS returned so the user can read it. Every other key is a secret — only
 * `maskSecret(value)` ever crosses the wire.
 */

const INTEGRATION_RE = /^INTEGRATION_/;
/** Mirrors PUBLIC_RE in src/routes/settings/environments.tsx — keep in sync. */
const PUBLIC_RE = /(^NEXT_PUBLIC_|^VITE_|PUBLIC)/;

/** The fixed set of deployment environments the pane splits variables across. */
export const ENVIRONMENTS = ['dev', 'staging', 'production'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

function isEnvironment(value: string): value is Environment {
  return (ENVIRONMENTS as readonly string[]).includes(value);
}

/** A var as the dashboard sees it: secrets masked, public values shown plain. */
function viewVar(key: string, value: string) {
  const isPublic = PUBLIC_RE.test(key);
  return {
    key,
    isPublic,
    valueMasked: maskSecret(value),
    // Raw value only for public (non-secret) keys; null for secrets.
    value: isPublic ? value : null,
  };
}

export function envVarsRouter(deps: { projectRoot: string }): Router {
  const r = Router();
  const dotKortext = projectLayout(deps.projectRoot).dotKortext;
  const envFile = (env: Environment) => join(dotKortext, 'env', `${env}.env`);

  r.get('/env/:env', (req, res) => {
    if (!isEnvironment(req.params.env)) {
      res.status(422).json({ error: 'validation_failed', details: `unknown environment '${req.params.env}'` });
      return;
    }
    const secrets = readSecrets(envFile(req.params.env));
    const vars = Object.entries(secrets)
      .filter(([key]) => !INTEGRATION_RE.test(key))
      .map(([key, value]) => viewVar(key, value))
      .sort((a, b) => a.key.localeCompare(b.key));
    res.json({ env: req.params.env, vars });
  });

  r.put('/env/:env/:key', (req, res) => {
    if (!isEnvironment(req.params.env)) {
      res.status(422).json({ error: 'validation_failed', details: `unknown environment '${req.params.env}'` });
      return;
    }
    const key = req.params.key;
    if (!isValidSecretKey(key) || INTEGRATION_RE.test(key)) {
      res.status(422).json({
        error: 'validation_failed',
        details: INTEGRATION_RE.test(key)
          ? `key '${key}' is reserved (INTEGRATION_* belongs to the Integrations pane)`
          : `invalid key '${key}': must match /^[A-Za-z_][A-Za-z0-9_]*$/`,
      });
      return;
    }

    const body = req.body as { value?: unknown };
    if (typeof body.value !== 'string') {
      res.status(422).json({
        error: 'validation_failed',
        details: 'body.value must be a string',
      });
      return;
    }

    setSecret(envFile(req.params.env), key, body.value);
    res.json({ var: viewVar(key, body.value) });
  });

  r.delete('/env/:env/:key', (req, res) => {
    if (!isEnvironment(req.params.env)) {
      res.status(422).json({ error: 'validation_failed', details: `unknown environment '${req.params.env}'` });
      return;
    }
    const key = req.params.key;
    if (INTEGRATION_RE.test(key)) {
      res.status(422).json({
        error: 'validation_failed',
        details: `key '${key}' is reserved (INTEGRATION_* belongs to the Integrations pane)`,
      });
      return;
    }

    const deleted = deleteSecret(envFile(req.params.env), key);
    if (!deleted) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ deleted: true });
  });

  return r;
}
