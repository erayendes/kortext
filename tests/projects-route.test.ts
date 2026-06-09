import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { projectsRouter, serializeProjects } from '../server/routes/projects.ts';
import type { Registry } from '../server/registry/projects.ts';

// The wizard (bootstrap daemon) lists registered projects so a bare `kortext
// start` is GUI-first (UAT #10): pick one → its daemon starts and the browser
// hands off; "new project" continues to onboarding.

function makeRegistry(): Registry {
  return {
    version: 1,
    projects: {
      acme: { slug: 'acme', name: 'Acme', path: '/p/acme', port: 3201, pid: 10, status: 'running', createdAt: 2 },
      beta: { slug: 'beta', name: 'Beta', path: '/p/beta', port: 3202, pid: null, status: 'stopped', createdAt: 1 },
    },
  };
}

describe('serializeProjects (pure)', () => {
  it('maps each registry entry to a summary with a local URL, sorted by name', () => {
    const out = serializeProjects(makeRegistry());
    expect(out.map((p) => p.slug)).toEqual(['acme', 'beta']);
    expect(out[0]).toEqual({
      slug: 'acme',
      name: 'Acme',
      path: '/p/acme',
      port: 3201,
      status: 'running',
      url: 'http://localhost:3201/',
    });
  });

  it('returns [] for an empty registry', () => {
    expect(serializeProjects({ version: 1, projects: {} })).toEqual([]);
  });
});

let server: Server;
let baseUrl: string;
let registry: Registry;
let startCalls: Array<string>;
let handoffCalls: number;
let startResult: { ok: true; url: string } | { ok: false; message: string };

async function listen(app: express.Express): Promise<Server> {
  return await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
}

function mount(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    projectsRouter({
      readRegistry: () => registry,
      startProject: (slug) => {
        startCalls.push(slug);
        return startResult;
      },
      onHandoff: () => {
        handoffCalls++;
      },
    }),
  );
  return app;
}

beforeEach(async () => {
  registry = makeRegistry();
  startCalls = [];
  handoffCalls = 0;
  startResult = { ok: true, url: 'http://localhost:3201/' };
  server = await listen(mount());
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('GET /api/projects', () => {
  it('lists the registered projects', async () => {
    const res = await fetch(`${baseUrl}/api/projects`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { projects: Array<{ slug: string }> };
    expect(body.projects.map((p) => p.slug)).toEqual(['acme', 'beta']);
  });
});

describe('POST /api/projects/:slug/start', () => {
  it('starts the project and returns its handoff URL', async () => {
    const res = await fetch(`${baseUrl}/api/projects/acme/start`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; handoffUrl: string };
    expect(body).toEqual({ ok: true, handoffUrl: 'http://localhost:3201/' });
    expect(startCalls).toEqual(['acme']);
    // The wizard schedules its own shutdown after handing off.
    expect(handoffCalls).toBe(1);
  });

  it('404s when the slug is not registered (start never called)', async () => {
    const res = await fetch(`${baseUrl}/api/projects/ghost/start`, { method: 'POST' });
    expect(res.status).toBe(404);
    expect(startCalls).toEqual([]);
    expect(handoffCalls).toBe(0);
  });

  it('502s when the project fails to start (no handoff)', async () => {
    startResult = { ok: false, message: 'daemon refused' };
    const res = await fetch(`${baseUrl}/api/projects/acme/start`, { method: 'POST' });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(false);
    expect(body.message).toContain('daemon refused');
    expect(handoffCalls).toBe(0);
  });
});
