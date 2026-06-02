import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { loadPersonasFromDir, type PersonaRegistry } from '../server/engine/persona-registry.ts';
import { loadWorkflowsFromDir, type WorkflowRegistry } from '../server/engine/workflow-loader.ts';
import { syncRegistriesToDb } from '../server/engine/index-sync.ts';
import { runsRouter } from '../server/routes/runs.ts';
import { handoversRouter } from '../server/routes/handovers.ts';
import { doctorRouter } from '../server/routes/doctor.ts';
import { personasRouter } from '../server/routes/personas.ts';
import { workflowsRouter } from '../server/routes/workflows.ts';
import { backlogRouter } from '../server/routes/backlog.ts';
import { docsRouter } from '../server/routes/docs.ts';
import { reportsRouter } from '../server/routes/reports.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;
let personas: PersonaRegistry;
let workflows: WorkflowRegistry;
let server: Server;
let baseUrl: string;

beforeEach(async () => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-routes-'));
  const bundle = openDb({ path: join(tmpRoot, 'routes.db') });
  db = bundle.db;
  repos = bundle.repositories;

  const personasDir = join(tmpRoot, 'agents');
  const workflowsDir = join(tmpRoot, 'workflows');
  const docsDir = join(tmpRoot, 'docs');
  mkdirSync(personasDir);
  mkdirSync(workflowsDir);
  mkdirSync(docsDir);
  writeFileSync(join(docsDir, 'blueprint.md'), '# Blueprint\n\nHello world\n');
  writeFileSync(join(docsDir, 'secret.txt'), 'should not be listed');
  writeFileSync(
    join(personasDir, 'backend-developer.md'),
    '# backend-developer\n\n- description: Builds the API\n\nYou are a backend developer.\n',
  );
  writeFileSync(
    join(workflowsDir, '99-test-pipeline.md'),
    '# 99 — Test Pipeline `!start test`\n\n## Phase one\n\n1. **+backend-developer:** Implement the thing.\n   - Inputs: `src`\n   - Outputs: `dist`\n',
  );
  personas = loadPersonasFromDir(personasDir);
  workflows = loadWorkflowsFromDir(workflowsDir);
  // Mirror engine boot so Faz 12.8 cross-cut endpoints have data to read.
  syncRegistriesToDb({ personas, workflows }, repos);

  const app = express();
  app.use(express.json());
  app.use('/api', runsRouter({ repos }));
  app.use('/api', handoversRouter({ repos }));
  app.use('/api', backlogRouter({ repos, personas }));
  app.use('/api', personasRouter({ personas, agentsDir: personasDir, repos }));
  app.use('/api', workflowsRouter({ workflows, repos }));
  app.use('/api', doctorRouter({ repos, workflows, personas }));
  app.use('/api', docsRouter({ scopes: { refs: docsDir } }));
  app.use('/api', reportsRouter({ repos, projectRoot: tmpRoot }));

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('GET /api/runs', () => {
  it('returns an empty list when no runs exist', async () => {
    const res = await fetch(`${baseUrl}/api/runs`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ runs: [] });
  });

  it('lists runs and supports a single-run detail with steps', async () => {
    const run = repos.runs.createRun({
      workflow_id: 'wf-1',
      item_id: null,
      status: 'running',
      worktree_path: null,
      triggered_by: 'test',
    });
    repos.runs.addStep({
      run_id: run.id,
      step_index: 0,
      step_name: 'plan',
      persona: '+backend-developer',
      status: 'pending',
    });

    const list = (await (await fetch(`${baseUrl}/api/runs`)).json()) as { runs: unknown[] };
    expect(list.runs).toHaveLength(1);

    const detailRes = await fetch(`${baseUrl}/api/runs/${run.id}`);
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as { run: { id: number }; steps: unknown[] };
    expect(detail.run.id).toBe(run.id);
    expect(detail.steps).toHaveLength(1);
  });

  it('404s an unknown run id', async () => {
    const res = await fetch(`${baseUrl}/api/runs/9999`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/handovers', () => {
  it('returns recent handovers most-recent-first', async () => {
    repos.backlog.create({
      id: 'T-001',
      type: 'task',
      title: 'first',
      status: 'to_do',
    });
    repos.handovers.create({
      item_id: 'T-001',
      from_persona: '+a',
      to_persona: '+b',
      reason: 'r',
      context_payload: { k: 1 },
      markdown_path: null,
    });
    const res = await fetch(`${baseUrl}/api/handovers`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { handovers: unknown[] };
    expect(body.handovers).toHaveLength(1);
  });
});

describe('GET /api/backlog', () => {
  it('filters by status', async () => {
    repos.backlog.create({
      id: 'T-A',
      type: 'task',
      title: 'a',
      status: 'to_do',
    });
    repos.backlog.create({
      id: 'T-B',
      type: 'task',
      title: 'b',
      status: 'in_progress',
    });

    const all = (await (await fetch(`${baseUrl}/api/backlog`)).json()) as { items: unknown[] };
    expect(all.items).toHaveLength(2);

    const filtered = (await (
      await fetch(`${baseUrl}/api/backlog?status=in_progress`)
    ).json()) as { items: { id: string }[] };
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]?.id).toBe('T-B');
  });
});

describe('POST /api/backlog/:id/transition', () => {
  async function transition(id: string, action: string, extra: Record<string, unknown> = {}) {
    return fetch(`${baseUrl}/api/backlog/${id}/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    });
  }

  it('applies a legal transition (to_do → in_progress via start) and returns the updated item', async () => {
    repos.backlog.create({ id: 'T-1', type: 'task', title: 'x', status: 'to_do' });
    const res = await transition('T-1', 'start', { by: '+prime' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { item: { status: string } };
    expect(body.item.status).toBe('in_progress');
    expect(repos.backlog.get('T-1')?.status).toBe('in_progress');
  });

  it('rejects an illegal transition with 409 and leaves the status unchanged', async () => {
    repos.backlog.create({ id: 'T-2', type: 'task', title: 'x', status: 'to_do' });
    const res = await transition('T-2', 'review');
    expect(res.status).toBe(409);
    expect(repos.backlog.get('T-2')?.status).toBe('to_do');
  });

  it('404s an unknown item id', async () => {
    const res = await transition('NOPE', 'start');
    expect(res.status).toBe(404);
  });

  it('400s an unknown action', async () => {
    repos.backlog.create({ id: 'T-3', type: 'task', title: 'x', status: 'to_do' });
    const res = await transition('T-3', 'teleport');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/personas', () => {
  it('lists personas with description and prompt length', async () => {
    const res = await fetch(`${baseUrl}/api/personas`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      personas: { handle: string; description: string; promptLength: number }[];
    };
    expect(body.personas).toHaveLength(1);
    expect(body.personas[0]?.handle).toBe('+backend-developer');
    expect(body.personas[0]?.promptLength).toBeGreaterThan(0);
  });

  it('returns the full system prompt for a single persona', async () => {
    const res = await fetch(`${baseUrl}/api/personas/+backend-developer`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { persona: { systemPrompt: string } };
    expect(body.persona.systemPrompt).toContain('backend developer');
  });
});

describe('PUT /api/personas/:handle', () => {
  it('persists a valid edit and reloads the registry', async () => {
    const newBody =
      '# backend-developer\n\n- description: Builds the API and ships fast\n\nUpdated body.\n';
    const res = await fetch(`${baseUrl}/api/personas/+backend-developer`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemPrompt: newBody }),
    });
    expect(res.status).toBe(200);
    const after = personas.get('+backend-developer');
    expect(after?.description).toContain('ships fast');
  });

  it('rejects an edit that changes the H1 handle', async () => {
    const newBody = '# different-handle\n\n- description: x\n\nbody\n';
    const res = await fetch(`${baseUrl}/api/personas/+backend-developer`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemPrompt: newBody }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('handle_changed');
  });

  it('returns 404 for an unknown persona', async () => {
    const res = await fetch(`${baseUrl}/api/personas/+ghost`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemPrompt: '# ghost\n\n- description: x\n\n' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/workflows', () => {
  it('lists workflow summaries', async () => {
    const res = await fetch(`${baseUrl}/api/workflows`);
    const body = (await res.json()) as {
      workflows: { id: string; stepCount: number }[];
    };
    expect(body.workflows).toHaveLength(1);
    expect(body.workflows[0]?.id).toBe('99-test-pipeline');
    expect(body.workflows[0]?.stepCount).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/personas/usage (Faz 12.8)', () => {
  it('returns step counts grouped by persona handle', async () => {
    const res = await fetch(`${baseUrl}/api/personas/usage`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      usage: { handle: string; step_count: number }[];
    };
    // The fixture workflow has one step assigned to +backend-developer.
    const backend = body.usage.find((u) => u.handle === '+backend-developer');
    expect(backend).toBeDefined();
    expect(backend?.step_count).toBe(1);
    // Synthetic +prime is part of the personas table but has 0 steps here.
    const prime = body.usage.find((u) => u.handle === '+prime');
    expect(prime).toBeDefined();
    expect(prime?.step_count).toBe(0);
  });
});

describe('GET /api/workflows/:id/dependencies (Faz 12.8)', () => {
  it('returns deduplicated inputs and outputs for a workflow', async () => {
    const res = await fetch(
      `${baseUrl}/api/workflows/99-test-pipeline/dependencies`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      workflow_id: string;
      inputs: string[];
      outputs: string[];
    };
    expect(body.workflow_id).toBe('99-test-pipeline');
    // Fixture step: "- inputs: src" / "- outputs: dist".
    expect(body.inputs).toEqual(['src']);
    expect(body.outputs).toEqual(['dist']);
  });

  it('returns 404 for an unknown workflow id', async () => {
    const res = await fetch(`${baseUrl}/api/workflows/no-such-workflow/dependencies`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/docs/:scope', () => {
  it('lists only .md files in the scope', async () => {
    const res = await fetch(`${baseUrl}/api/docs/refs`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      files: { name: string; size: number; mtime: number }[];
    };
    expect(body.files).toHaveLength(1);
    expect(body.files[0]?.name).toBe('blueprint.md');
    expect(body.files[0]?.size).toBeGreaterThan(0);
    expect(body.files[0]?.mtime).toBeGreaterThan(0);
  });

  it('returns 404 for unknown scope', async () => {
    const res = await fetch(`${baseUrl}/api/docs/nope`);
    expect(res.status).toBe(404);
  });

  it('returns markdown body for an existing file', async () => {
    const res = await fetch(`${baseUrl}/api/docs/refs/blueprint.md`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { body: string };
    expect(body.body).toContain('Hello world');
  });

  it('rejects invalid filenames (path traversal attempt)', async () => {
    const res = await fetch(`${baseUrl}/api/docs/refs/..%2Fagents%2Fbackend-developer.md`);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('404s an unknown file in a valid scope', async () => {
    const res = await fetch(`${baseUrl}/api/docs/refs/missing.md`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/reports', () => {
  it('returns empty when no reports indexed', async () => {
    const res = await fetch(`${baseUrl}/api/reports`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reports: [] });
  });

  it('filters by scope, status, and related_item', async () => {
    repos.reports.create({
      scope: 'test-reports',
      slug: 'a',
      file_path: '.kortext/reports/test-reports_a_2026-05-20-0900.md',
      status: 'approved',
    });
    repos.reports.create({
      scope: 'security-reports',
      slug: 'b',
      file_path: '.kortext/reports/security-reports_b_2026-05-21-0900.md',
      status: 'writing',
      related_item: 'T01',
    });
    repos.reports.create({
      scope: 'test-reports',
      slug: 'c',
      file_path: '.kortext/reports/test-reports_c_2026-05-22-0900.md',
      status: 'writing',
      related_item: 'T01',
    });

    const all = (await (await fetch(`${baseUrl}/api/reports`)).json()) as {
      reports: { slug: string }[];
    };
    expect(all.reports).toHaveLength(3);

    const scoped = (await (
      await fetch(`${baseUrl}/api/reports?scope=test-reports`)
    ).json()) as { reports: { slug: string }[] };
    expect(scoped.reports.map((r) => r.slug).sort()).toEqual(['a', 'c']);

    const writing = (await (
      await fetch(`${baseUrl}/api/reports?status=writing`)
    ).json()) as { reports: { slug: string }[] };
    expect(writing.reports.map((r) => r.slug).sort()).toEqual(['b', 'c']);

    const byItem = (await (
      await fetch(`${baseUrl}/api/reports?related_item=T01`)
    ).json()) as { reports: { slug: string }[] };
    expect(byItem.reports.map((r) => r.slug).sort()).toEqual(['b', 'c']);

    const limit1 = (await (
      await fetch(`${baseUrl}/api/reports?limit=1`)
    ).json()) as { reports: unknown[] };
    expect(limit1.reports).toHaveLength(1);
  });

  it('400s an invalid status query', async () => {
    const res = await fetch(`${baseUrl}/api/reports?status=bogus`);
    expect(res.status).toBe(400);
  });

  it('returns the row and body for /api/reports/:id', async () => {
    const reportsDir = join(tmpRoot, '.kortext/reports');
    mkdirSync(reportsDir, { recursive: true });
    const filename = 'test-reports_e2e_2026-05-22-1000.md';
    writeFileSync(join(reportsDir, filename), '# e2e report\n\nbody\n');

    const created = repos.reports.create({
      scope: 'test-reports',
      slug: 'e2e',
      file_path: `.kortext/reports/${filename}`,
      status: 'approved',
    });

    const res = await fetch(`${baseUrl}/api/reports/${created.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      report: { id: number; slug: string };
      body: string | null;
    };
    expect(body.report.id).toBe(created.id);
    expect(body.body).toContain('# e2e report');
  });

  it('returns body=null when the file is missing', async () => {
    const created = repos.reports.create({
      scope: 'test-reports',
      slug: 'orphan',
      file_path: '.kortext/reports/test-reports_orphan_2026-05-22-1000.md',
    });
    const res = await fetch(`${baseUrl}/api/reports/${created.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { body: string | null };
    expect(body.body).toBeNull();
  });

  it('404s an unknown id', async () => {
    const res = await fetch(`${baseUrl}/api/reports/9999`);
    expect(res.status).toBe(404);
  });

  it('400s an invalid id', async () => {
    const res = await fetch(`${baseUrl}/api/reports/abc`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/doctor', () => {
  it('returns the doctor report shape', async () => {
    const res = await fetch(`${baseUrl}/api/doctor`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      findings: { category: string; severity: string }[];
      summary: { workflowsLoaded: number; personasLoaded: number };
      hasErrors: boolean;
    };
    expect(body.summary.workflowsLoaded).toBe(1);
    expect(body.summary.personasLoaded).toBe(1);
    expect(body.findings.length).toBeGreaterThan(0);
    expect(body.hasErrors).toBe(false);
  });
});
