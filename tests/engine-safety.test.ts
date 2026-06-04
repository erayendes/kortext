import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { ingestBacklogFile } from '../server/engine/backlog-ingest.ts';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { parseWorkflowMarkdown } from '../server/engine/workflow-parser.ts';
import { buildGraph } from '../server/engine/dag.ts';
import { runWorkflow } from '../server/engine/worker-pool.ts';
import { MockExecutor } from '../server/engine/executors/mock-executor.ts';
import { SecretScanner } from '../server/safety/secret-scanner.ts';
import { HarmfulOutputFilter } from '../server/safety/harmful-output-filter.ts';
import type { Executor, ExecutorContext, ExecutorResult } from '../server/engine/executor.ts';
import type { WorkflowStep } from '../server/engine/workflow-parser.ts';

let tmpRoot: string;
let workdir: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-engine-safety-'));
  workdir = join(tmpRoot, 'work');
  mkdirSync(workdir, { recursive: true });
  const bundle = openDb({ path: join(tmpRoot, 'safe.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

const TINY_WORKFLOW = `# Tiny (\`!start tiny\`)
## A
1. **+x:** make output
   - Outputs: leak.ts
2. **+y:** consume output
   - Inputs: leak.ts
   - Outputs: report.md
`;

describe('runWorkflow + safety guards', () => {
  it('fails a step when its output contains a service token', async () => {
    const wf = parseWorkflowMarkdown(TINY_WORKFLOW, 'tiny-wf');
    const graph = buildGraph(wf);

    // executor for step 1 writes a leaky file; step 2 would otherwise succeed.
    class LeakyExecutor implements Executor {
      readonly name = 'leaky';
      async execute(step: WorkflowStep, _ctx: ExecutorContext): Promise<ExecutorResult> {
        if (step.outputs.includes('leak.ts')) {
          writeFileSync(
            join(workdir, 'leak.ts'),
            'const token = "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"\n',
          );
        } else if (step.outputs.includes('report.md')) {
          writeFileSync(join(workdir, 'report.md'), '# clean\n');
        }
        return { ok: true, outputSummary: 'done' };
      }
    }

    const scanner = new SecretScanner({ secretsRepo: repos.secrets });
    const result = await runWorkflow(graph, new LeakyExecutor(), repos, {
      worktreePath: workdir,
      safety: { secretScanner: scanner },
    });

    expect(result.failedStepKey).toBeTruthy();
    expect(result.run.status).toBe('failed');
    expect(result.run.error_message).toMatch(/secret|token/i);

    // finding persisted with the run id
    const persisted = repos.secrets.list({});
    expect(persisted.length).toBeGreaterThan(0);
    expect(persisted[0]?.run_id).toBe(result.run.id);
  });

  it('ingests a backlog.yaml output into real backlog rows via the backlogIngester hook', async () => {
    const wf = parseWorkflowMarkdown(
      '# Plan (`!start plan`)\n## A\n1. **+x:** define backlog\n   - Outputs: backlog.yaml\n',
      'plan-wf',
    );
    const graph = buildGraph(wf);

    class BacklogExecutor implements Executor {
      readonly name = 'backlog';
      async execute(step: WorkflowStep): Promise<ExecutorResult> {
        if (step.outputs.includes('backlog.yaml')) {
          writeFileSync(
            join(workdir, 'backlog.yaml'),
            'items:\n' +
              '  - id: T-1\n    type: task\n    title: First\n    review_gates: [code_review]\n' +
              '  - id: T-2\n    type: bug\n    title: Second\n',
          );
        }
        return { ok: true, outputSummary: 'done' };
      }
    }

    const result = await runWorkflow(graph, new BacklogExecutor(), repos, {
      worktreePath: workdir,
      safety: {
        backlogIngester: ({ absolutePath }) => {
          if (basename(absolutePath) === 'backlog.yaml') ingestBacklogFile(repos, absolutePath);
        },
      },
    });

    expect(result.run.status).toBe('succeeded');
    const items = repos.backlog.list({});
    expect(items.map((i) => i.id).sort()).toEqual(['T-1', 'T-2']);
    expect(repos.backlog.get('T-1')?.review_gates).toEqual(['code_review']);
  });

  it('passes when outputs are clean', async () => {
    const wf = parseWorkflowMarkdown(TINY_WORKFLOW, 'tiny-wf-clean');
    const graph = buildGraph(wf);

    class CleanExecutor implements Executor {
      readonly name = 'clean';
      async execute(step: WorkflowStep): Promise<ExecutorResult> {
        if (step.outputs.includes('leak.ts')) {
          writeFileSync(join(workdir, 'leak.ts'), 'export const x = 1;\n');
        } else if (step.outputs.includes('report.md')) {
          writeFileSync(join(workdir, 'report.md'), '# clean\n');
        }
        return { ok: true, outputSummary: 'done' };
      }
    }

    const scanner = new SecretScanner({ secretsRepo: repos.secrets });
    const result = await runWorkflow(graph, new CleanExecutor(), repos, {
      worktreePath: workdir,
      safety: { secretScanner: scanner },
    });

    expect(result.failedStepKey).toBeNull();
    expect(result.run.status).toBe('succeeded');
  });

  it('fails a step when output triggers harmful-output filter', async () => {
    const wf = parseWorkflowMarkdown(
      `# X (\`!start x\`)
## P
1. **+a:** make
   - Outputs: out.md
`,
      'harm-wf',
    );
    const graph = buildGraph(wf);

    class BadExecutor implements Executor {
      readonly name = 'bad';
      async execute(): Promise<ExecutorResult> {
        writeFileSync(join(workdir, 'out.md'), 'we will rm -rf the world\n');
        return { ok: true, outputSummary: 'done' };
      }
    }

    const filter = new HarmfulOutputFilter({ bannedPhrases: ['rm -rf'] });
    const result = await runWorkflow(graph, new BadExecutor(), repos, {
      worktreePath: workdir,
      safety: { harmfulFilter: filter },
    });

    expect(result.failedStepKey).toBeTruthy();
    expect(result.run.status).toBe('failed');
    expect(result.run.error_message).toMatch(/banned|harmful/i);
  });

  it('runs without safety guards (backwards-compatible)', async () => {
    // ensure existing engine.test.ts behaviour is preserved when `safety` is not passed
    const wf = parseWorkflowMarkdown(
      `# Z (\`!start z\`)
## P
1. **+a:** noop
`,
      'noop-wf',
    );
    const graph = buildGraph(wf);
    const result = await runWorkflow(graph, new MockExecutor(), repos);
    expect(result.run.status).toBe('succeeded');
  });
});
