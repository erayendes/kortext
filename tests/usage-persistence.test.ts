import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';

// UAT #10 Faz 1 — per-step token/cost is written on the step/gate transition and
// read back as a parsed object (mirrors the metadata JSON-column convention).

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-usage-'));
  const bundle = openDb({ path: join(tmpRoot, 'usage.db') });
  db = bundle.db;
  repos = bundle.repositories;
  repos.backlog.create({ id: 'T01', type: 'task', title: 'login form' });
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

function seedStep() {
  const run = repos.runs.createRun({
    workflow_id: 'wf',
    item_id: 'T01',
    status: 'queued',
    worktree_path: null,
    triggered_by: 't',
  });
  return repos.runs.addStep({ run_id: run.id, step_index: 0, step_name: 'dev' });
}

describe('RunsRepository — usage_metadata', () => {
  it('persists usage on transitionStep and returns it parsed', () => {
    const step = seedStep();
    repos.runs.transitionStep(step.id, 'succeeded', {
      usage_metadata: {
        executor: 'claude-cli',
        input_tokens: 2500,
        output_tokens: 450,
        cache_read_input_tokens: 2100,
        total_cost_usd: 0.0423,
      },
    });
    const got = repos.runs.getStep(step.id);
    expect(got?.usage_metadata).toEqual({
      executor: 'claude-cli',
      input_tokens: 2500,
      output_tokens: 450,
      cache_read_input_tokens: 2100,
      total_cost_usd: 0.0423,
    });
  });

  it('leaves usage_metadata null when not provided', () => {
    const step = seedStep();
    repos.runs.transitionStep(step.id, 'succeeded', { output_summary: 'done' });
    expect(repos.runs.getStep(step.id)?.usage_metadata).toBeNull();
  });

  it('a corrupt usage_metadata column does not throw on read (falls back to null)', () => {
    // These schemas are parsed on EVERY run_step read; a single malformed row
    // must not crash reads of the whole item's run history.
    const step = seedStep();
    db.prepare("UPDATE run_steps SET usage_metadata = '{not valid json' WHERE id = ?").run(step.id);
    expect(() => repos.runs.getStep(step.id)).not.toThrow();
    expect(repos.runs.getStep(step.id)?.usage_metadata).toBeNull();
  });
});

describe('GateRunsRepository — usage_metadata', () => {
  it('persists usage on transition alongside findings', () => {
    const gr = repos.gateRuns.create({
      item_id: 'T01',
      gate: 'code_review',
      persona: '+engineering-manager',
    });
    repos.gateRuns.transition(gr.id, 'fail', {
      findings: 'missing tests',
      usage_metadata: { executor: 'claude-cli', input_tokens: 1200, output_tokens: 90 },
    });
    const got = repos.gateRuns.get(gr.id);
    expect(got?.findings).toBe('missing tests');
    expect(got?.usage_metadata).toEqual({
      executor: 'claude-cli',
      input_tokens: 1200,
      output_tokens: 90,
    });
  });

  it('leaves usage_metadata null when not provided', () => {
    const gr = repos.gateRuns.create({ item_id: 'T01', gate: 'quality_control', persona: '+qa-engineer' });
    repos.gateRuns.transition(gr.id, 'pass', {});
    expect(repos.gateRuns.get(gr.id)?.usage_metadata).toBeNull();
  });
});
