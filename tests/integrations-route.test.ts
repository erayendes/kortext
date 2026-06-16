import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { integrationsRouter } from '../server/routes/integrations.ts';

let tmpRoot: string;
let server: Server;
let baseUrl: string;

type Integration = {
  id: string;
  label: string;
  connected: boolean;
  tokenMasked: string | null;
};

const KNOWN_IDS = ['github', 'stripe', 'vercel', 'firebase', 'supabase', 'sentry'];

async function listen(app: express.Express): Promise<Server> {
  return await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
}

beforeEach(async () => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-integrations-'));
  const app = express();
  app.use(express.json());
  app.use('/api', integrationsRouter({ projectRoot: tmpRoot }));
  server = await listen(app);
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://localhost:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('GET /api/integrations', () => {
  it('lists all 6 known integrations, disconnected initially, in order', async () => {
    const res = await fetch(`${baseUrl}/api/integrations`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { integrations: Integration[] };
    expect(body.integrations.map((i) => i.id)).toEqual(KNOWN_IDS);
    for (const i of body.integrations) {
      expect(i.connected).toBe(false);
      expect(i.tokenMasked).toBeNull();
      expect(typeof i.label).toBe('string');
    }
  });
});

describe('PUT /api/integrations/:id', () => {
  it('connects github: masked token shows last 4, connected true', async () => {
    const res = await fetch(`${baseUrl}/api/integrations/github`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'ghp_secret_TOKEN_1234' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { integration: Integration };
    expect(body.integration.id).toBe('github');
    expect(body.integration.connected).toBe(true);
    expect(body.integration.tokenMasked).toBe('••••1234');
    // raw token must never appear in the response
    expect(JSON.stringify(body)).not.toContain('ghp_secret_TOKEN_1234');
  });

  it('GET reflects connected + masked, and raw token is not in any response', async () => {
    const raw = 'ghp_secret_TOKEN_1234';
    await fetch(`${baseUrl}/api/integrations/github`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: raw }),
    });

    const res = await fetch(`${baseUrl}/api/integrations`);
    const text = await res.text();
    expect(text).not.toContain(raw);
    const body = JSON.parse(text) as { integrations: Integration[] };
    const gh = body.integrations.find((i) => i.id === 'github')!;
    expect(gh.connected).toBe(true);
    expect(gh.tokenMasked).toBe('••••1234');
    // others remain disconnected
    const vercel = body.integrations.find((i) => i.id === 'vercel')!;
    expect(vercel.connected).toBe(false);
    expect(vercel.tokenMasked).toBeNull();
  });

  it('persists the raw token into .kortext/secrets.env under the right key', async () => {
    const raw = 'ghp_secret_TOKEN_1234';
    await fetch(`${baseUrl}/api/integrations/github`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: raw }),
    });
    const secretsPath = join(tmpRoot, '.kortext', 'secrets.env');
    const contents = readFileSync(secretsPath, 'utf8');
    expect(contents).toContain('INTEGRATION_GITHUB_TOKEN=');
    expect(contents).toContain(raw);
  });

  it('returns 404 for an unknown integration id', async () => {
    const res = await fetch(`${baseUrl}/api/integrations/notreal`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'x' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unknown_integration');
  });

  it('returns 422 when token is missing/empty', async () => {
    const res = await fetch(`${baseUrl}/api/integrations/github`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: '   ' }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; details: string[] };
    expect(body.error).toBe('validation_failed');
    expect(body.details.length).toBeGreaterThan(0);
  });

  it('GitHub: persists config (repo/branch/auto-commit/PR-approval) and merges partials', async () => {
    type WithConfig = Integration & { config: { repo: string; branch: string; autoCommit: boolean; prApproval: boolean } };
    // full config in one PUT
    let res = await fetch(`${baseUrl}/api/integrations/github`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ config: { repo: 'acme/app', branch: 'dev', autoCommit: false, prApproval: true } }),
    });
    expect(res.status).toBe(200);
    let cfg = ((await res.json()) as { integration: WithConfig }).integration.config;
    expect(cfg).toEqual({ repo: 'acme/app', branch: 'dev', autoCommit: false, prApproval: true });
    // partial PUT merges (only repo changes; the rest stay)
    res = await fetch(`${baseUrl}/api/integrations/github`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ config: { repo: 'acme/renamed' } }),
    });
    cfg = ((await res.json()) as { integration: WithConfig }).integration.config;
    expect(cfg).toEqual({ repo: 'acme/renamed', branch: 'dev', autoCommit: false, prApproval: true });
  });

  it('rejects config on a non-github integration with 422', async () => {
    const res = await fetch(`${baseUrl}/api/integrations/stripe`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ config: { repo: 'x/y' } }),
    });
    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/integrations/:id', () => {
  it('disconnects a connected integration', async () => {
    await fetch(`${baseUrl}/api/integrations/github`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'ghp_secret_TOKEN_1234' }),
    });

    const del = await fetch(`${baseUrl}/api/integrations/github`, {
      method: 'DELETE',
    });
    expect(del.status).toBe(200);
    const body = (await del.json()) as { integration: Integration };
    expect(body.integration.connected).toBe(false);
    expect(body.integration.tokenMasked).toBeNull();

    // secret is gone
    const secretsPath = join(tmpRoot, '.kortext', 'secrets.env');
    const contents = readFileSync(secretsPath, 'utf8');
    expect(contents).not.toContain('INTEGRATION_GITHUB_TOKEN');

    // GET confirms disconnected
    const res = await fetch(`${baseUrl}/api/integrations`);
    const list = (await res.json()) as { integrations: Integration[] };
    expect(list.integrations.find((i) => i.id === 'github')!.connected).toBe(false);
  });

  it('returns 404 for an unknown integration id', async () => {
    const res = await fetch(`${baseUrl}/api/integrations/notreal`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unknown_integration');
  });
});
