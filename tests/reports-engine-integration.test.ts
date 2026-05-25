import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { parseWorkflowMarkdown } from '../server/engine/workflow-parser.ts';
import { buildGraph } from '../server/engine/dag.ts';
import { runWorkflow } from '../server/engine/worker-pool.ts';
import type { Executor, ExecutorContext, ExecutorResult } from '../server/engine/executor.ts';
import type { WorkflowStep } from '../server/engine/workflow-parser.ts';
import { MarkdownSyncService } from '../server/services/markdown-sync.ts';

let tmpRoot: string;
let workdir: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-reports-engine-'));
  workdir = tmpRoot;
  mkdirSync(join(workdir, '.kortext/reports'), { recursive: true });
  const bundle = openDb({ path: join(tmpRoot, 'reports.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

const WORKFLOW = `# Reporter (\`!start reporter\`)
## A
1. **+qa-engineer:** write a report
   - Outputs: .kortext/reports/test-reports_login-flow_2026-05-24-1432.md
2. **+devops-engineer:** write a non-report
   - Outputs: build.log
`;

describe('worker-pool outputIndexer hook', () => {
  it('indexes per-file reports into reports_index after step succeeds', async () => {
    const wf = parseWorkflowMarkdown(WORKFLOW, 'reporter');
    const graph = buildGraph(wf);

    class WritingExecutor implements Executor {
      readonly name = 'writer';
      async execute(step: WorkflowStep, _ctx: ExecutorContext): Promise<ExecutorResult> {
        for (const rel of step.outputs) {
          const abs = join(workdir, rel);
          mkdirSync(join(abs, '..'), { recursive: true });
          writeFileSync(abs, `wrote ${rel}\n`);
        }
        return { ok: true, outputSummary: 'done' };
      }
    }

    const sync = new MarkdownSyncService(repos, { root: tmpRoot });
    const result = await runWorkflow(graph, new WritingExecutor(), repos, {
      worktreePath: workdir,
      safety: {
        outputIndexer: ({ absolutePath, step }) => {
          sync.indexReportFromPath({
            absolutePath,
            author: step.persona ?? null,
          });
        },
      },
    });

    expect(result.run.status).toBe('succeeded');

    const reports = repos.reports.list();
    expect(reports).toHaveLength(1);
    expect(reports[0]?.scope).toBe('test-reports');
    expect(reports[0]?.slug).toBe('login-flow');
    expect(reports[0]?.author).toBe('+qa-engineer');
    expect(reports[0]?.file_path).toBe(
      '.kortext/reports/test-reports_login-flow_2026-05-24-1432.md',
    );
  });

  it('does not fail the run when the indexer throws', async () => {
    const wf = parseWorkflowMarkdown(WORKFLOW, 'reporter');
    const graph = buildGraph(wf);

    class WritingExecutor implements Executor {
      readonly name = 'writer';
      async execute(step: WorkflowStep, _ctx: ExecutorContext): Promise<ExecutorResult> {
        for (const rel of step.outputs) {
          const abs = join(workdir, rel);
          mkdirSync(join(abs, '..'), { recursive: true });
          writeFileSync(abs, 'x');
        }
        return { ok: true };
      }
    }

    const result = await runWorkflow(graph, new WritingExecutor(), repos, {
      worktreePath: workdir,
      safety: {
        outputIndexer: () => {
          throw new Error('indexer boom');
        },
      },
    });
    expect(result.run.status).toBe('succeeded');
  });
});
