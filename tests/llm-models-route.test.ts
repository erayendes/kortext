import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { llmModelsRouter } from '../server/routes/llm-models.ts';

let tmpRoot: string;
let server: Server;
let baseUrl: string;

type ProviderConfig = { authMethod: string; models: string[] };
type Config = { providers: Record<string, ProviderConfig>; assignments: Record<string, string> };

async function listen(app: express.Express): Promise<Server> {
  return await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
}

async function getConfig(): Promise<Config> {
  return (await (await fetch(`${baseUrl}/api/llm-models`)).json()) as Config;
}

beforeEach(async () => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-llm-'));
  const app = express();
  app.use(express.json());
  app.use('/api', llmModelsRouter({ configDir: tmpRoot }));
  server = await listen(app);
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('GET /api/llm-models', () => {
  it('returns the three providers (CLI auth, no models) and empty assignments', async () => {
    const cfg = await getConfig();
    expect(Object.keys(cfg.providers).sort()).toEqual(['antigravity', 'claude', 'codex']);
    for (const p of Object.values(cfg.providers)) {
      expect(p.authMethod).toBe('cli');
      expect(p.models).toEqual([]);
    }
    expect(cfg.assignments).toEqual({});
  });
});

describe('PUT /api/llm-models/provider/:id', () => {
  it('sets auth method + models, de-dupes/trims, and persists', async () => {
    const res = await fetch(`${baseUrl}/api/llm-models/provider/claude`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ authMethod: 'apikey', models: ['opus', ' sonnet ', 'opus', ''] }),
    });
    expect(res.status).toBe(200);
    const cfg = await getConfig();
    expect(cfg.providers.claude).toEqual({ authMethod: 'apikey', models: ['opus', 'sonnet'] });

    const file = readFileSync(join(tmpRoot, 'llm-models.json'), 'utf8');
    expect(file).toContain('opus');
  });

  it('merges: updating models keeps the previously set auth method', async () => {
    await fetch(`${baseUrl}/api/llm-models/provider/codex`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ authMethod: 'apikey' }),
    });
    await fetch(`${baseUrl}/api/llm-models/provider/codex`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ models: ['o3', 'gpt-5-codex'] }),
    });
    const cfg = await getConfig();
    expect(cfg.providers.codex).toEqual({ authMethod: 'apikey', models: ['o3', 'gpt-5-codex'] });
  });

  it('404 for an unknown provider', async () => {
    const res = await fetch(`${baseUrl}/api/llm-models/provider/mistral`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ models: ['x'] }),
    });
    expect(res.status).toBe(404);
  });

  it('422 for a bad auth method', async () => {
    const res = await fetch(`${baseUrl}/api/llm-models/provider/claude`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ authMethod: 'oauth' }),
    });
    expect(res.status).toBe(422);
  });
});

describe('PUT /api/llm-models/provider/:id/key', () => {
  it('stores a masked API key in secrets.env and never echoes it raw', async () => {
    const raw = 'sk-ant-supersecret-9999';
    const res = await fetch(`${baseUrl}/api/llm-models/provider/claude/key`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: raw }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { env: string; masked: string };
    expect(body.env).toBe('ANTHROPIC_API_KEY');
    expect(body.masked).toBe('••••9999');
    expect(JSON.stringify(body)).not.toContain(raw);

    // Reflected (masked) in GET; raw never crosses the wire.
    const get = await fetch(`${baseUrl}/api/llm-models`);
    const text = await get.text();
    expect(text).not.toContain(raw);
    const cfg = JSON.parse(text) as { keys: Record<string, { env: string; masked: string | null }> };
    expect(cfg.keys.claude!.masked).toBe('••••9999');

    // Persisted to the global, owner-only (0600) secrets file.
    const secretsPath = join(tmpRoot, 'llm-secrets.env');
    const secrets = readFileSync(secretsPath, 'utf8');
    expect(secrets).toContain('ANTHROPIC_API_KEY=');
    expect(secrets).toContain(raw);
    expect(statSync(secretsPath).mode & 0o777).toBe(0o600);
  });

  it('clears the key with null', async () => {
    await fetch(`${baseUrl}/api/llm-models/provider/codex/key`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'sk-openai-123456' }),
    });
    const res = await fetch(`${baseUrl}/api/llm-models/provider/codex/key`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: null }),
    });
    expect(res.status).toBe(200);
    const cfg = await getConfig();
    expect((cfg as unknown as { keys: Record<string, { masked: string | null }> }).keys.codex!.masked).toBeNull();
  });
});

describe('PUT /api/llm-models/assignment/:handle', () => {
  it('assigns a model to a persona and clears it with null', async () => {
    let res = await fetch(`${baseUrl}/api/llm-models/assignment/+engineering-manager`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'opus' }),
    });
    expect(res.status).toBe(200);
    expect((await getConfig()).assignments['+engineering-manager']).toBe('opus');

    res = await fetch(`${baseUrl}/api/llm-models/assignment/+engineering-manager`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: null }),
    });
    expect(res.status).toBe(200);
    expect((await getConfig()).assignments['+engineering-manager']).toBeUndefined();
  });
});
