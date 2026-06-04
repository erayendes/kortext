import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { hooksRouter } from '../server/routes/hooks.ts';

type Hook = { id: string; label: string; description: string; enabled: boolean; command: string };

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
  it('returns all 6 known hooks in spec order, with wireframe defaults', async () => {
    const res = await fetch(`${baseUrl}/api/hooks`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hooks: Hook[] };

    expect(body.hooks.map((h) => h.id)).toEqual([
      'PreToolUse',
      'PostToolUse',
      'UserPromptSubmit',
      'SessionStart',
      'HandoverStart',
      'BlockerDetected',
    ]);
    // Default-on for the first four, off for the last two (mirrors the wireframe).
    const byId = Object.fromEntries(body.hooks.map((h) => [h.id, h]));
    expect(byId.PreToolUse?.enabled).toBe(true);
    expect(byId.SessionStart?.enabled).toBe(true);
    expect(byId.HandoverStart?.enabled).toBe(false);
    expect(byId.BlockerDetected?.enabled).toBe(false);
    for (const hook of body.hooks) {
      expect(hook.command).toBe('');
      expect(typeof hook.description).toBe('string');
      expect(hook.description.length).toBeGreaterThan(0);
    }
  });
});

describe('PUT /api/hooks', () => {
  it('enables one hook with a command, persists it, GET reflects it', async () => {
    const putRes = await fetch(`${baseUrl}/api/hooks`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        hooks: [{ id: 'BlockerDetected', enabled: true, command: 'echo done' }],
      }),
    });
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as { hooks: Hook[] };
    expect(putBody.hooks).toHaveLength(6);
    const done = putBody.hooks.find((h) => h.id === 'BlockerDetected');
    expect(done?.enabled).toBe(true);
    expect(done?.command).toBe('echo done');
    // Untouched hooks stay at their wireframe defaults (PreToolUse default-on).
    expect(putBody.hooks.find((h) => h.id === 'PreToolUse')?.enabled).toBe(true);

    // Persisted across a fresh GET.
    const getRes = await fetch(`${baseUrl}/api/hooks`);
    const getBody = (await getRes.json()) as { hooks: Hook[] };
    const persisted = getBody.hooks.find((h) => h.id === 'BlockerDetected');
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
        hooks: [{ id: 'PreToolUse', enabled: 'yes' }],
      }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; details: string[] };
    expect(body.error).toBe('validation_failed');
    expect(body.details.length).toBeGreaterThan(0);
  });
});
