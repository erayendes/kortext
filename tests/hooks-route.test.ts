import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { hooksRouter } from '../server/routes/hooks.ts';

type Hook = { id: string; label: string; enabled: boolean; command: string };

let tmpRoot: string;
let server: Server;
let baseUrl: string;

async function listen(app: express.Express): Promise<Server> {
  return await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
}

beforeEach(async () => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-hooks-'));
  const app = express();
  app.use(express.json());
  app.use('/api', hooksRouter({ projectRoot: tmpRoot }));
  server = await listen(app);
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://localhost:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('GET /api/hooks', () => {
  it('returns all 6 known hooks, all disabled, with empty commands', async () => {
    const res = await fetch(`${baseUrl}/api/hooks`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hooks: Hook[] };

    expect(body.hooks.map((h) => h.id)).toEqual([
      'on_item_created',
      'on_status_change',
      'on_review_requested',
      'on_gate_failed',
      'on_item_done',
      'on_handover',
    ]);
    for (const hook of body.hooks) {
      expect(hook.enabled).toBe(false);
      expect(hook.command).toBe('');
      expect(typeof hook.label).toBe('string');
      expect(hook.label.length).toBeGreaterThan(0);
    }
  });
});

describe('PUT /api/hooks', () => {
  it('enables one hook with a command, persists it, GET reflects it', async () => {
    const putRes = await fetch(`${baseUrl}/api/hooks`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        hooks: [{ id: 'on_item_done', enabled: true, command: 'echo done' }],
      }),
    });
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as { hooks: Hook[] };
    expect(putBody.hooks).toHaveLength(6);
    const done = putBody.hooks.find((h) => h.id === 'on_item_done');
    expect(done?.enabled).toBe(true);
    expect(done?.command).toBe('echo done');
    // Untouched hooks stay at defaults.
    expect(putBody.hooks.find((h) => h.id === 'on_handover')?.enabled).toBe(false);

    // Persisted across a fresh GET.
    const getRes = await fetch(`${baseUrl}/api/hooks`);
    const getBody = (await getRes.json()) as { hooks: Hook[] };
    const persisted = getBody.hooks.find((h) => h.id === 'on_item_done');
    expect(persisted?.enabled).toBe(true);
    expect(persisted?.command).toBe('echo done');
  });

  it('rejects an unknown hook id with 422', async () => {
    const res = await fetch(`${baseUrl}/api/hooks`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        hooks: [{ id: 'on_unknown_event', enabled: true }],
      }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; details: string[] };
    expect(body.error).toBe('validation_failed');
    expect(body.details.length).toBeGreaterThan(0);
  });

  it('rejects a non-boolean enabled with 422', async () => {
    const res = await fetch(`${baseUrl}/api/hooks`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        hooks: [{ id: 'on_item_created', enabled: 'yes' }],
      }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; details: string[] };
    expect(body.error).toBe('validation_failed');
    expect(body.details.length).toBeGreaterThan(0);
  });
});
