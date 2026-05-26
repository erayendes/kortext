import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { parseWorkflowMarkdown } from '../server/engine/workflow-parser.ts';
import { buildGraph } from '../server/engine/dag.ts';
import { runWorkflow, type SafetyGuards } from '../server/engine/worker-pool.ts';
import { MarkdownSyncService } from '../server/services/markdown-sync.ts';
import type { Executor, ExecutorContext, ExecutorResult } from '../server/engine/executor.ts';
import type { WorkflowStep } from '../server/engine/workflow-parser.ts';

/**
 * Faz 13 — Workflow declares a patterned output
 * (`.kortext/reports/test-reports_<slug>_<ts>.md`); the executor produces
 * a properly-named file; the worker-pool's safety guard fires the
 * `outputIndexer` callback (wired in `server/index.ts`) so the per-file
 * report lands in `reports_index` automatically.
 */

let tmpRoot: string;
let workdir: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-indexer-'));
  workdir = join(tmpRoot, 'project');
  mkdirSync(workdir, { recursive: true });
  // The patterned output lives under .kortext/reports/ — pre-create it so
  // the executor (which uses the v3.1 path layout) can write into it.
  mkdirSync(join(workdir, '.kortext/reports'), { recursive: true });

  const bundle = openDb({ path: join(tmpRoot, 'indexer.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

const PATTERN_WORKFLOW = `# Indexer Smoke (\`!start indexer-smoke\`)
## A
1. **+qa:** write a per-file test report
   - outputs: .kortext/reports/test-reports_<slug>_<ts>.md
`;

const STATIC_WORKFLOW = `# Static Smoke (\`!start static-smoke\`)
## A
1. **+qa:** write a non-report file
   - outputs: .kortext/foundation/BRD.md
`;

const NON_REPORT_PATTERN_WORKFLOW = `# Stray File (\`!start stray\`)
## A
1. **+qa:** write a report-shaped file in the wrong directory
   - outputs: .kortext/references/test-reports_<slug>_<ts>.md
`;

describe('runWorkflow + outputIndexer wiring', () => {
  it('back-fills reports_index when executor writes a patterned report file', async () => {
    const wf = parseWorkflowMarkdown(PATTERN_WORKFLOW, 'indexer-smoke');
    const graph = buildGraph(wf);

    class ProducingExecutor implements Executor {
      readonly name = 'producing';
      async execute(step: WorkflowStep, _ctx: ExecutorContext): Promise<ExecutorResult> {
        const target = join(
          workdir,
          '.kortext/reports/test-reports_login-flow_2026-05-25-2030.md',
        );
        writeFileSync(
          target,
          '---\nstatus: writing\nauthor: +qa\nupdated_at: 2026-05-25T20:30:00Z\n---\n\n# Test report\n',
        );
        // declared outputs check happens inside the CLI executors; mock
        // executor returns ok and the worker-pool's safety guards still
        // run on whatever the step declared.
        return { ok: true, outputSummary: `wrote ${step.outputs[0]}` };
      }
    }

    const markdownSync = new MarkdownSyncService(repos, { root: workdir });
    const safety: SafetyGuards = {
      outputIndexer: ({ absolutePath }) => {
        markdownSync.indexReportFromPath({ absolutePath });
      },
    };

    const result = await runWorkflow(graph, new ProducingExecutor(), repos, {
      worktreePath: workdir,
      safety,
    });

    expect(result.run.status).toBe('succeeded');

    const rows = repos.reports.list({});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.scope).toBe('test-reports');
    expect(rows[0]?.slug).toBe('login-flow');
    expect(rows[0]?.file_path).toBe(
      '.kortext/reports/test-reports_login-flow_2026-05-25-2030.md',
    );
  });

  it('does NOT back-fill when the declared output is a non-report file', async () => {
    const wf = parseWorkflowMarkdown(STATIC_WORKFLOW, 'static-smoke');
    const graph = buildGraph(wf);

    class ProducingExecutor implements Executor {
      readonly name = 'producing';
      async execute(_step: WorkflowStep, _ctx: ExecutorContext): Promise<ExecutorResult> {
        mkdirSync(join(workdir, '.kortext/foundation'), { recursive: true });
        writeFileSync(join(workdir, '.kortext/foundation/BRD.md'), '# bp\n');
        return { ok: true, outputSummary: 'wrote bp' };
      }
    }

    const markdownSync = new MarkdownSyncService(repos, { root: workdir });
    const safety: SafetyGuards = {
      outputIndexer: ({ absolutePath }) => {
        markdownSync.indexReportFromPath({ absolutePath });
      },
    };

    const result = await runWorkflow(graph, new ProducingExecutor(), repos, {
      worktreePath: workdir,
      safety,
    });

    expect(result.run.status).toBe('succeeded');
    expect(repos.reports.list({})).toHaveLength(0);
  });

  it('does NOT back-fill when a report-shaped file lands outside .kortext/reports', async () => {
    const wf = parseWorkflowMarkdown(NON_REPORT_PATTERN_WORKFLOW, 'stray');
    const graph = buildGraph(wf);

    class StrayExecutor implements Executor {
      readonly name = 'stray';
      async execute(_step: WorkflowStep, _ctx: ExecutorContext): Promise<ExecutorResult> {
        mkdirSync(join(workdir, '.kortext/references'), { recursive: true });
        writeFileSync(
          join(workdir, '.kortext/references/test-reports_a_2026-05-25-2030.md'),
          '# stray\n',
        );
        return { ok: true, outputSummary: 'wrote stray' };
      }
    }

    const markdownSync = new MarkdownSyncService(repos, { root: workdir });
    const safety: SafetyGuards = {
      outputIndexer: ({ absolutePath }) => {
        markdownSync.indexReportFromPath({ absolutePath });
      },
    };

    const result = await runWorkflow(graph, new StrayExecutor(), repos, {
      worktreePath: workdir,
      safety,
    });

    expect(result.run.status).toBe('succeeded');
    // indexReportFromPath enforces the .kortext/reports/ prefix — stray
    // files (correct name, wrong directory) are ignored.
    expect(repos.reports.list({})).toHaveLength(0);
  });
});
