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
 * GET    /api/env          — list user env vars, masked, sorted, excluding
 *                            INTEGRATION_* keys (those belong to the
 *                            Integrations pane and share the same secrets file).
 * PUT    /api/env/:key     — add/update an env var. Rejects invalid keys and
 *                            reserved INTEGRATION_* keys with 422.
 * DELETE /api/env/:key     — remove an env var. 404 when absent.
 *
 * Backs the Environment settings pane (A6). Raw secret values are never
 * returned over the wire — only `maskSecret(value)`.
 */

const INTEGRATION_RE = /^INTEGRATION_/;

export function envVarsRouter(deps: { projectRoot: string }): Router {
  const r = Router();
  const secretsFile = projectLayout(deps.projectRoot).secretsFile;

  r.get('/env', (_req, res) => {
    const secrets = readSecrets(secretsFile);
    const vars = Object.entries(secrets)
      .filter(([key]) => !INTEGRATION_RE.test(key))
      .map(([key, value]) => ({ key, valueMasked: maskSecret(value) }))
      .sort((a, b) => a.key.localeCompare(b.key));
    res.json({ vars });
  });

  r.put('/env/:key', (req, res) => {
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

    setSecret(secretsFile, key, body.value);
    res.json({ var: { key, valueMasked: maskSecret(body.value) } });
  });

  r.delete('/env/:key', (req, res) => {
    const key = req.params.key;
    if (INTEGRATION_RE.test(key)) {
      res.status(422).json({
        error: 'validation_failed',
        details: `key '${key}' is reserved (INTEGRATION_* belongs to the Integrations pane)`,
      });
      return;
    }

    const deleted = deleteSecret(secretsFile, key);
    if (!deleted) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ deleted: true });
  });

  return r;
}
