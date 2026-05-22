import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { resumeOrphanedRuns } from '../server/orchestrator/resume.ts';
import { Orchestrator } from '../server/orchestrator/orchestrator.ts';
import { ApprovalQueue } from '../server/orchestrator/approval-queue.ts';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import { parseWorkflowMarkdown } from '../server/engine/workflow-parser.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

const wfGated = parseWorkflowMarkdown(
  `# Gated
## Phase 1
1. **+a:** first
   - Outputs: a.md

> [!NOTE] RAPOR HAZIR
> +prime, !approve next

## Phase 2
2. **+b:** second
   - Outputs: b.md
`,
  'gated-resume',
);

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-resume-'));
  const bundle = openDb({ path: join(tmpRoot, 'resume.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

function seedRun(status: 'running' | 'succeeded' | 'failed' | 'cancelled') {
  const run = repos.runs.createRun({
    workflow_id: 'wf',
    item_id: null,
    status: 'queued',
    worktree_path: null,
    triggered_by: 'test',
  });
  if (status === 'running') {
    repos.runs.transitionRun(run.id, 'running');
  } else {
    repos.runs.transitionRun(run.id, 'running');
    repos.runs.transitionRun(run.id, status);
  }
  return run.id;
}

describe('resumeOrphanedRuns', () => {
  it('flips running runs to cancelled with an orphaned: error message', () => {
    const a = seedRun('running');
    const b = seedRun('running');
    const summary = resumeOrphanedRuns(repos);
    expect(summary.recovered).toContain(a);
    expect(summary.recovered).toContain(b);

    const ra = repos.runs.getRun(a)!;
    const rb = repos.runs.getRun(b)!;
    expect(ra.status).toBe('cancelled');
    expect(rb.status).toBe('cancelled');
    expect(ra.error_message).toBe('orphaned: server restarted');
    expect(rb.error_message).toBe('orphaned: server restarted');
  });

  it('does not touch runs that ended in a terminal status', () => {
    const succeededId = seedRun('succeeded');
    const failedId = seedRun('failed');
    const cancelledId = seedRun('cancelled');
    const runningId = seedRun('running');

    const summary = resumeOrphanedRuns(repos);
    expect(summary.recovered).toEqual([runningId]);
    expect(repos.runs.getRun(succeededId)!.status).toBe('succeeded');
    expect(repos.runs.getRun(failedId)!.status).toBe('failed');
    expect(repos.runs.getRun(cancelledId)!.status).toBe('cancelled');
  });

  it('records an audit-log entry per recovered run', () => {
    const id = seedRun('running');
    resumeOrphanedRuns(repos);
    const entries = repos.auditLog.list({ resource_id: String(id) });
    const recovered = entries.find((e) => e.action === 'run.orphaned-recovered');
    expect(recovered).toBeDefined();
    expect(recovered?.payload).toMatchObject({ previous_status: 'running' });
  });

  it('returns an empty summary when no orphans exist', () => {
    seedRun('succeeded');
    const summary = resumeOrphanedRuns(repos);
    expect(summary.recovered).toEqual([]);
  });
});

describe('Orchestrator.retryRun — orphaned recovery', () => {
  it('accepts retry for runs cancelled with orphaned: prefix', async () => {
    // Seed a run that was halfway through when the server died:
    // step 0 succeeded, then 'running' was the run status, gate pending.
    const run = repos.runs.createRun({
      workflow_id: 'gated-resume',
      item_id: null,
      status: 'queued',
      worktree_path: join(tmpRoot, 'wt-orph'),
      triggered_by: 'orchestrator',
    });
    repos.runs.transitionRun(run.id, 'running');
    const step1 = repos.runs.addStep({
      run_id: run.id,
      step_index: 0,
      step_name: 'Phase 1 — +a',
      persona: '+a',
      status: 'pending',
    });
    repos.runs.transitionStep(step1.id, 'running');
    repos.runs.transitionStep(step1.id, 'succeeded');
    repos.runs.addStep({
      run_id: run.id,
      step_index: 1,
      step_name: 'Phase 2 — +b',
      persona: '+b',
      status: 'pending',
    });

    // Server "restarts" — resume orphan.
    resumeOrphanedRuns(repos);
    const orphaned = repos.runs.getRun(run.id)!;
    expect(orphaned.status).toBe('cancelled');
    expect(orphaned.error_message).toContain('orphaned:');

    // User retries.
    const orchestrator = new Orchestrator({
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadWorkflowById: (id) => (id === 'gated-resume' ? wfGated : null),
      approvalQueue: new ApprovalQueue({ repos }),
      gateController: { pauseAtGate: async () => ({ decision: 'approve' }) },
    });

    const retried = await orchestrator.retryRun(run.id);
    expect(retried.ok).toBe(true);
    if (retried.ok) {
      expect(retried.run.status).toBe('succeeded');
      // The succeeded step from the original run is marked as skipped (resumed).
      const steps = repos.runs.listSteps(retried.run.id);
      const first = steps.find((s) => s.step_index === 0);
      expect(first?.status).toBe('skipped');
      expect(first?.output_summary).toBe('resumed-from-previous-run');
      // And the second step actually ran this time.
      const second = steps.find((s) => s.step_index === 1);
      expect(second?.status).toBe('succeeded');
    }
  });
});
