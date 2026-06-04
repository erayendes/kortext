import { join } from 'node:path';
import { Router } from 'express';
import { projectLayout } from '../paths.ts';
import {
  deleteSecret,
  maskSecret,
  readSecrets,
  setSecret,
} from '../services/secret-store.ts';
import { readJsonStore, writeJsonStore } from '../services/json-store.ts';

/**
 * GET    /api/integrations        — list known integrations + connected state
 * PUT    /api/integrations/:id    — store a connection token, mark connected
 * DELETE /api/integrations/:id    — drop the token, mark disconnected
 *
 * Store-only (A5): no real OAuth, no outbound API calls. The token is a SECRET
 * → it lives in `secrets.env` via secret-store and is NEVER returned raw, only
 * `maskSecret`ed. The non-secret `{ connected }` map lives in a plain JSON file
 * under `settings/integrations.json`.
 */

/** The fixed catalogue of third-party services the Integrations pane lists. */
const KNOWN_INTEGRATIONS = [
  { id: 'github', label: 'GitHub' },
  { id: 'vercel', label: 'Vercel' },
  { id: 'stripe', label: 'Stripe' },
  { id: 'auth0', label: 'Auth0' },
  { id: 'slack', label: 'Slack' },
  { id: 'telegram', label: 'Telegram' },
] as const;

type IntegrationId = (typeof KNOWN_INTEGRATIONS)[number]['id'];

type IntegrationStatus = Record<string, { connected: boolean }>;

function findKnown(id: string): { id: IntegrationId; label: string } | null {
  return KNOWN_INTEGRATIONS.find((i) => i.id === id) ?? null;
}

/** `github` → `INTEGRATION_GITHUB_TOKEN`. */
function tokenKey(id: string): string {
  return `INTEGRATION_${id.toUpperCase()}_TOKEN`;
}

export function integrationsRouter(deps: { projectRoot: string }): Router {
  const r = Router();
  const layout = projectLayout(deps.projectRoot);
  const secretsFile = layout.secretsFile;
  const statusFile = join(layout.settings, 'integrations.json');

  function view(known: { id: IntegrationId; label: string }) {
    const secrets = readSecrets(secretsFile);
    const token = secrets[tokenKey(known.id)];
    const connected = typeof token === 'string' && token.length > 0;
    return {
      id: known.id,
      label: known.label,
      connected,
      tokenMasked: connected ? maskSecret(token) : null,
    };
  }

  r.get('/integrations', (_req, res) => {
    const integrations = KNOWN_INTEGRATIONS.map((known) => view(known));
    res.json({ integrations });
  });

  r.put('/integrations/:id', (req, res) => {
    const known = findKnown(req.params.id);
    if (!known) {
      res.status(404).json({ error: 'unknown_integration' });
      return;
    }

    const body = req.body as { token?: unknown };
    const details: string[] = [];
    if (typeof body.token !== 'string' || body.token.trim().length === 0) {
      details.push('token is required and must be a non-empty string');
    }
    if (details.length > 0) {
      res.status(422).json({ error: 'validation_failed', details });
      return;
    }

    const token = (body.token as string).trim();
    setSecret(secretsFile, tokenKey(known.id), token);

    const status = readJsonStore<IntegrationStatus>(statusFile, {});
    status[known.id] = { connected: true };
    writeJsonStore(statusFile, status);

    res.json({ integration: view(known) });
  });

  r.delete('/integrations/:id', (req, res) => {
    const known = findKnown(req.params.id);
    if (!known) {
      res.status(404).json({ error: 'unknown_integration' });
      return;
    }

    deleteSecret(secretsFile, tokenKey(known.id));

    const status = readJsonStore<IntegrationStatus>(statusFile, {});
    status[known.id] = { connected: false };
    writeJsonStore(statusFile, status);

    res.json({
      integration: {
        id: known.id,
        label: known.label,
        connected: false,
        tokenMasked: null,
      },
    });
  });

  return r;
}
