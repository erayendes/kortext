import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { envVarsRouter } from '../server/routes/env-vars.ts';

let tmpRoot: string;
let server: Server;
let baseUrl: string;

type Var = { key: string; isPublic: boolean; valueMasked: string; value: string | null };

async function listen(app: express.Express): Promise<Server> {
  return await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
}

async function put(env: string, key: string, value: unknown) {
  return await fetch(`${baseUrl}/api/env/${env}/${key}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value }),
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

describe('GET /api/env/:env', () => {
  it('returns an empty list when nothing is stored', async () => {
    const res = await fetch(`${baseUrl}/api/env/dev`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { env: string; vars: unknown[] };
    expect(body.env).toBe('dev');
    expect(body.vars).toEqual([]);
  });

  it('rejects an unknown environment with 422', async () => {
    const res = await fetch(`${baseUrl}/api/env/qa`);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('validation_failed');
  });

  it('returns vars sorted by key ascending', async () => {
    await put('dev', 'ZEBRA', 'z-value');
    await put('dev', 'ALPHA', 'a-value');

    const res = await fetch(`${baseUrl}/api/env/dev`);
    const body = (await res.json()) as { vars: Var[] };
    expect(body.vars.map((v) => v.key)).toEqual(['ALPHA', 'ZEBRA']);
  });

  it('isolates environments: a var in dev is not visible in staging', async () => {
    await put('dev', 'API_URL', 'https://dev.example.com');
    const dev = (await (await fetch(`${baseUrl}/api/env/dev`)).json()) as { vars: Var[] };
    const staging = (await (await fetch(`${baseUrl}/api/env/staging`)).json()) as { vars: Var[] };
    expect(dev.vars.map((v) => v.key)).toEqual(['API_URL']);
    expect(staging.vars).toEqual([]);
  });
});

describe('public vs secret', () => {
  it('masks a secret key — raw value never crosses the wire', async () => {
    await put('dev', 'DATABASE_PASSWORD', 'abcd1234');
    const res = await fetch(`${baseUrl}/api/env/dev`);
    const raw = await res.text();
    expect(raw).not.toContain('abcd1234');
    const body = JSON.parse(raw) as { vars: Var[] };
    expect(body.vars[0]).toEqual({
      key: 'DATABASE_PASSWORD',
      isPublic: false,
      valueMasked: '••••1234',
      value: null,
    });
  });

  it('returns the raw value for a public key (NEXT_PUBLIC_*)', async () => {
    await put('production', 'NEXT_PUBLIC_SITE_URL', 'https://notlarim.app');
    const body = (await (await fetch(`${baseUrl}/api/env/production`)).json()) as { vars: Var[] };
    expect(body.vars[0]).toEqual({
      key: 'NEXT_PUBLIC_SITE_URL',
      isPublic: true,
      valueMasked: maskOf('https://notlarim.app'),
      value: 'https://notlarim.app',
    });
  });

  it('treats VITE_* and *PUBLIC* keys as public too', async () => {
    await put('dev', 'VITE_APP_ID', 'app_123');
    await put('dev', 'STRIPE_PUBLIC_KEY', 'pk_live_xyz');
    const body = (await (await fetch(`${baseUrl}/api/env/dev`)).json()) as { vars: Var[] };
    expect(body.vars.every((v) => v.isPublic)).toBe(true);
    expect(body.vars.find((v) => v.key === 'VITE_APP_ID')!.value).toBe('app_123');
  });
});

describe('PUT /api/env/:env/:key', () => {
  it('adds a var, echoes it back, and persists to the per-env file', async () => {
    const res = await put('dev', 'MY_SECRET', 'abcd1234');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { var: Var };
    expect(body.var.key).toBe('MY_SECRET');
    expect(body.var.valueMasked).toBe('••••1234');

    const file = readFileSync(join(tmpRoot, '.kortext', 'env', 'dev.env'), 'utf8');
    expect(file).toContain('MY_SECRET=abcd1234');
  });

  it('rejects a reserved INTEGRATION_ key with 422', async () => {
    const res = await put('dev', 'INTEGRATION_FOO', 'nope');
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('validation_failed');
  });

  it('rejects an invalid key with 422', async () => {
    const res = await put('dev', '1BAD', 'x');
    expect(res.status).toBe(422);
  });

  it('rejects a non-string value with 422', async () => {
    const res = await put('dev', 'GOOD_KEY', 42);
    expect(res.status).toBe(422);
  });

  it('rejects an unknown environment with 422', async () => {
    const res = await put('qa', 'GOOD_KEY', 'x');
    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/env/:env/:key', () => {
  it('deletes an existing var with 200', async () => {
    await put('dev', 'TO_DELETE', 'value');
    const res = await fetch(`${baseUrl}/api/env/dev/TO_DELETE`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect((await res.json()) as { deleted: boolean }).toEqual({ deleted: true });

    const get = (await (await fetch(`${baseUrl}/api/env/dev`)).json()) as { vars: unknown[] };
    expect(get.vars).toEqual([]);
  });

  it('returns 404 when the var is missing', async () => {
    const res = await fetch(`${baseUrl}/api/env/dev/NOPE`, { method: 'DELETE' });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('not_found');
  });

  it('rejects a reserved INTEGRATION_ key with 422', async () => {
    const res = await fetch(`${baseUrl}/api/env/dev/INTEGRATION_GITHUB_TOKEN`, { method: 'DELETE' });
    expect(res.status).toBe(422);
  });
});

/** Mirror of secret-store.maskSecret for assertion convenience. */
function maskOf(value: string): string {
  return value.length <= 4 ? '••••' : '••••' + value.slice(-4);
}
