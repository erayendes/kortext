import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { projectDangerRouter } from '../server/routes/project-danger.ts';
import { writeRegistry, readRegistry, upsertProject, type Registry } from '../server/registry/projects.ts';

let projectRoot: string;
let registryDir: string;
let server: Server;
let baseUrl: string;
let removed: string[];
let exits: number;

async function listen(app: express.Express): Promise<Server> {
  return await new Promise((res) => {
    const s = app.listen(0, () => res(s));
  });
}

function post(path: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
}

beforeEach(async () => {
  projectRoot = mkdtempSync(join(tmpdir(), 'kortext-danger-proj-'));
  registryDir = mkdtempSync(join(tmpdir(), 'kortext-danger-reg-'));
  removed = [];
  exits = 0;

  let reg: Registry = { version: 1, projects: {} };
  reg = upsertProject(reg, {
    slug: 'demo', name: 'Demo', path: resolve(projectRoot), port: 3200, pid: 999, status: 'running', createdAt: 1,
  });
  writeRegistry(registryDir, reg);

  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    projectDangerRouter({
      projectRoot,
      registryDir,
      rm: (p) => removed.push(p),
      selfExit: () => { exits += 1; },
    }),
  );
  server = await listen(app);
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((res) => server.close(() => res()));
  rmSync(projectRoot, { recursive: true, force: true });
  rmSync(registryDir, { recursive: true, force: true });
});

describe('POST /api/project/archive', () => {
  it('sets status archived, keeps the entry, deletes nothing', async () => {
    const res = await post('/api/project/archive');
    expect(res.status).toBe(200);
    expect(readRegistry(registryDir).projects.demo?.status).toBe('archived');
    expect(removed).toEqual([]);
    expect(exits).toBe(1);
  });
});

describe('POST /api/project/reset', () => {
  it('clears data (keeps markdown) and self-exits, staying registered', async () => {
    const res = await post('/api/project/reset');
    expect(res.status).toBe(200);
    expect(removed).toContain(join(resolve(projectRoot), '.kortext', 'data'));
    expect(removed.some((p) => p.includes('memory') || p.includes('foundation'))).toBe(false);
    expect(readRegistry(registryDir).projects.demo).toBeDefined(); // still registered
    expect(exits).toBe(1);
  });
});

describe('POST /api/project/remove', () => {
  it('deletes the whole .kortext, unregisters, keeps code', async () => {
    const res = await post('/api/project/remove');
    expect(res.status).toBe(200);
    expect(removed).toEqual([join(resolve(projectRoot), '.kortext')]);
    expect(readRegistry(registryDir).projects.demo).toBeUndefined();
    expect(exits).toBe(1);
  });
});

describe('POST /api/project/delete', () => {
  it('removes the entire project folder and unregisters', async () => {
    const res = await post('/api/project/delete');
    expect(res.status).toBe(200);
    expect(removed).toEqual([resolve(projectRoot)]); // the whole project dir
    expect(readRegistry(registryDir).projects.demo).toBeUndefined();
    expect(exits).toBe(1);
  });
});

describe('guards', () => {
  it('archive/remove return 409 when unregistered (no self-exit)', async () => {
    writeRegistry(registryDir, { version: 1, projects: {} });
    expect((await post('/api/project/archive')).status).toBe(409);
    expect((await post('/api/project/remove')).status).toBe(409);
    expect(exits).toBe(0);
  });
});
