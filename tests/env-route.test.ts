import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { envVarsRouter } from '../server/routes/env-vars.ts';
import { projectLayout } from '../server/paths.ts';
import { setSecret } from '../server/services/secret-store.ts';

let tmpRoot: string;
let server: Server;
let baseUrl: string;

async function listen(app: express.Express): Promise<Server> {
  return await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
}

beforeEach(async () => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-env-'));
  const app = express();
  app.use(express.json());
  app.use('/api', envVarsRouter({ projectRoot: tmpRoot }));
  server = await listen(app);
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://localhost:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('GET /api/env', () => {
  it('returns an empty list when nothing is stored', async () => {
    const res = await fetch(`${baseUrl}/api/env`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { vars: unknown[] };
    expect(body.vars).toEqual([]);
  });

  it('excludes INTEGRATION_* keys', async () => {
    const secretsFile = projectLayout(tmpRoot).secretsFile;
    setSecret(secretsFile, 'INTEGRATION_GITHUB_TOKEN', 'ghp_supersecret');
    setSecret(secretsFile, 'API_BASE_URL', 'https://api.example.com');

    const res = await fetch(`${baseUrl}/api/env`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      vars: { key: string; valueMasked: string }[];
    };
    expect(body.vars.map((v) => v.key)).toEqual(['API_BASE_URL']);
  });

  it('returns vars sorted by key ascending', async () => {
    const secretsFile = projectLayout(tmpRoot).secretsFile;
    setSecret(secretsFile, 'ZEBRA', 'z-value');
    setSecret(secretsFile, 'ALPHA', 'a-value');

    const res = await fetch(`${baseUrl}/api/env`);
    const body = (await res.json()) as { vars: { key: string }[] };
    expect(body.vars.map((v) => v.key)).toEqual(['ALPHA', 'ZEBRA']);
  });
});

describe('PUT /api/env/:key', () => {
  it('adds a var and GET shows it masked, never raw', async () => {
    const putRes = await fetch(`${baseUrl}/api/env/MY_SECRET`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'abcd1234' }),
    });
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as {
      var: { key: string; valueMasked: string };
    };
    expect(putBody.var.key).toBe('MY_SECRET');
    expect(putBody.var.valueMasked).toBe('••••1234');
    expect(putBody.var.valueMasked).not.toContain('abcd');

    const getRes = await fetch(`${baseUrl}/api/env`);
    const getRaw = await getRes.text();
    expect(getRaw).not.toContain('abcd1234');
    const getBody = JSON.parse(getRaw) as {
      vars: { key: string; valueMasked: string }[];
    };
    expect(getBody.vars).toEqual([
      { key: 'MY_SECRET', valueMasked: '••••1234' },
    ]);
  });

  it('rejects a reserved INTEGRATION_ key with 422', async () => {
    const res = await fetch(`${baseUrl}/api/env/INTEGRATION_FOO`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'nope' }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; details: unknown };
    expect(body.error).toBe('validation_failed');
    expect(body.details).toBeTruthy();
  });

  it('rejects an invalid key with 422', async () => {
    const res = await fetch(`${baseUrl}/api/env/1BAD`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x' }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('validation_failed');
  });

  it('rejects a non-string value with 422', async () => {
    const res = await fetch(`${baseUrl}/api/env/GOOD_KEY`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 42 }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('validation_failed');
  });
});

describe('DELETE /api/env/:key', () => {
  it('deletes an existing var with 200', async () => {
    const secretsFile = projectLayout(tmpRoot).secretsFile;
    setSecret(secretsFile, 'TO_DELETE', 'value');

    const res = await fetch(`${baseUrl}/api/env/TO_DELETE`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted: boolean };
    expect(body.deleted).toBe(true);

    const getRes = await fetch(`${baseUrl}/api/env`);
    const getBody = (await getRes.json()) as { vars: unknown[] };
    expect(getBody.vars).toEqual([]);
  });

  it('returns 404 when the var is missing', async () => {
    const res = await fetch(`${baseUrl}/api/env/NOPE`, { method: 'DELETE' });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not_found');
  });

  it('rejects a reserved INTEGRATION_ key with 422', async () => {
    const res = await fetch(`${baseUrl}/api/env/INTEGRATION_GITHUB_TOKEN`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('validation_failed');
  });
});
