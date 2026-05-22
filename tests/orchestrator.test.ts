import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import {
  parseWorkflowMarkdown,
  type WorkflowDefinition,
} from '../server/engine/workflow-parser.ts';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import {
  NotificationDispatcher,
  type NotificationEvent,
  type NotificationTransport,
} from '../server/notifications/dispatcher.ts';
import { ApprovalQueue } from '../server/orchestrator/approval-queue.ts';
import { Orchestrator } from '../server/orchestrator/orchestrator.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

const wfSimple = parseWorkflowMarkdown(
  `# Simple
## P
1. **+a:** root
   - Outputs: a.md
`,
  'simple',
);

const wfChainA = parseWorkflowMarkdown(
  `# A
- **Sonraki akış:** \`chain-b.md\`
## P
1. **+a:** root
   - Outputs: a.md
`,
  'chain-a',
);

const wfChainB = parseWorkflowMarkdown(
  `# B
## P
1. **+b:** root
   - Outputs: b.md
`,
  'chain-b',
);

const wfFailing = parseWorkflowMarkdown(
  `# Failing
- **Sonraki akış:** \`chain-b.md\`
## P
1. **+a:** root
   - Outputs: a.md
`,
  'failing',
);

class FakeTransport implements NotificationTransport {
  readonly sent: string[] = [];
  readonly channel = 'slack' as const;
  isEnabled(): boolean {
    return true;
  }
  async send(text: string, _payload: Record<string, unknown>): Promise<void> {
    this.sent.push(text);
  }
  hasKind(kind: NotificationEvent['kind']): boolean {
    return this.sent.some((line) => line.includes(kind));
  }
}

function loader(map: Record<string, WorkflowDefinition>) {
  return (id: string) => map[id] ?? null;
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-orch-'));
  const bundle = openDb({ path: join(tmpRoot, 'orch.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

function makeAcquireWorktree(opts: { acquireTimes?: number[]; releaseTimes?: number[] } = {}) {
  return async (runId: number) => {
    if (opts.acquireTimes) opts.acquireTimes.push(Date.now());
    const path = join(tmpRoot, `wt-${runId}`);
    mkdirSync(path, { recursive: true });
    return {
      path,
      release: async (_: { success: boolean }) => {
        if (opts.releaseTimes) opts.releaseTimes.push(Date.now());
      },
    };
  };
}

describe('Orchestrator.triggerWorkflow', () => {
  it('returns workflow-not-found when loader returns null', async () => {
    const orchestrator = new Orchestrator({
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadWorkflowById: loader({}),
      approvalQueue: new ApprovalQueue({ repos }),
    });
    const result = await orchestrator.triggerWorkflow('does-not-exist');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('workflow-not-found');
    }
    expect(repos.runs.listRuns()).toHaveLength(0);
  });

  it('runs the workflow on the happy path and dispatches start+success notifications', async () => {
    const transport = new FakeTransport();
    const dispatcher = new NotificationDispatcher({ repos, transports: [transport] });
    const orchestrator = new Orchestrator({
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadWorkflowById: loader({ simple: wfSimple }),
      approvalQueue: new ApprovalQueue({ repos }),
      dispatcher,
    });

    const result = await orchestrator.triggerWorkflow('simple');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.run.status).toBe('succeeded');
      expect(result.chainedRuns).toHaveLength(0);
    }
    expect(transport.hasKind('pipeline.started')).toBe(true);
    expect(transport.hasKind('pipeline.succeeded')).toBe(true);
  });

  it('chains nextWorkflowId on success and reports chained runs', async () => {
    const orchestrator = new Orchestrator({
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadWorkflowById: loader({ 'chain-a': wfChainA, 'chain-b': wfChainB }),
      approvalQueue: new ApprovalQueue({ repos }),
    });

    const result = await orchestrator.triggerWorkflow('chain-a');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.run.workflow_id).toBe('chain-a');
      expect(result.chainedRuns).toHaveLength(1);
      expect(result.chainedRuns[0]?.workflow_id).toBe('chain-b');
    }
  });

  it('dispatches pipeline.failed and skips chaining when a step fails', async () => {
    const transport = new FakeTransport();
    const dispatcher = new NotificationDispatcher({ repos, transports: [transport] });
    const orchestrator = new Orchestrator({
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1, fail: true })),
      loadWorkflowById: loader({ failing: wfFailing, 'chain-b': wfChainB }),
      approvalQueue: new ApprovalQueue({ repos }),
      dispatcher,
    });

    const result = await orchestrator.triggerWorkflow('failing');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.run.status).toBe('failed');
      expect(result.chainedRuns).toHaveLength(0);
    }
    expect(transport.hasKind('pipeline.failed')).toBe(true);
    expect(transport.hasKind('pipeline.succeeded')).toBe(false);
  });

  it('uses acquireWorktree so each run gets its own path', async () => {
    const acquires: number[] = [];
    const orchestrator = new Orchestrator({
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadWorkflowById: loader({ simple: wfSimple }),
      approvalQueue: new ApprovalQueue({ repos }),
      acquireWorktree: makeAcquireWorktree({ acquireTimes: acquires }),
    });
    const result = await orchestrator.triggerWorkflow('simple');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.run.worktree_path).toContain('wt-');
    }
    expect(acquires).toHaveLength(1);
  });
});

describe('Orchestrator.triggerMany — parallel runs', () => {
  it('starts multiple workflows in parallel, each in its own worktree', async () => {
    const orchestrator = new Orchestrator({
      repos,
      executor: new MockExecutor(() => ({ durationMs: 20 })),
      loadWorkflowById: loader({ simple: wfSimple }),
      approvalQueue: new ApprovalQueue({ repos }),
      acquireWorktree: makeAcquireWorktree(),
      maxParallelRuns: 5,
    });

    const results = await orchestrator.triggerMany(['simple', 'simple', 'simple']);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.ok)).toBe(true);

    const worktreePaths = results
      .map((r) => (r.ok ? r.run.worktree_path : null))
      .filter((p): p is string => Boolean(p));
    expect(new Set(worktreePaths).size).toBe(3); // all distinct
  });

  it('respects maxParallelRuns: third run waits until one completes', async () => {
    const acquireTimes: number[] = [];
    const releaseTimes: number[] = [];
    const orchestrator = new Orchestrator({
      repos,
      executor: new MockExecutor(() => ({ durationMs: 50 })),
      loadWorkflowById: loader({ simple: wfSimple }),
      approvalQueue: new ApprovalQueue({ repos }),
      acquireWorktree: makeAcquireWorktree({ acquireTimes, releaseTimes }),
      maxParallelRuns: 2,
    });

    await orchestrator.triggerMany(['simple', 'simple', 'simple']);
    // Three acquires + three releases total.
    expect(acquireTimes).toHaveLength(3);
    expect(releaseTimes).toHaveLength(3);
    // The third acquire must happen after the first release.
    const sortedAcquires = [...acquireTimes].sort((a, b) => a - b);
    const sortedReleases = [...releaseTimes].sort((a, b) => a - b);
    expect(sortedAcquires[2]).toBeGreaterThanOrEqual(sortedReleases[0]!);
  });

  it('isolates failures: one failed run does not abort the others', async () => {
    let counter = 0;
    const orchestrator = new Orchestrator({
      repos,
      // Fail only the second invocation.
      executor: new MockExecutor(() => {
        counter += 1;
        return { durationMs: 5, fail: counter === 2 };
      }),
      loadWorkflowById: loader({ simple: wfSimple }),
      approvalQueue: new ApprovalQueue({ repos }),
      maxParallelRuns: 3,
    });

    const results = await orchestrator.triggerMany(['simple', 'simple', 'simple']);
    const okCount = results.filter((r) => r.ok && r.run.status === 'succeeded').length;
    const failedCount = results.filter((r) => r.ok && r.run.status === 'failed').length;
    expect(okCount + failedCount).toBe(3);
    expect(failedCount).toBeGreaterThanOrEqual(1);
    expect(okCount).toBeGreaterThanOrEqual(1);
  });

  it('reports workflow-not-found per-item without blocking the rest', async () => {
    const orchestrator = new Orchestrator({
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadWorkflowById: loader({ simple: wfSimple }),
      approvalQueue: new ApprovalQueue({ repos }),
      maxParallelRuns: 5,
    });

    const results = await orchestrator.triggerMany(['simple', 'does-not-exist', 'simple']);
    expect(results).toHaveLength(3);
    expect(results[1]?.ok).toBe(false);
    if (results[1] && !results[1].ok) {
      expect(results[1].reason).toBe('workflow-not-found');
    }
    expect(results.filter((r) => r.ok).length).toBe(2);
  });
});

describe('Orchestrator.start — blueprint watcher integration', () => {
  it('triggers the configured workflow when blueprint flips to approved', async () => {
    const blueprintPath = join(tmpRoot, 'blueprint.md');
    writeFileSync(blueprintPath, '---\nstatus: draft\n---\n# bp\n', 'utf8');

    const orchestrator = new Orchestrator({
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadWorkflowById: loader({ simple: wfSimple }),
      approvalQueue: new ApprovalQueue({ repos }),
      blueprint: { filePath: blueprintPath, triggerWorkflowId: 'simple' },
    });

    const triggerSpy = vi.spyOn(orchestrator, 'triggerWorkflow');
    orchestrator.start();

    // Flip to approved and let the watcher's handleChange pick it up.
    writeFileSync(blueprintPath, '---\nstatus: approved\n---\n# bp\n', 'utf8');
    // The watcher only reads on handleChange — call it manually since fs.watch
    // timing is OS-dependent.
    await orchestrator.handleBlueprintChange();

    expect(triggerSpy).toHaveBeenCalledWith('simple');
    orchestrator.stop();
  });

  it('stop() is safe to call even when start() was never called', () => {
    const orchestrator = new Orchestrator({
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadWorkflowById: loader({}),
      approvalQueue: new ApprovalQueue({ repos }),
    });
    expect(() => orchestrator.stop()).not.toThrow();
  });
});
