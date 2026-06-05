import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { parseWorkflowMarkdown } from '../server/engine/workflow-parser.ts';
import { buildGraph } from '../server/engine/dag.ts';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import { runWorkflow, type GateController } from '../server/engine/worker-pool.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

// Two independent gated artifacts (LEGAL ∥ GROWTH) that both feed a third,
// gate-less consolidation step (PRD). Neither A nor B depends on the other —
// only on the external blueprint — so the data-flow DAG places them in the
// same layer. They must run AND await approval in parallel; PRD waits for both.
const wfParallel = parseWorkflowMarkdown(
  `# Parallel Gated

## Analysis
1. **+legal:** produce legal
   - Inputs: BRD.md
   - Outputs: legal.md
   - approver: +prime
2. **+growth:** produce growth
   - Inputs: BRD.md
   - Outputs: growth.md
   - approver: +prime

## Consolidate
3. **+pm:** consolidate
   - Inputs: legal.md, growth.md
   - Outputs: prd.md
`,
  'parallel-gated',
);

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-pgate-'));
  const bundle = openDb({ path: join(tmpRoot, 'pgate.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('runWorkflow — parallel gates (LEGAL ∥ GROWTH)', () => {
  it('holds BOTH sibling gates pending at once, then runs the dependent after both approve', async () => {
    const graph = buildGraph(wfParallel);
    const executor = new MockExecutor(() => ({ durationMs: 5 }));

    // The controller only resolves each gate once BOTH gates have arrived.
    // If the engine could hold just one pending gate at a time, the second
    // pauseAtGate would never be called and this would deadlock (test timeout).
    let arrived = 0;
    let release!: () => void;
    const bothArrived = new Promise<void>((r) => {
      release = () => {
        arrived += 1;
        if (arrived === 2) r();
      };
    });
    const pausedArtifacts: string[] = [];

    const controller: GateController = {
      pauseAtGate: async ({ gate }) => {
        pausedArtifacts.push(gate.artifactPath ?? gate.phase);
        release();
        await bothArrived;
        return { decision: 'approve' };
      },
    };

    const result = await runWorkflow(graph, executor, repos, {
      concurrency: 3,
      gates: wfParallel.gates,
      gateController: controller,
    });

    expect(result.run.status).toBe('succeeded');
    // Both sibling gates were pending simultaneously.
    expect(arrived).toBe(2);
    expect(pausedArtifacts).toHaveLength(2);
    // The two siblings actually executed concurrently.
    expect(executor.maxConcurrent).toBeGreaterThanOrEqual(2);
    // The dependent (PRD) ran, and only after both siblings were done.
    const prdKey = [...graph.nodes.keys()].find((k) => k.startsWith('consolidate'))!;
    expect(executor.startedOrder).toContain(prdKey);
    const legalKey = [...graph.nodes.keys()].find((k) => k.endsWith('.1') && k.startsWith('analysis'))!;
    const growthKey = [...graph.nodes.keys()].find((k) => k.endsWith('.2') && k.startsWith('analysis'))!;
    expect(executor.startedOrder.indexOf(prdKey)).toBeGreaterThan(
      executor.startedOrder.indexOf(legalKey),
    );
    expect(executor.startedOrder.indexOf(prdKey)).toBeGreaterThan(
      executor.startedOrder.indexOf(growthKey),
    );
  });
});
