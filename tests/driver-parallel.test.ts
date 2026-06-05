import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { ItemLifecycle } from '../server/engine/item-lifecycle.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { parseWorkflowMarkdown } from '../server/engine/workflow-parser.ts';
import { buildGraph } from '../server/engine/dag.ts';
import type { GateExecutor, GateOutcome } from '../server/engine/gate-executor.ts';
import type { Composition } from '../server/orchestrator/composition.ts';
import { driveReadyItems } from '../server/orchestrator/driver.ts';
import type { Gate } from '../server/db/schemas.ts';

let tmpRoot: string;
let agentsDir: string;
let db: Database.Database;
let repos: Repositories;

const devCycleWf = parseWorkflowMarkdown(
  `# Development Cycle
## Build
1. **+backend-developer:** implement
   - Outputs: impl.md
`,
  'development-cycle',
);

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-dpar-'));
  agentsDir = join(tmpRoot, 'agents');
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, 'backend-developer.md'),
    '# backend-developer\n\n- description: builds.\n\n## identity\nbody\n',
  );
  const bundle = openDb({ path: join(tmpRoot, 'dpar.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

/** A gate executor that records how many gate judgments overlap in time. */
class ConcurrencyProbeGateExecutor implements GateExecutor {
  readonly name = 'concurrency-probe';
  inFlight = 0;
  maxInFlight = 0;
  async runGate(): Promise<GateOutcome> {
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    await new Promise((r) => setTimeout(r, 15));
    this.inFlight -= 1;
    return { pass: true };
  }
}

function seedItemInTest(lc: ItemLifecycle, id: string, gates: Gate[]) {
  lc.create({ id, type: 'task', title: id });
  repos.backlog.setReviewGates(id, gates);
  lc.transition(id, 'start', '+backend-developer');
  lc.transition(id, 'test', '+backend-developer');
}

describe('driveReadyItems — Phase 2 (test) runs items in parallel', () => {
  it('judges multiple test items concurrently and moves them all to review', async () => {
    const lc = new ItemLifecycle({ repos, personas: loadPersonasFromDir(agentsDir) });
    seedItemInTest(lc, 'T1', ['code_review']);
    seedItemInTest(lc, 'T2', ['code_review']);
    seedItemInTest(lc, 'T3', ['code_review']);

    const gateExecutor = new ConcurrencyProbeGateExecutor();

    // Minimal composition: no `to_do` items → Phase 1 is a no-op. The items have
    // no `uat` gate, so Phase 3 needs no approver; a trivially-succeeding merger
    // + resolution let them walk test → review → done in this single pass. Only
    // the probed gate executor (Phase 2) is exercised for concurrency.
    const composition = {
      repos,
      gateExecutor,
      merger: { close: async () => ({ ok: true as const }) },
      deployer: {},
      resolution: { forget: () => {} },
    } as unknown as Composition;

    const result = await driveReadyItems({
      composition,
      lifecycle: lc,
      graph: buildGraph(devCycleWf),
    });

    // All three items were judged in Phase 2 and walked through to done.
    expect(result.tested.map((r) => r.itemId).sort()).toEqual(['T1', 'T2', 'T3']);
    expect(result.tested.every((r) => r.outcome === 'review')).toBe(true);
    expect(repos.backlog.get('T1')?.status).toBe('done');
    expect(repos.backlog.get('T2')?.status).toBe('done');
    expect(repos.backlog.get('T3')?.status).toBe('done');

    // The decisive assertion: the three gate judgments overlapped in time.
    // The old `for ... await` loop would cap this at 1.
    expect(gateExecutor.maxInFlight).toBeGreaterThanOrEqual(2);
  });
});
