import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { blueprintRouter } from '../server/routes/blueprint.ts';

let tmpRoot: string;
let server: Server;
let baseUrl: string;
let triggered: string[];

async function listen(app: express.Express): Promise<Server> {
  return await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
}

beforeEach(async () => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-blueprint-'));
  triggered = [];
  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    blueprintRouter({
      workspaceRoot: tmpRoot,
      onApproved: (id) => {
        triggered.push(id);
      },
    }),
  );
  server = await listen(app);
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://localhost:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('GET /api/blueprint/status', () => {
  it('returns uninitialized when the file is missing', async () => {
    const res = await fetch(`${baseUrl}/api/blueprint/status`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; project: unknown };
    expect(body.status).toBe('uninitialized');
    expect(body.project).toBeNull();
  });

  it('returns approved + project meta when both files exist', async () => {
    mkdirSync(join(tmpRoot, 'workspace', 'references'), { recursive: true });
    writeFileSync(
      join(tmpRoot, 'workspace', 'references', 'blueprint.md'),
      '---\nstatus: approved\nowner: +prime\n---\n\n# Hello\n',
    );
    mkdirSync(join(tmpRoot, '.kortext'), { recursive: true });
    writeFileSync(
      join(tmpRoot, '.kortext', 'project.json'),
      JSON.stringify({
        name: 'Acme',
        code: 'ACME',
        type: 'new',
        platforms: ['Web'],
        githubRepo: null,
        createdAt: 1700000000000,
      }),
    );
    const res = await fetch(`${baseUrl}/api/blueprint/status`);
    const body = (await res.json()) as { status: string; project: { name: string } | null };
    expect(body.status).toBe('approved');
    expect(body.project?.name).toBe('Acme');
  });
});

describe('POST /api/blueprint', () => {
  it('rejects invalid payload with 422', async () => {
    const res = await fetch(`${baseUrl}/api/blueprint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectName: 'x' }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; details: string[] };
    expect(body.error).toBe('validation_failed');
    expect(body.details.length).toBeGreaterThan(0);
  });

  it('writes blueprint + project.json and triggers analysis workflow for new projects', async () => {
    const res = await fetch(`${baseUrl}/api/blueprint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectName: 'Acme CRM',
        projectCode: 'ACME',
        projectType: 'new',
        platforms: ['Web'],
        blueprintBody: '# Project Blueprint — Acme CRM\n\nVision: minimal CRM for SMB.\n',
        githubRepo: 'github.com/acme/acme-crm',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; triggerWorkflowId: string };
    expect(body.ok).toBe(true);
    expect(body.triggerWorkflowId).toBe('01a-analysis-pipeline');

    const blueprintPath = join(tmpRoot, 'workspace', 'references', 'blueprint.md');
    expect(existsSync(blueprintPath)).toBe(true);
    const written = readFileSync(blueprintPath, 'utf8');
    expect(written).toMatch(/status: approved/);
    expect(written).toMatch(/Acme CRM/);

    const metaPath = join(tmpRoot, '.kortext', 'project.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as {
      name: string;
      code: string;
      type: string;
      platforms: string[];
      githubRepo: string;
    };
    expect(meta.name).toBe('Acme CRM');
    expect(meta.code).toBe('ACME');
    expect(meta.type).toBe('new');
    expect(meta.platforms).toEqual(['Web']);
    expect(meta.githubRepo).toBe('github.com/acme/acme-crm');

    expect(triggered).toEqual(['01a-analysis-pipeline']);
  });

  it('routes existing projects to the onboarding pipeline', async () => {
    const res = await fetch(`${baseUrl}/api/blueprint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectName: 'Legacy App',
        projectCode: 'LEG',
        projectType: 'existing',
        platforms: ['Web', 'iOS'],
        blueprintBody: '# Project Blueprint — Legacy App\n\nVision: adapt the existing app.\n',
        githubRepo: null,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { triggerWorkflowId: string };
    expect(body.triggerWorkflowId).toBe('01b-onboarding-pipeline');
    expect(triggered).toEqual(['01b-onboarding-pipeline']);
  });

  it('rejects malformed github repos', async () => {
    const res = await fetch(`${baseUrl}/api/blueprint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectName: 'Good',
        projectCode: 'GOOD',
        projectType: 'new',
        platforms: ['Web'],
        blueprintBody: '# valid body content here\n',
        githubRepo: 'not-a-github-url',
      }),
    });
    expect(res.status).toBe(422);
  });
});
