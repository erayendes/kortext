import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { parseWorkflowMarkdown } from '../server/engine/workflow-parser.ts';
import { buildGraph } from '../server/engine/dag.ts';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import { MockGateExecutor } from '../server/engine/executors/mock-gate-executor.ts';
import { runWorkflow } from '../server/engine/worker-pool.ts';
import { runTestCycle } from '../server/orchestrator/test-cycle.ts';
import { ItemLifecycle } from '../server/engine/item-lifecycle.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';

// UAT #10 Faz 1 — token/cost telemetry must travel from the executor result all
// the way to the persisted run_step / gate_run, so the dashboard can attribute
// spend per item + gate.

let tmpRoot: string;
let agentsDir: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-usage-wire-'));
  agentsDir = join(tmpRoot, 'agents');
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, 'backend-developer.md'),
    '# backend-developer\n\n- description: builds.\n\n## identity\nbody\n',
  );
  const bundle = openDb({ path: join(tmpRoot, 'wire.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('dev-cycle usage wiring (worker pool → run_steps)', () => {
  it('persists the executor result usage onto the run_step', async () => {
    const wf = parseWorkflowMarkdown(
      `# One Step\n\n## P\n1. **+backend-developer:** do it\n   - Outputs: a.md\n`,
      'one',
    );
    const usage = {
      executor: 'claude-cli',
      input_tokens: 3000,
      output_tokens: 200,
      cache_read_input_tokens: 2800,
      total_cost_usd: 0.05,
    };
    const result = await runWorkflow(
      buildGraph(wf),
      new MockExecutor(() => ({ durationMs: 1, usage })),
      repos,
      { concurrency: 1 },
    );
    expect(result.run.status).toBe('succeeded');
    const steps = repos.runs.listSteps(result.run.id);
    expect(steps[0]?.usage_metadata).toEqual(usage);
  });
});

describe('gate-cycle usage wiring (test-cycle → gate_runs)', () => {
  it('persists the gate outcome usage onto the gate_run', async () => {
    const lc = new ItemLifecycle({ repos, personas: loadPersonasFromDir(agentsDir) });
    lc.create({ id: 'T01', type: 'task', title: 'T01' });
    repos.backlog.setReviewGates('T01', ['code_review']);
    lc.transition('T01', 'start', '+backend-developer');
    lc.transition('T01', 'test', '+backend-developer');

    const usage = { executor: 'claude-cli', input_tokens: 1500, output_tokens: 80 };
    const result = await runTestCycle('T01', {
      repos,
      lifecycle: lc,
      gateExecutor: new MockGateExecutor(() => ({ usage })),
    });
    expect(result.outcome).toBe('review');
    const gr = repos.gateRuns.listForItem('T01').find((g) => g.gate === 'code_review');
    expect(gr?.usage_metadata).toEqual(usage);
  });
});
