import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import { parseBacklogYaml } from '../server/engine/backlog-ingest.ts';
import type { WorkflowStep } from '../server/engine/workflow-parser.ts';
import type { ExecutorContext } from '../server/engine/executor.ts';

let dir: string;
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

function step(p: Partial<WorkflowStep>): WorkflowStep {
  return { key: 'k', index: 0, phase: 'P', persona: '+x', description: '', inputs: [], outputs: [], approver: null, reviewer: null, ...p };
}
function ctx(wt: string): ExecutorContext {
  return { signal: new AbortController().signal, worktreePath: wt } as ExecutorContext;
}

describe('MockExecutor fixtures (product mock)', () => {
  it('writes declared file outputs; backlog.yaml is a real, ownable backlog', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mockfix-'));
    const ex = new MockExecutor(() => ({ durationMs: 1 }), true);
    await ex.execute(step({ outputs: ['.kortext/references/LEGAL.md', 'backlog-drafted'] }), ctx(dir));
    await ex.execute(step({ outputs: ['.kortext/foundation/backlog.yaml'] }), ctx(dir));

    expect(existsSync(join(dir, '.kortext/references/LEGAL.md'))).toBe(true);
    expect(existsSync(join(dir, 'backlog-drafted'))).toBe(false); // signal, not a file

    const { items, errors } = parseBacklogYaml(readFileSync(join(dir, '.kortext/foundation/backlog.yaml'), 'utf8'));
    expect(errors).toHaveLength(0);
    expect(items.filter((i) => i.type === 'epic').length).toBeGreaterThanOrEqual(2);
    expect(items.some((i) => i.owner === '+prime')).toBe(true); // a human prereq item exists
  });

  it('default (no flag) writes nothing — engine tests stay file-free', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mockfix-'));
    await new MockExecutor().execute(step({ outputs: ['.kortext/references/LEGAL.md'] }), ctx(dir));
    expect(existsSync(join(dir, '.kortext/references/LEGAL.md'))).toBe(false);
  });
});
