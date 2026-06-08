import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { loadWorkflowsFromDir } from '../server/engine/workflow-loader.ts';
import { syncRegistriesToDb } from '../server/engine/index-sync.ts';
import { createRoutedExecutor } from '../server/cli/executor-factory.ts';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import type { WorkflowStep } from '../server/engine/workflow-parser.ts';
import type { ExecutorContext } from '../server/engine/executor.ts';

/**
 * End-to-end coverage for multi-model routing: the full chain a real boot walks
 * — persona markdown (`- model:` bullet) → syncRegistriesToDb → SQLite →
 * repos.personas.list() → createRoutedExecutor → dispatch by step.persona.
 *
 * The factory unit tests in executor-factory.test.ts hand createRoutedExecutor
 * hand-built `{handle, model_default}` objects; this file proves the REAL DB row
 * shape feeds the factory correctly — in particular that the `handle` the DB
 * returns (`+xxx`) matches the `step.persona` format dispatch keys on. A
 * mismatch there would make every route silently fall through, and no mock test
 * would catch it.
 */

let tmpRoot: string;
let agentsDir: string;
let workflowsDir: string;
let db: Database.Database;
let repos: Repositories;

function writeAgent(id: string, modelBullet?: string): void {
  const model = modelBullet ? `- model: ${modelBullet}\n` : '';
  writeFileSync(
    join(agentsDir, `${id}.md`),
    `# ${id}\n\n- description: ${id} role.\n${model}\n## purpose\n\nDo ${id} work.\n\n## when to use\n\nWhen ${id} is needed.\n`,
    'utf8',
  );
}

function makeStep(persona: string | null, key = 'p.1'): WorkflowStep {
  return {
    key,
    index: 0,
    phase: 'P',
    persona,
    description: 'test',
    inputs: [],
    outputs: [],
    approver: null,
    reviewer: null,
  };
}

function makeCtx(): ExecutorContext {
  return {
    workflowId: 'test',
    runId: 1,
    runStepId: 1,
    worktreePath: '/tmp',
    signal: new AbortController().signal,
  };
}

const cliOpts = {
  binary: '/usr/bin/true',
  agentsDir: '/tmp/agents',
  logsDir: '/tmp/logs',
};

/** Sync whatever agents/workflows are on disk into the DB the same way boot does. */
function syncToDb(): void {
  syncRegistriesToDb(
    {
      personas: loadPersonasFromDir(agentsDir),
      workflows: loadWorkflowsFromDir(workflowsDir),
    },
    repos,
  );
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-routing-e2e-'));
  agentsDir = join(tmpRoot, 'agents');
  workflowsDir = join(tmpRoot, 'workflows');
  mkdirSync(agentsDir);
  mkdirSync(workflowsDir);
  const bundle = openDb({ path: join(tmpRoot, 'test.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('multi-model routing — markdown → DB → list() → createRoutedExecutor', () => {
  it('honors a `- model:` bullet through the whole chain (gemini string survives to the executor name)', () => {
    writeAgent('routed-dev', 'gemini');
    syncToDb();

    const routed = createRoutedExecutor(repos.personas.list(), new MockExecutor(), cliOpts);

    // The 'gemini' string declared in markdown must have survived parse → DB →
    // list() → factory and produced a real GeminiCliExecutor in the route.
    expect(routed.name).toMatch(/routed/);
    expect(routed.name).toMatch(/gemini-cli/);
  });

  it('dispatches the routed persona away from fallback and lets plain personas fall through', async () => {
    // One persona declares a model (routed to its own mock executor); one does
    // not (must use the shared fallback). Both use mock kinds so execute() is
    // spawn-free.
    writeAgent('routed-dev', 'mock');
    writeAgent('plain-qa');
    syncToDb();

    const fallback = new MockExecutor(() => ({ summary: 'FALLBACK' }));
    const routed = createRoutedExecutor(repos.personas.list(), fallback, cliOpts);

    // Sanity: the DB carried model_default through (sync also injects synthetic
    // +prime/+assignee/+approver handles, which have no model and don't route).
    const byHandle = new Map(repos.personas.list().map((p) => [p.handle, p.model_default]));
    expect(byHandle.get('+routed-dev')).toBe('mock');
    expect(byHandle.get('+plain-qa')).toBeNull();

    // The routed persona's handle (as stored in the DB) must match step.persona
    // and be dispatched to its own executor, NOT the fallback.
    const routedResult = await routed.execute(makeStep('+routed-dev', 'p.routed'), makeCtx());
    expect(routedResult.outputSummary).not.toBe('FALLBACK');
    expect(routedResult.outputSummary).toBe('mock:p.routed');

    // The persona with no `- model:` bullet has no route → fallback handles it.
    const plainResult = await routed.execute(makeStep('+plain-qa', 'p.plain'), makeCtx());
    expect(plainResult.outputSummary).toBe('FALLBACK');
  });

  it('returns the bare fallback when no persona declares a model (zero-cost path)', () => {
    writeAgent('plain-a');
    writeAgent('plain-b');
    syncToDb();

    const fallback = new MockExecutor();
    const routed = createRoutedExecutor(repos.personas.list(), fallback, cliOpts);

    // No overrides anywhere in the DB → the wrapper is skipped entirely.
    expect(routed).toBe(fallback);
  });
});
