import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as cp from 'node:child_process';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { initCommand } from '../server/cli/init.ts';
import {
  parseWorkflowMarkdown,
  type WorkflowDefinition,
} from '../server/engine/workflow-parser.ts';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import { Orchestrator } from '../server/orchestrator/orchestrator.ts';
import { ApprovalQueue } from '../server/orchestrator/approval-queue.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { ItemLifecycle } from '../server/engine/item-lifecycle.ts';
import { HandoverEngine } from '../server/engine/handover.ts';

/**
 * Faz 9.1 — End-to-end pipeline smoke.
 *
 * Exercises the full autonomous loop the roadmap promises:
 *   1. `kortext init` lays down a fresh project tree + SQLite DB.
 *   2. blueprint.md flipping to `status: approved` triggers the first workflow.
 *   3. The orchestrator chains analysis → planning → development on success.
 *   4. The approval queue surfaces a question and accepts a mock answer.
 *   5. Backlog items go through their lifecycle with audit entries at each hop.
 *   6. Handover writes its markdown block AND auto-commits when a git repo
 *      is wired in — so the "every transition leaves a git commit" promise
 *      stays verifiable.
 *
 * The executor is always Mock so CI never reaches out to claude/codex/gemini
 * binaries. Worktree allocation is also stubbed — the orchestrator API is
 * already covered by worktree.test.ts. The point here is the WIRING, not the
 * individual modules.
 */

const runFile = cp.execFileSync;

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-e2e-'));
});

afterEach(() => {
  try {
    db?.close();
  } catch {
    // db may not have been opened in every test
  }
  rmSync(tmpRoot, { recursive: true, force: true });
});

function openProjectDb(targetDir: string): void {
  const dbPath = join(targetDir, '.kortext', 'runtime', 'kortext.db');
  const bundle = openDb({ path: dbPath });
  db = bundle.db;
  repos = bundle.repositories;
}

function makeWorktreeStub(root: string) {
  return async (runId: number) => {
    const path = join(root, `wt-${runId}`);
    mkdirSync(path, { recursive: true });
    return {
      path,
      release: async (_: { success: boolean }) => {},
    };
  };
}

// ---------------------------------------------------------------------------
// Workflow fixtures: three chained workflows with mock-executor-friendly
// step descriptions. The ids match the chain captured in the .md sources
// (analysis → planning → development) but the bodies are minimal — the
// real markdowns parse but reference dozens of files we don't need on disk.
// ---------------------------------------------------------------------------

const wfAnalysis = parseWorkflowMarkdown(
  `# Analysis (\`!start analysis\`)
- **Sonraki akış:** Onay sonrası \`planning.md\`.
## Product Analysis
1. **+product-manager:** scope.
   - Outputs: requirements.md
`,
  'analysis',
);

const wfPlanning = parseWorkflowMarkdown(
  `# Planning (\`!start planning\`)
- **Sonraki akış:** Onay sonrası \`development.md\`.
## Plan
1. **+tech-lead:** breakdown.
   - Outputs: plan.md
`,
  'planning',
);

const wfDevelopment = parseWorkflowMarkdown(
  `# Development (\`!start development\`)
## Build
1. **+backend-developer:** build.
   - Outputs: code.md
`,
  'development',
);

function makeLoader(map: Record<string, WorkflowDefinition>) {
  return (id: string) => map[id] ?? null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E — kortext init scaffolds a runnable project', () => {
  it('creates the SQLite DB and runs migrations on a fresh target dir', () => {
    const result = initCommand({ targetDir: tmpRoot });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.schemaVersion).toBeGreaterThan(0);
    expect(existsSync(result.dbPath)).toBe(true);

    // Re-opening the DB and reading from a migrated table proves migrations ran.
    openProjectDb(tmpRoot);
    // backlog table is part of the initial schema — listing returns []
    expect(repos.backlog.list({ limit: 1 })).toEqual([]);
  });

  it('is idempotent: a second init skips existing entries without error', () => {
    const first = initCommand({ targetDir: tmpRoot });
    expect(first.ok).toBe(true);
    const second = initCommand({ targetDir: tmpRoot });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    // AGENTS.md was created on first pass, so the second pass should report it
    // as skipped (not created again).
    expect(second.skipped).toContain('AGENTS.md');
  });
});

describe('E2E — blueprint approval drives the pipeline chain', () => {
  it('chains analysis → planning → development end-to-end', async () => {
    const initResult = initCommand({ targetDir: tmpRoot });
    expect(initResult.ok).toBe(true);
    openProjectDb(tmpRoot);

    const blueprintPath = join(tmpRoot, 'blueprint.md');
    writeFileSync(blueprintPath, '---\nstatus: draft\n---\n# bp\n', 'utf8');

    const orchestrator = new Orchestrator({
      repos,
      executor: new MockExecutor(() => ({ durationMs: 1 })),
      loadWorkflowById: makeLoader({
        analysis: wfAnalysis,
        planning: wfPlanning,
        development: wfDevelopment,
      }),
      approvalQueue: new ApprovalQueue({ repos }),
      acquireWorktree: makeWorktreeStub(tmpRoot),
      blueprint: { filePath: blueprintPath, triggerWorkflowId: 'analysis' },
    });

    // Flip the blueprint and poke the watcher directly (fs.watch timing is
    // OS-dependent, so the existing orchestrator test pattern is to call
    // handleBlueprintChange manually).
    writeFileSync(blueprintPath, '---\nstatus: approved\n---\n# bp\n', 'utf8');
    await orchestrator.handleBlueprintChange();

    // Three runs total: the triggered analysis + two chained.
    const runs = repos.runs.listRuns().filter((r) => r.status === 'succeeded');
    const workflowIds = runs.map((r) => r.workflow_id);
    expect(workflowIds).toContain('analysis');
    expect(workflowIds).toContain('planning');
    expect(workflowIds).toContain('development');

    // Audit log records the chain edges.
    const audit = repos.auditLog.list({ limit: 200 });
    const chained = audit.filter((e) => e.action === 'pipeline.chained');
    const edges = chained.map((e) => {
      const p = e.payload as { from_workflow: string; to_workflow: string };
      return `${p.from_workflow}->${p.to_workflow}`;
    });
    expect(edges).toContain('analysis->planning');
    expect(edges).toContain('planning->development');

    orchestrator.stop();
  });
});

describe('E2E — approval queue mock answer', () => {
  it('enqueues a question and surfaces the answered state to waiters', async () => {
    initCommand({ targetDir: tmpRoot });
    openProjectDb(tmpRoot);

    // Seed a run row so the FK on pending_questions has something to point at.
    const run = repos.runs.createRun({
      workflow_id: 'analysis',
      item_id: null,
      status: 'running',
      worktree_path: null,
      triggered_by: 'e2e-test',
    });

    const queue = new ApprovalQueue({ repos, pollIntervalMs: 10 });
    const question = queue.enqueue({
      runId: run.id,
      question: 'Proceed to planning?',
      choices: ['approve', 'reject'],
    });
    expect(question.status).toBe('open');

    // Schedule the mock answer to arrive shortly after waitForAnswer starts.
    const answerTimer = setTimeout(() => {
      queue.answer(question.id, 'approve', '+prime');
    }, 20);

    const answered = await queue.waitForAnswer(question.id);
    clearTimeout(answerTimer);

    expect(answered.status).toBe('answered');
    expect(answered.answer).toBe('approve');
    expect(answered.answered_by).toBe('+prime');

    // Audit log records the gate lifecycle.
    const actions = repos.auditLog
      .list({ resource_id: String(question.id) })
      .map((e) => e.action);
    expect(actions).toContain('gate.awaiting-approval');
    expect(actions).toContain('gate.answered');
  });
});

describe('E2E — backlog item lifecycle + audit log', () => {
  it('walks an item to_do → in_progress → review → done with audit trail', () => {
    initCommand({ targetDir: tmpRoot });
    openProjectDb(tmpRoot);

    // ItemLifecycle.create() validates owner against the registry, so seed one
    // persona on disk and load it.
    const agentsDir = join(tmpRoot, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, 'backend-developer.md'),
      '# backend-developer\n\n- description: builds things.\n\n## identity\nbody\n',
      'utf8',
    );
    const personas = loadPersonasFromDir(agentsDir);

    const lifecycle = new ItemLifecycle({ repos, personas });

    const item = lifecycle.create({
      id: 'T01',
      type: 'task',
      title: 'login form',
      owner: '+backend-developer',
    });
    expect(item.status).toBe('to_do');

    const started = lifecycle.transition('T01', 'start', '+prime');
    expect(started.status).toBe('in_progress');

    const reviewed = lifecycle.transition('T01', 'review', '+backend-developer');
    expect(reviewed.status).toBe('review');

    const done = lifecycle.transition('T01', 'done', '+prime');
    expect(done.status).toBe('done');

    const transitions = repos.auditLog
      .list({ resource_id: 'T01' })
      .filter((e) => e.action === 'item_transition');
    expect(transitions).toHaveLength(3);
    const path = transitions
      .map((e) => (e.payload as { transition: string }).transition)
      .reverse();
    expect(path).toEqual(['start', 'review', 'done']);
  });
});

describe('E2E — handover writes markdown + auto-commits to git', () => {
  it('records a handover and produces a chore(kortext) commit', () => {
    initCommand({ targetDir: tmpRoot });
    openProjectDb(tmpRoot);

    // Wire a real git repo so the HandoverEngine commit step has something
    // to commit against. The test mirrors the setup pattern from git-commit
    // and handover-engine tests.
    runFile('git', ['init', '--initial-branch=main', '--quiet'], { cwd: tmpRoot });
    runFile('git', ['config', 'user.email', 'test@kortext.local'], { cwd: tmpRoot });
    runFile('git', ['config', 'user.name', 'Kortext Test'], { cwd: tmpRoot });
    runFile('git', ['config', 'commit.gpgsign', 'false'], { cwd: tmpRoot });
    writeFileSync(join(tmpRoot, 'seed.txt'), 'seed\n');
    runFile('git', ['add', 'seed.txt'], { cwd: tmpRoot });
    runFile('git', ['commit', '-m', 'init', '--quiet'], { cwd: tmpRoot });

    const agentsDir = join(tmpRoot, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, 'backend-developer.md'),
      '# backend-developer\n\n- description: builds.\n\n## identity\nbody\n',
      'utf8',
    );
    writeFileSync(
      join(agentsDir, 'qa-engineer.md'),
      '# qa-engineer\n\n- description: tests.\n\n## identity\nbody\n',
      'utf8',
    );
    const personas = loadPersonasFromDir(agentsDir);

    const workspaceRoot = join(tmpRoot, 'workspace');
    mkdirSync(workspaceRoot, { recursive: true });

    repos.backlog.create({ id: 'T01', type: 'task', title: 'login form' });

    const engine = new HandoverEngine({
      repos,
      personas,
      workspaceRoot,
      git: { repoRoot: tmpRoot },
      now: () => new Date('2026-05-22T10:30:00Z'),
    });

    const result = engine.record({
      itemId: 'T01',
      title: 'login form',
      fromPersona: '+backend-developer',
      toPersona: '+qa-engineer',
      status: 'completed',
      completed: 'wired the form',
      context: 'see PR',
      nextStep: 'run tests',
    });

    expect(result.handoverId).toBeGreaterThan(0);
    expect(result.commitSha).toMatch(/^[0-9a-f]{40}$/);

    // The handover markdown is on disk and contains the new entry.
    const handoverPath = join(workspaceRoot, '.kortext', 'memory', 'handover.md');
    expect(existsSync(handoverPath)).toBe(true);
    const body = readFileSync(handoverPath, 'utf8');
    expect(body).toContain('T01');
    expect(body).toContain('+backend-developer');
    expect(body).toContain('+qa-engineer');

    // Git log shows the chore commit.
    const log = runFile('git', ['log', '-1', '--pretty=%s'], {
      cwd: tmpRoot,
      encoding: 'utf8',
    }).trim();
    expect(log).toBe('chore(kortext): handover T01');
  });
});
