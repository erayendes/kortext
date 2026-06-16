import { join } from 'node:path';
import { chmodSync, existsSync } from 'node:fs';
import { Router } from 'express';
import { defaultRegistryDir } from '../registry/projects.ts';
import { readJsonStore, writeJsonStore } from '../services/json-store.ts';
import { readSecrets, setSecret, deleteSecret, maskSecret } from '../services/secret-store.ts';

/**
 * GET /api/llm-models                       — full config (providers + assignments)
 * PUT /api/llm-models/provider/:id          — set a provider's auth method / model list
 * PUT /api/llm-models/assignment/:handle     — assign a model to a persona (or clear)
 *
 * The single source of truth for "which models exist" — hand-maintained by the
 * user (Kortext › Engine › LLM models). Each LLM provider carries an auth method
 * (CLI vs API key) and a list of model names the user typed in. The Agents pane
 * reads `assignments` to show each persona's chosen model, picked from the union
 * of these hand-entered models.
 *
 * GLOBAL to the Kortext install — not per-project. The whole catalogue (auth
 * methods, models, persona→model assignments) and the API keys live under the
 * user's `~/.kortext/` dir, shared across every project. API keys are written to
 * `llm-secrets.env` with 0600 (owner-only) perms — outside any git repo, never
 * returned raw (only `maskSecret`ed), so they cannot leak via the API or a commit.
 */

/** The fixed set of LLM providers Kortext can drive (mirrors the executor set). */
const PROVIDERS = ['claude', 'codex', 'antigravity'] as const;
type ProviderId = (typeof PROVIDERS)[number];

const AUTH_METHODS = ['cli', 'apikey'] as const;
type AuthMethod = (typeof AUTH_METHODS)[number];

/** The global env var each provider's API key is stored under (in secrets.env). */
const KEY_ENV: Record<ProviderId, string> = {
  claude: 'ANTHROPIC_API_KEY',
  codex: 'OPENAI_API_KEY',
  antigravity: 'ANTIGRAVITY_API_KEY',
};

type ProviderConfig = { authMethod: AuthMethod; models: string[] };
type LlmConfig = {
  providers: Record<ProviderId, ProviderConfig>;
  assignments: Record<string, string>; // persona handle → model name
};

function defaults(): LlmConfig {
  const providers = {} as Record<ProviderId, ProviderConfig>;
  for (const id of PROVIDERS) providers[id] = { authMethod: 'cli', models: [] };
  return { providers, assignments: {} };
}

function isProvider(id: string): id is ProviderId {
  return (PROVIDERS as readonly string[]).includes(id);
}

/** Normalise a persisted (possibly partial/legacy) blob into a full LlmConfig. */
function normalise(raw: Partial<LlmConfig> | null): LlmConfig {
  const base = defaults();
  if (!raw) return base;
  for (const id of PROVIDERS) {
    const p = raw.providers?.[id];
    if (p) {
      base.providers[id] = {
        authMethod: AUTH_METHODS.includes(p.authMethod as AuthMethod) ? (p.authMethod as AuthMethod) : 'cli',
        models: Array.isArray(p.models) ? p.models.filter((m): m is string => typeof m === 'string') : [],
      };
    }
  }
  if (raw.assignments && typeof raw.assignments === 'object') {
    for (const [handle, model] of Object.entries(raw.assignments)) {
      if (typeof model === 'string') base.assignments[handle] = model;
    }
  }
  return base;
}

export function llmModelsRouter(deps: { configDir?: string } = {}): Router {
  const r = Router();
  // Kortext-level (global), not per-project — shared across all projects.
  const configDir = deps.configDir ?? defaultRegistryDir();
  const file = join(configDir, 'llm-models.json');
  const secretsFile = join(configDir, 'llm-secrets.env');
  const read = (): LlmConfig => normalise(readJsonStore<Partial<LlmConfig> | null>(file, null));

  /** Lock the secrets file down to owner read/write (0600) after every write. */
  function lockSecrets(): void {
    if (existsSync(secretsFile)) chmodSync(secretsFile, 0o600);
  }

  /** API keys (secrets) live separately from the config: `{ id: { env, masked } }`. */
  function keysView(): Record<ProviderId, { env: string; masked: string | null }> {
    const secrets = readSecrets(secretsFile);
    const out = {} as Record<ProviderId, { env: string; masked: string | null }>;
    for (const id of PROVIDERS) {
      const v = secrets[KEY_ENV[id]];
      out[id] = { env: KEY_ENV[id], masked: typeof v === 'string' && v.length > 0 ? maskSecret(v) : null };
    }
    return out;
  }

  r.get('/llm-models', (_req, res) => {
    const cfg = read();
    res.json({ providers: cfg.providers, assignments: cfg.assignments, keys: keysView() });
  });

  // Store / clear a provider's API key (a secret — never echoed raw).
  r.put('/llm-models/provider/:id/key', (req, res) => {
    const id = req.params.id;
    if (!isProvider(id)) {
      res.status(404).json({ error: 'unknown_provider' });
      return;
    }
    const body = req.body as { key?: unknown };
    if (body.key !== undefined && body.key !== null && typeof body.key !== 'string') {
      res.status(422).json({ error: 'validation_failed', details: ['key must be a string or null'] });
      return;
    }
    const key = typeof body.key === 'string' ? body.key.trim() : '';
    if (key) setSecret(secretsFile, KEY_ENV[id], key);
    else deleteSecret(secretsFile, KEY_ENV[id]);
    lockSecrets();
    res.json({ id, env: KEY_ENV[id], masked: key ? maskSecret(key) : null });
  });

  r.put('/llm-models/provider/:id', (req, res) => {
    const id = req.params.id;
    if (!isProvider(id)) {
      res.status(404).json({ error: 'unknown_provider' });
      return;
    }
    const body = req.body as { authMethod?: unknown; models?: unknown };
    const details: string[] = [];
    if (body.authMethod !== undefined && !AUTH_METHODS.includes(body.authMethod as AuthMethod)) {
      details.push(`authMethod must be one of ${AUTH_METHODS.join(', ')}`);
    }
    if (
      body.models !== undefined &&
      (!Array.isArray(body.models) || body.models.some((m) => typeof m !== 'string'))
    ) {
      details.push('models must be an array of strings');
    }
    if (details.length > 0) {
      res.status(422).json({ error: 'validation_failed', details });
      return;
    }

    const cfg = read();
    const prev = cfg.providers[id];
    cfg.providers[id] = {
      authMethod: (body.authMethod as AuthMethod) ?? prev.authMethod,
      // De-dupe + trim, drop blanks; preserve user order otherwise.
      models:
        body.models !== undefined
          ? [...new Set((body.models as string[]).map((m) => m.trim()).filter(Boolean))]
          : prev.models,
    };
    writeJsonStore(file, cfg);
    res.json({ provider: { id, ...cfg.providers[id] } });
  });

  r.put('/llm-models/assignment/:handle', (req, res) => {
    const handle = req.params.handle;
    const body = req.body as { model?: unknown };
    if (body.model !== undefined && body.model !== null && typeof body.model !== 'string') {
      res.status(422).json({ error: 'validation_failed', details: ['model must be a string or null'] });
      return;
    }
    const cfg = read();
    const model = typeof body.model === 'string' ? body.model.trim() : '';
    if (model) cfg.assignments[handle] = model;
    else delete cfg.assignments[handle]; // null/empty clears the assignment
    writeJsonStore(file, cfg);
    res.json({ handle, model: cfg.assignments[handle] ?? null });
  });

  return r;
}
