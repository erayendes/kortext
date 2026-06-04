import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { projectMetaRouter } from '../server/routes/project-meta.ts';
import type { ProjectMeta } from '../server/blueprint/io.ts';

let tmpRoot: string;
let server: Server;
let baseUrl: string;

async function listen(app: express.Express): Promise<Server> {
  return await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
}

function writeMeta(meta: ProjectMeta): void {
  mkdirSync(join(tmpRoot, '.kortext'), { recursive: true });
  writeFileSync(
    join(tmpRoot, '.kortext', 'project.json'),
    JSON.stringify(meta, null, 2),
  );
}

const baseMeta: ProjectMeta = {
  name: 'Acme',
  code: 'ACME',
  type: 'existing',
  platforms: ['Web'],
  githubRepo: null,
  executor: 'claude',
  executorBinary: null,
  createdAt: 1700000000000,
};

beforeEach(async () => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-project-meta-'));
  const app = express();
  app.use(express.json());
  app.use('/api', projectMetaRouter({ workspaceRoot: tmpRoot }));
  server = await listen(app);
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://localhost:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('GET /api/project-meta', () => {
  it('returns null when project.json is missing', async () => {
    const res = await fetch(`${baseUrl}/api/project-meta`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meta: ProjectMeta | null };
    expect(body.meta).toBeNull();
  });

  it('returns the existing meta', async () => {
    writeMeta(baseMeta);
    const res = await fetch(`${baseUrl}/api/project-meta`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meta: ProjectMeta | null };
    expect(body.meta?.name).toBe('Acme');
    expect(body.meta?.code).toBe('ACME');
    expect(body.meta?.type).toBe('existing');
  });
});

describe('PUT /api/project-meta', () => {
  it('updates name + code + githubRepo while preserving createdAt, type, executor', async () => {
    writeMeta(baseMeta);
    const res = await fetch(`${baseUrl}/api/project-meta`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Acme Renamed',
        code: 'ACME2',
        githubRepo: 'https://github.com/acme/renamed',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meta: ProjectMeta };
    expect(body.meta.name).toBe('Acme Renamed');
    expect(body.meta.code).toBe('ACME2');
    expect(body.meta.githubRepo).toBe('github.com/acme/renamed');
    // preserved
    expect(body.meta.createdAt).toBe(1700000000000);
    expect(body.meta.type).toBe('existing');
    expect(body.meta.executor).toBe('claude');
  });

  it('rejects an invalid github repo with 422', async () => {
    writeMeta(baseMeta);
    const res = await fetch(`${baseUrl}/api/project-meta`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ githubRepo: 'not-a-github-url' }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; details: string[] };
    expect(body.error).toBe('validation_failed');
    expect(body.details.length).toBeGreaterThan(0);
  });

  it('returns 404 when no project exists', async () => {
    const res = await fetch(`${baseUrl}/api/project-meta`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Whatever' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('no_project');
  });
});
