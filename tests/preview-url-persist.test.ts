/**
 * Task B4 — Persist + expose the per-item preview URL.
 *
 * Tests:
 *   1. runItem success + item flagged `preview: true`  → preview_url persisted in DB.
 *   2. runItem success + item NOT flagged               → preview_url stays null.
 *   3. BacklogRepository.get() returns preview_url field.
 *   4. Backlog API GET /backlog/:id includes preview_url.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type Database from 'better-sqlite3';
import express from 'express';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { ItemLifecycle } from '../server/engine/item-lifecycle.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import { MockPreviewServer } from '../server/engine/executors/mock-preview-server.ts';
import { parseWorkflowMarkdown } from '../server/engine/workflow-parser.ts';
import { buildGraph } from '../server/engine/dag.ts';
import { RunRegistry } from '../server/engine/run-registry.ts';
import { ResolutionRegistry } from '../server/orchestrator/resolution-registry.ts';
import { PreviewManager } from '../server/orchestrator/test-preview.ts';
import { runItem } from '../server/orchestrator/run-item.ts';
import { backlogRouter } from '../server/routes/backlog.ts';

let tmpRoot: string;
let agentsDir: string;
let db: Database.Database;
let repos: Repositories;

const devCycleWf = parseWorkflowMarkdown(
  `# Development Cycle
## Build
1. **+backend-developer:** implement the item
   - Outputs: impl.md
`,
  'development-cycle',
);

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-prevurl-'));
  agentsDir = join(tmpRoot, 'agents');
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, 'backend-developer.md'),
    '# backend-developer\n\n- description: builds.\n\n## identity\nbody\n',
  );
  const bundle = openDb({ path: join(tmpRoot, 'prevurl.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

function makeLifecycle() {
  return new ItemLifecycle({ repos, personas: loadPersonasFromDir(agentsDir) });
}

function mockAcquirer() {
  return async (itemId: string) => ({
    path: `/tmp/wt/${itemId}`,
    release: () => {},
  });
}

// -----------------------------------------------------------------------
// 1 & 2. runItem persistence gate (preview: true vs omitted)
// -----------------------------------------------------------------------

describe('preview URL persistence via runItem', () => {
  it('item flagged preview:true → preview_url is persisted after successful run', async () => {
    // Use repos.backlog.create() directly so we can set frontmatter.preview.
    // ItemLifecycle.create() doesn't expose frontmatter (by design — it's a
    // planning-ingest concern); the orchestrator reads it from the stored row.
    repos.backlog.create({
      id: 'PU1',
      type: 'task',
      title: 'Preview URL item',
      frontmatter: { preview: true },
    });
    const lc = makeLifecycle();

    const previewServer = new MockPreviewServer();
    const previewManager = new PreviewManager(previewServer);

    const result = await runItem('PU1', {
      repos,
      lifecycle: lc,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      graph: buildGraph(devCycleWf),
      acquireWorktree: mockAcquirer(),
      registry: new RunRegistry(),
      resolution: new ResolutionRegistry(),
      previewManager,
    });

    expect(result.outcome).toBe('implemented');
    // The preview URL must be persisted in the DB.
    const liveUrl = previewManager.urlFor('PU1');
    expect(liveUrl).not.toBeNull();
    const stored = repos.backlog.get('PU1');
    expect(stored?.preview_url).toBe(liveUrl);
  });

  it('item NOT flagged (no frontmatter.preview) → preview_url stays null after run', async () => {
    const lc = makeLifecycle();
    lc.create({ id: 'PU2', type: 'task', title: 'No preview flag' });

    const previewServer = new MockPreviewServer();
    const previewManager = new PreviewManager(previewServer);

    const result = await runItem('PU2', {
      repos,
      lifecycle: lc,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      graph: buildGraph(devCycleWf),
      acquireWorktree: mockAcquirer(),
      registry: new RunRegistry(),
      resolution: new ResolutionRegistry(),
      previewManager,
    });

    expect(result.outcome).toBe('implemented');
    // preview is started in-memory (existing behaviour), but must NOT be persisted
    // because the item wasn't flagged.
    const stored = repos.backlog.get('PU2');
    expect(stored?.preview_url).toBeNull();
  });

  it('item flagged preview:true but build fails → preview_url stays null', async () => {
    repos.backlog.create({
      id: 'PU3',
      type: 'task',
      title: 'Flagged but build fails',
      frontmatter: { preview: true },
    });
    const lc = makeLifecycle();

    const previewServer = new MockPreviewServer();
    const previewManager = new PreviewManager(previewServer);

    const result = await runItem('PU3', {
      repos,
      lifecycle: lc,
      executor: new MockExecutor(() => ({ fail: true })),
      graph: buildGraph(devCycleWf),
      acquireWorktree: mockAcquirer(),
      registry: new RunRegistry(),
      resolution: new ResolutionRegistry(),
      previewManager,
    });

    expect(result.outcome).toBe('failed');
    const stored = repos.backlog.get('PU3');
    expect(stored?.preview_url).toBeNull();
  });
});

// -----------------------------------------------------------------------
// 3. BacklogRepository.get() surfaces preview_url
// -----------------------------------------------------------------------

describe('BacklogRepository — preview_url field', () => {
  it('get() returns preview_url as null for a freshly created item', () => {
    repos.backlog.create({ id: 'RU1', type: 'task', title: 'Test item' });
    const item = repos.backlog.get('RU1');
    expect(item).not.toBeNull();
    expect(item).toHaveProperty('preview_url');
    expect(item!.preview_url).toBeNull();
  });

  it('setPreviewUrl() persists and get() returns the URL', () => {
    repos.backlog.create({ id: 'RU2', type: 'task', title: 'Test item 2' });
    repos.backlog.setPreviewUrl('RU2', 'http://localhost:5173/RU2');
    const item = repos.backlog.get('RU2');
    expect(item!.preview_url).toBe('http://localhost:5173/RU2');
  });

  it('list() returns preview_url on every row', () => {
    repos.backlog.create({ id: 'RL1', type: 'task', title: 'List item 1' });
    repos.backlog.create({ id: 'RL2', type: 'task', title: 'List item 2' });
    repos.backlog.setPreviewUrl('RL1', 'http://localhost:5173/RL1');
    const items = repos.backlog.list({ limit: 10 });
    expect(items.length).toBeGreaterThanOrEqual(2);
    const rl1 = items.find((i) => i.id === 'RL1');
    const rl2 = items.find((i) => i.id === 'RL2');
    expect(rl1?.preview_url).toBe('http://localhost:5173/RL1');
    expect(rl2?.preview_url).toBeNull();
  });
});

// -----------------------------------------------------------------------
// 4. Backlog API GET /backlog/:id includes preview_url
// -----------------------------------------------------------------------

describe('Backlog API — GET /backlog/:id exposes preview_url', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', backlogRouter({ repos }));
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('returns preview_url: null for a new item', async () => {
    repos.backlog.create({ id: 'AP1', type: 'task', title: 'API item' });
    const res = await fetch(`${baseUrl}/api/backlog/AP1`);
    expect(res.status).toBe(200);
    const body = await res.json() as { item: Record<string, unknown> };
    expect(body.item).toHaveProperty('preview_url');
    expect(body.item.preview_url).toBeNull();
  });

  it('returns preview_url when set', async () => {
    repos.backlog.create({ id: 'AP2', type: 'task', title: 'API item 2' });
    repos.backlog.setPreviewUrl('AP2', 'http://localhost:4321/AP2');
    const res = await fetch(`${baseUrl}/api/backlog/AP2`);
    expect(res.status).toBe(200);
    const body = await res.json() as { item: Record<string, unknown> };
    expect(body.item.preview_url).toBe('http://localhost:4321/AP2');
  });
});
