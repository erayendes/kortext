import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';

/**
 * countRunningSteps / listRunningSteps must only see steps of LIVE runs. A run
 * cancelled or failed mid-flight can leave 'running' step rows behind; those
 * zombies must not inflate the footer's "N active" (UAT 2026-06-19: a port-bind
 * failure left a cancelled run whose stuck steps made the footer read "3 active"
 * while one agent was working).
 */
let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-running-steps-'));
  const bundle = openDb({ path: join(tmpRoot, 'test.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

function runningStep(runId: number, index: number) {
  const step = repos.runs.addStep({
    run_id: runId,
    step_index: index,
    step_name: `step-${index}`,
    persona: '+a',
    status: 'pending',
  });
  repos.runs.transitionStep(step.id, 'running');
  return step;
}

describe('countRunningSteps / listRunningSteps — live runs only', () => {
  it('ignores running steps left behind by a cancelled run', () => {
    // Live run with one running step.
    const live = repos.runs.createRun({
      workflow_id: 'wf', item_id: null, status: 'queued', worktree_path: null, triggered_by: 't',
    });
    repos.runs.transitionRun(live.id, 'running');
    runningStep(live.id, 0);

    // Cancelled run that left two 'running' step zombies (mid-flight kill).
    const dead = repos.runs.createRun({
      workflow_id: 'wf', item_id: null, status: 'queued', worktree_path: null, triggered_by: 't',
    });
    repos.runs.transitionRun(dead.id, 'running');
    runningStep(dead.id, 0);
    runningStep(dead.id, 1);
    repos.runs.transitionRun(dead.id, 'cancelled');

    expect(repos.runs.countRunningSteps()).toBe(1);
    const list = repos.runs.listRunningSteps();
    expect(list).toHaveLength(1);
    expect(list[0]!.run_id).toBe(live.id);
  });

  it('counts steps of an awaiting_approval run (still live)', () => {
    const run = repos.runs.createRun({
      workflow_id: 'wf', item_id: null, status: 'queued', worktree_path: null, triggered_by: 't',
    });
    repos.runs.transitionRun(run.id, 'running');
    runningStep(run.id, 0);
    repos.runs.transitionRun(run.id, 'awaiting_approval');
    expect(repos.runs.countRunningSteps()).toBe(1);
  });
});
