import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import type { Executor } from '../server/engine/executor.ts';
import { ItemLifecycle } from '../server/engine/item-lifecycle.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { MockGateExecutor } from '../server/engine/executors/mock-gate-executor.ts';
import { parseWorkflowMarkdown } from '../server/engine/workflow-parser.ts';
import { buildGraph } from '../server/engine/dag.ts';
import { RunRegistry } from '../server/engine/run-registry.ts';
import { runTestCycle } from '../server/orchestrator/test-cycle.ts';
import { runItem } from '../server/orchestrator/run-item.ts';

// UAT #10 Faz 2 — "akıllı retry": a gate fail must hand its FINDINGS to the next
// dev turn so the agent fixes the real problem instead of re-coding blind (which
// burns full-context tokens to fail the same way). This also revives the
// half-built `frontmatter.revision_directive` (previously written, never read).

const devCycleWf = parseWorkflowMarkdown(
  `# Development Cycle\n## Build\n1. **+backend-developer:** implement the item\n   - Outputs: impl.md\n`,
  'development-cycle',
);

let tmpRoot: string;
let agentsDir: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-retry-'));
  agentsDir = join(tmpRoot, 'agents');
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, 'backend-developer.md'),
    '# backend-developer\n\n- description: builds.\n\n## identity\nbody\n',
  );
  const bundle = openDb({ path: join(tmpRoot, 'retry.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

function lifecycle() {
  return new ItemLifecycle({ repos, personas: loadPersonasFromDir(agentsDir) });
}

describe('test-cycle bounce → records a revision_directive (Faz 2.1)', () => {
  it('writes the failing gate findings onto frontmatter.revision_directive', async () => {
    const lc = lifecycle();
    lc.create({ id: 'T01', type: 'task', title: 'T01' });
    repos.backlog.setReviewGates('T01', ['code_review', 'design_review']);
    lc.transition('T01', 'start', '+backend-developer');
    lc.transition('T01', 'test', '+backend-developer');

    const res = await runTestCycle('T01', {
      repos,
      lifecycle: lc,
      gateExecutor: new MockGateExecutor((ctx) =>
        ctx.gate === 'design_review'
          ? { fail: true, findings: 'contrast too low on the submit button' }
          : {},
      ),
    });

    expect(res.outcome).toBe('bounced');
    const item = repos.backlog.get('T01');
    expect(item?.status).toBe('in_progress');
    const directive = String(item?.frontmatter.revision_directive ?? '');
    expect(directive).toContain('design_review');
    expect(directive).toContain('contrast too low on the submit button');
  });
});

describe('run-item re-code consumes the revision_directive (Faz 2.2)', () => {
  it('threads the directive into the dev-cycle prompt, then clears it (one-shot)', async () => {
    const lc = lifecycle();
    lc.create({ id: 'B1', type: 'task', title: 'B1' });
    lc.transition('B1', 'start', '+backend-developer'); // in_progress (bounced)
    const fm = repos.backlog.get('B1')!.frontmatter;
    repos.backlog.updateFrontmatter('B1', {
      ...fm,
      revision_directive: 'fix the contrast on the submit button',
    });

    let seen: string | undefined = 'UNSET';
    const spy: Executor = {
      name: 'spy',
      async execute(_step, ctx) {
        seen = ctx.reviseFeedback;
        return { ok: true, outputSummary: 'ok' };
      },
    };

    const result = await runItem('B1', {
      repos,
      lifecycle: lc,
      executor: spy,
      graph: buildGraph(devCycleWf),
      acquireWorktree: async (id) => ({ path: `/tmp/wt/${id}`, release: async () => {} }),
      registry: new RunRegistry(),
    });

    expect(result.outcome).toBe('implemented');
    // The recorded directive reached the executor's prompt context…
    expect(seen).toBe('fix the contrast on the submit button');
    // …and was consumed one-shot (no stale directive lingers for the next run).
    expect(repos.backlog.get('B1')?.frontmatter.revision_directive).toBeUndefined();
  });

  it('a fresh item with no directive re-codes with no revise feedback', async () => {
    const lc = lifecycle();
    lc.create({ id: 'B2', type: 'task', title: 'B2' });

    let seen: string | undefined = 'UNSET';
    const spy: Executor = {
      name: 'spy',
      async execute(_step, ctx) {
        seen = ctx.reviseFeedback;
        return { ok: true, outputSummary: 'ok' };
      },
    };

    await runItem('B2', {
      repos,
      lifecycle: lc,
      executor: spy,
      graph: buildGraph(devCycleWf),
      acquireWorktree: async (id) => ({ path: `/tmp/wt/${id}`, release: async () => {} }),
      registry: new RunRegistry(),
    });

    expect(seen).toBeUndefined();
  });
});
