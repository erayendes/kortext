import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import type { GateRun, RunStep } from '../server/db/schemas.ts';
import { rollupItemUsage } from '../server/orchestrator/usage-rollup.ts';
import { backlogRouter } from '../server/routes/backlog.ts';

// UAT #10 Faz 1 — the dashboard answers "hangi item/gate ne kadar yaktı". This
// covers the item-scoped step query, the pure rollup, and the surfacing route.

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-roll-'));
  const bundle = openDb({ path: join(tmpRoot, 'roll.db') });
  db = bundle.db;
  repos = bundle.repositories;
  repos.backlog.create({ id: 'T01', type: 'task', title: 'one' });
  repos.backlog.create({ id: 'T02', type: 'task', title: 'two' });
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('RunsRepository.listStepsForItem', () => {
  it('returns only the steps belonging to that item’s runs', () => {
    const r1 = repos.runs.createRun({
      workflow_id: 'wf',
      item_id: 'T01',
      status: 'queued',
      worktree_path: null,
      triggered_by: 't',
    });
    const s1 = repos.runs.addStep({ run_id: r1.id, step_index: 0, step_name: 'dev' });
    repos.runs.transitionStep(s1.id, 'succeeded', {
      usage_metadata: { executor: 'claude-cli', input_tokens: 1000, output_tokens: 50 },
    });
    const r2 = repos.runs.createRun({
      workflow_id: 'wf',
      item_id: 'T02',
      status: 'queued',
      worktree_path: null,
      triggered_by: 't',
    });
    repos.runs.addStep({ run_id: r2.id, step_index: 0, step_name: 'dev' });

    const steps = repos.runs.listStepsForItem('T01');
    expect(steps).toHaveLength(1);
    expect(steps[0]?.usage_metadata?.input_tokens).toBe(1000);
  });
});

function step(usage: RunStep['usage_metadata']): RunStep {
  return {
    id: 1,
    run_id: 1,
    step_index: 0,
    step_name: 'dev',
    persona: null,
    status: 'succeeded',
    started_at: null,
    ended_at: null,
    log_path: null,
    output_summary: null,
    error_message: null,
    usage_metadata: usage,
  };
}
function gateRun(
  gate: GateRun['gate'],
  attempt: number,
  status: GateRun['status'],
  usage: GateRun['usage_metadata'],
): GateRun {
  return {
    id: 1,
    item_id: 'T01',
    gate,
    persona: null,
    attempt,
    status,
    findings: null,
    created_at: 1,
    ended_at: null,
    usage_metadata: usage,
  };
}

describe('rollupItemUsage', () => {
  it('sums coding steps + gate runs into a per-item total', () => {
    const steps = [
      step({ executor: 'claude-cli', input_tokens: 1000, output_tokens: 50, total_cost_usd: 0.02 }),
      step(null),
    ];
    const gates = [
      gateRun('code_review', 1, 'pass', {
        executor: 'claude-cli',
        input_tokens: 500,
        output_tokens: 30,
        total_cost_usd: 0.01,
      }),
      gateRun('design_review', 1, 'fail', null),
    ];
    const roll = rollupItemUsage(steps, gates);

    expect(roll.coding.input_tokens).toBe(1000);
    expect(roll.coding.output_tokens).toBe(50);
    expect(roll.total.input_tokens).toBe(1500);
    expect(roll.total.output_tokens).toBe(80);
    expect(roll.total.total_cost_usd).toBeCloseTo(0.03);
    expect(roll.gates).toHaveLength(2);
    expect(roll.gates[0]).toMatchObject({ gate: 'code_review', attempt: 1, status: 'pass' });
    expect(roll.gates[0]?.usage?.input_tokens).toBe(500);
    expect(roll.gates[1]?.usage).toBeNull();
  });

  it('is all-zero when nothing recorded usage', () => {
    const roll = rollupItemUsage([step(null)], [gateRun('uat', 1, 'pass', null)]);
    expect(roll.total).toEqual({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      total_cost_usd: 0,
    });
  });
});

function appServer(): express.Express {
  const a = express();
  a.use(express.json());
  a.use('/api', backlogRouter({ repos }));
  return a;
}

async function call(a: express.Express, path: string): Promise<{ status: number; body: any }> {
  const { createServer } = await import('node:http');
  return new Promise((resolveP, reject) => {
    const server = createServer(a);
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      void fetch(`http://127.0.0.1:${port}${path}`)
        .then(async (res) => {
          const text = await res.text();
          server.close(() => resolveP({ status: res.status, body: text ? JSON.parse(text) : null }));
        })
        .catch((e) => server.close(() => reject(e)));
    });
  });
}

describe('GET /api/backlog/:id/usage', () => {
  it('404s for an unknown item', async () => {
    const res = await call(appServer(), '/api/backlog/NOPE/usage');
    expect(res.status).toBe(404);
  });

  it('returns the per-item usage rollup', async () => {
    const run = repos.runs.createRun({
      workflow_id: 'wf',
      item_id: 'T01',
      status: 'queued',
      worktree_path: null,
      triggered_by: 't',
    });
    const s = repos.runs.addStep({ run_id: run.id, step_index: 0, step_name: 'dev' });
    repos.runs.transitionStep(s.id, 'succeeded', {
      usage_metadata: { executor: 'claude-cli', input_tokens: 1000, output_tokens: 50, total_cost_usd: 0.02 },
    });
    const gr = repos.gateRuns.create({ item_id: 'T01', gate: 'code_review', persona: '+engineering-manager' });
    repos.gateRuns.transition(gr.id, 'pass', {
      usage_metadata: { executor: 'claude-cli', input_tokens: 500, output_tokens: 30, total_cost_usd: 0.01 },
    });

    const res = await call(appServer(), '/api/backlog/T01/usage');
    expect(res.status).toBe(200);
    expect(res.body.total.input_tokens).toBe(1500);
    expect(res.body.total.total_cost_usd).toBeCloseTo(0.03);
    expect(res.body.gates).toHaveLength(1);
    expect(res.body.gates[0].gate).toBe('code_review');
    expect(res.body.gates[0].usage.input_tokens).toBe(500);
  });
});
