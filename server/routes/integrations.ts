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
  { id: 'stripe', label: 'Stripe' },
  { id: 'vercel', label: 'Vercel' },
  { id: 'firebase', label: 'Firebase' },
  { id: 'supabase', label: 'Supabase' },
  { id: 'sentry', label: 'Sentry' },
] as const;

type IntegrationId = (typeof KNOWN_INTEGRATIONS)[number]['id'];

/** GitHub carries extra (non-secret) config beyond its token. */
export type GithubConfig = {
  repo: string;
  branch: string;
  autoCommit: boolean;
  prApproval: boolean;
};

const GITHUB_DEFAULTS: GithubConfig = { repo: '', branch: 'main', autoCommit: true, prApproval: false };

/** Per-integration stored state. `config` is only used by GitHub today. */
type IntegrationStatus = Record<string, { connected: boolean; config?: Partial<GithubConfig> }>;

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
    const base = {
      id: known.id,
      label: known.label,
      connected,
      tokenMasked: connected ? maskSecret(token) : null,
    };
    if (known.id === 'github') {
      const status = readJsonStore<IntegrationStatus>(statusFile, {});
      const cfg = status.github?.config ?? {};
      return { ...base, config: { ...GITHUB_DEFAULTS, ...cfg } };
    }
    return base;
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

    const body = req.body as { token?: unknown; config?: unknown };
    const hasToken = body.token !== undefined;
    const hasConfig = body.config !== undefined;
    const details: string[] = [];
    if (!hasToken && !hasConfig) {
      details.push('token or config is required');
    }
    if (hasToken && (typeof body.token !== 'string' || body.token.trim().length === 0)) {
      details.push('token must be a non-empty string');
    }
    if (hasConfig && known.id !== 'github') {
      details.push(`${known.id} does not accept config`);
    }
    if (details.length > 0) {
      res.status(422).json({ error: 'validation_failed', details });
      return;
    }

    const status = readJsonStore<IntegrationStatus>(statusFile, {});
    const prev = status[known.id] ?? { connected: false };

    if (hasToken) {
      setSecret(secretsFile, tokenKey(known.id), (body.token as string).trim());
    }
    // Merge GitHub config (repo / branch / auto-commit / PR-approval).
    let nextConfig = prev.config;
    if (hasConfig && known.id === 'github') {
      const c = body.config as Partial<GithubConfig>;
      nextConfig = {
        ...prev.config,
        ...(typeof c.repo === 'string' ? { repo: c.repo.trim() } : {}),
        ...(typeof c.branch === 'string' ? { branch: c.branch.trim() } : {}),
        ...(typeof c.autoCommit === 'boolean' ? { autoCommit: c.autoCommit } : {}),
        ...(typeof c.prApproval === 'boolean' ? { prApproval: c.prApproval } : {}),
      };
    }
    // `connected` is derived from the token at read time; persist config + a hint.
    const tokenNow = readSecrets(secretsFile)[tokenKey(known.id)];
    status[known.id] = { connected: typeof tokenNow === 'string' && tokenNow.length > 0, config: nextConfig };
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
