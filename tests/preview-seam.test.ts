import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { ItemLifecycle } from '../server/engine/item-lifecycle.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import { MockPreviewServer } from '../server/engine/executors/mock-preview-server.ts';
import type { PreviewServer } from '../server/engine/preview-server.ts';
import { MockMerger } from '../server/engine/executors/mock-merger.ts';
import { MockDeployer } from '../server/engine/executors/mock-deployer.ts';
import { parseWorkflowMarkdown } from '../server/engine/workflow-parser.ts';
import { buildGraph } from '../server/engine/dag.ts';
import { RunRegistry } from '../server/engine/run-registry.ts';
import { ResolutionRegistry } from '../server/orchestrator/resolution-registry.ts';
import { PreviewManager } from '../server/orchestrator/test-preview.ts';
import { runItem } from '../server/orchestrator/run-item.ts';
import { runClosure } from '../server/orchestrator/closure.ts';

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
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-prev-'));
  agentsDir = join(tmpRoot, 'agents');
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, 'backend-developer.md'),
    '# backend-developer\n\n- description: builds.\n\n## identity\nbody\n',
  );
  const bundle = openDb({ path: join(tmpRoot, 'prev.db') });
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

describe('preview seam — startFor on test-entry, stopFor on closure (capstone composition 3, §5.7/§5.9 #7)', () => {
  it('runItem starts the item preview from its worktree when it reaches test', async () => {
    const lc = makeLifecycle();
    lc.create({ id: 'PV1', type: 'task', title: 'PV1' });
    const previewServer = new MockPreviewServer();
    const previewManager = new PreviewManager(previewServer);

    const result = await runItem('PV1', {
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
    // The preview is live, pointing at the item's worktree URL.
    expect(previewManager.urlFor('PV1')).not.toBeNull();
    expect(previewServer.startedFor).toContain('PV1');
  });

  it('a failed dev-cycle run never starts a preview (nothing to show)', async () => {
    const lc = makeLifecycle();
    lc.create({ id: 'PV2', type: 'task', title: 'PV2' });
    const previewServer = new MockPreviewServer();
    const previewManager = new PreviewManager(previewServer);

    const result = await runItem('PV2', {
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
    expect(previewManager.urlFor('PV2')).toBeNull();
    expect(previewServer.startedFor).not.toContain('PV2');
  });

  it('a preview spawn failure does not crash the item run (preview is soft)', async () => {
    const lc = makeLifecycle();
    lc.create({ id: 'PV3', type: 'task', title: 'PV3' });
    // A preview server that always fails to start (e.g. no dev command / port busy).
    const failingServer: PreviewServer = {
      name: 'failing-preview',
      async start() {
        throw new Error('dev server failed to boot');
      },
      async stop() {},
    };
    const previewManager = new PreviewManager(failingServer);

    const result = await runItem('PV3', {
      repos,
      lifecycle: lc,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      graph: buildGraph(devCycleWf),
      acquireWorktree: mockAcquirer(),
      registry: new RunRegistry(),
      resolution: new ResolutionRegistry(),
      previewManager,
    });

    // The item still reaches test — a missing preview doesn't fail the build.
    expect(result.outcome).toBe('implemented');
    expect(repos.backlog.get('PV3')?.status).toBe('test');
    expect(previewManager.urlFor('PV3')).toBeNull();
  });

  it('runClosure stops the item preview when the item merges to done', async () => {
    const lc = makeLifecycle();
    // Drive PV4 to review the long way so closure has a real item to close.
    lc.create({ id: 'PV4', type: 'task', title: 'PV4' });
    lc.transition('PV4', 'start', 'x');
    lc.transition('PV4', 'test', 'x');
    lc.transition('PV4', 'review', 'x');

    const previewServer = new MockPreviewServer();
    const previewManager = new PreviewManager(previewServer);
    // Simulate the preview being up from the test phase.
    await previewManager.startFor('PV4', '/tmp/wt/PV4');
    expect(previewManager.urlFor('PV4')).not.toBeNull();

    const closure = await runClosure('PV4', {
      repos,
      lifecycle: lc,
      merger: new MockMerger(() => ({})), // clean merge
      deployer: new MockDeployer(),
      previewManager,
    });

    expect(closure.outcome).toBe('done');
    // The preview was torn down with the worktree.
    expect(previewManager.urlFor('PV4')).toBeNull();
    expect(previewServer.stoppedFor).toContain('PV4');
  });

  it('runClosure stops the preview on a bounce too (conflict tears the worktree context down)', async () => {
    const lc = makeLifecycle();
    lc.create({ id: 'PV5', type: 'task', title: 'PV5' });
    lc.transition('PV5', 'start', 'x');
    lc.transition('PV5', 'test', 'x');
    lc.transition('PV5', 'review', 'x');

    const previewServer = new MockPreviewServer();
    const previewManager = new PreviewManager(previewServer);
    await previewManager.startFor('PV5', '/tmp/wt/PV5');

    const closure = await runClosure('PV5', {
      repos,
      lifecycle: lc,
      merger: new MockMerger(() => ({ conflict: true, reason: 'clash' })),
      deployer: new MockDeployer(),
      previewManager,
    });

    expect(closure.outcome).toBe('bounced');
    // Preview is stopped regardless — a bounced item goes back to the developer,
    // who will get a fresh preview on the next test entry.
    expect(previewManager.urlFor('PV5')).toBeNull();
  });
});
