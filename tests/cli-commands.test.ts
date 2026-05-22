import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { startCommand, approveCommand, statusCommand } from '../server/cli/commands.ts';
import { ApprovalQueue } from '../server/orchestrator/approval-queue.ts';

let tmpRoot: string;
let workflowsDir: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-cli-'));
  workflowsDir = join(tmpRoot, 'workflows');
  mkdirSync(workflowsDir, { recursive: true });
  writeFileSync(
    join(workflowsDir, 'demo.md'),
    `# Demo (\`!start demo\`)

## P
1. **+only:** root
   - Outputs: out.md
`,
    'utf8',
  );
  const bundle = openDb({ path: join(tmpRoot, 'cli.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('startCommand', () => {
  it('runs the workflow with the mock executor and returns succeeded', async () => {
    const result = await startCommand({
      repos,
      workflowsDir,
      workflowId: 'demo',
      executor: 'mock',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.runId).toBeGreaterThan(0);
      expect(result.status).toBe('succeeded');
    }
  });

  it('returns ok=false when the workflow id cannot be resolved', async () => {
    const result = await startCommand({
      repos,
      workflowsDir,
      workflowId: 'does-not-exist',
      executor: 'mock',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorMessage).toMatch(/not found/i);
    }
  });

  it('returns ok=false with a clear reason when the workflow file has no steps', async () => {
    writeFileSync(join(workflowsDir, 'broken.md'), '# Title only\n\nno steps\n', 'utf8');

    const result = await startCommand({
      repos,
      workflowsDir,
      workflowId: 'broken',
      executor: 'mock',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorMessage).toMatch(/empty|no steps/i);
    }
  });
});

describe('approveCommand', () => {
  it('answers the oldest open question for the run', async () => {
    const run = repos.runs.createRun({
      workflow_id: 'demo',
      item_id: null,
      status: 'running',
      worktree_path: null,
      triggered_by: 'test',
    });
    const queue = new ApprovalQueue({ repos });
    const q = queue.enqueue({ runId: run.id, question: 'go?', choices: [] });

    const result = await approveCommand({
      repos,
      queue,
      runId: run.id,
      answer: 'approve',
      answeredBy: 'eray-cli',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.questionId).toBe(q.id);
    }

    const reloaded = repos.pendingQuestions.get(q.id);
    expect(reloaded?.status).toBe('answered');
    expect(reloaded?.answered_by).toBe('eray-cli');
  });

  it('returns ok=false when no open question exists for the run', async () => {
    const queue = new ApprovalQueue({ repos });
    const result = await approveCommand({
      repos,
      queue,
      runId: 999,
      answer: 'approve',
      answeredBy: 'cli',
    });
    expect(result.ok).toBe(false);
  });
});

describe('statusCommand', () => {
  it('returns recent runs and open questions', async () => {
    const run = repos.runs.createRun({
      workflow_id: 'demo',
      item_id: null,
      status: 'running',
      worktree_path: null,
      triggered_by: 'test',
    });
    const queue = new ApprovalQueue({ repos });
    queue.enqueue({ runId: run.id, question: 'pending', choices: [] });

    const result = statusCommand({ repos });
    expect(result.recentRuns.length).toBeGreaterThanOrEqual(1);
    expect(result.openQuestions).toHaveLength(1);
    expect(result.openQuestions[0]?.run_id).toBe(run.id);
  });
});
