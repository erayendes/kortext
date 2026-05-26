import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { parseWorkflowMarkdown } from '../server/engine/workflow-parser.ts';
import { buildGraph } from '../server/engine/dag.ts';
import { GateEnforcer } from '../server/engine/gate-enforcer.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

function makeGraph() {
  const wf = parseWorkflowMarkdown(
    `# Test (\`!start test\`)
## A
1. **+a:** make foo
   - Inputs: foundation/BRD.md
   - Outputs: foo.md
2. **+b:** make bar
   - Inputs: foo.md, references/dictionary.md
   - Outputs: bar.md
`,
    'test-wf',
  );
  return buildGraph(wf);
}

function writeFrontmatter(path: string, fields: Record<string, string>, body = '# title\n') {
  mkdirSync(join(path, '..'), { recursive: true });
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) lines.push(`${k}: ${v}`);
  lines.push('---');
  lines.push('');
  lines.push(body);
  writeFileSync(path, lines.join('\n'));
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-gate-'));
  const bundle = openDb({ path: join(tmpRoot, 'gate.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('GateEnforcer', () => {
  it('passes when every external input has status: approved frontmatter', async () => {
    writeFrontmatter(join(tmpRoot, 'foundation/BRD.md'), { status: 'approved' });
    writeFrontmatter(join(tmpRoot, 'references/dictionary.md'), { status: 'approved' });

    const enforcer = new GateEnforcer({ repoRoot: tmpRoot, runs: repos.runs });
    const result = await enforcer.check(makeGraph());

    expect(result.ok).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it('fails when a required external input file is missing', async () => {
    writeFrontmatter(join(tmpRoot, 'foundation/BRD.md'), { status: 'approved' });
    // dictionary.md not created

    const enforcer = new GateEnforcer({ repoRoot: tmpRoot, runs: repos.runs });
    const result = await enforcer.check(makeGraph());

    expect(result.ok).toBe(false);
    const missing = result.failures.find((f) => f.kind === 'missing-input');
    expect(missing?.path).toContain('dictionary.md');
  });

  it('fails when an external input exists but status is not approved', async () => {
    writeFrontmatter(join(tmpRoot, 'foundation/BRD.md'), { status: 'draft' });
    writeFrontmatter(join(tmpRoot, 'references/dictionary.md'), { status: 'approved' });

    const enforcer = new GateEnforcer({ repoRoot: tmpRoot, runs: repos.runs });
    const result = await enforcer.check(makeGraph());

    expect(result.ok).toBe(false);
    const unapproved = result.failures.find((f) => f.kind === 'unapproved-input');
    expect(unapproved?.path).toContain('BRD.md');
  });

  it('fails when frontmatter is absent on a required input', async () => {
    // file exists but has no frontmatter at all
    mkdirSync(join(tmpRoot, 'references'), { recursive: true });
    mkdirSync(join(tmpRoot, 'foundation'), { recursive: true });
    writeFileSync(join(tmpRoot, 'foundation/BRD.md'), '# blueprint, no frontmatter\n');
    writeFrontmatter(join(tmpRoot, 'references/dictionary.md'), { status: 'approved' });

    const enforcer = new GateEnforcer({ repoRoot: tmpRoot, runs: repos.runs });
    const result = await enforcer.check(makeGraph());

    expect(result.ok).toBe(false);
    expect(result.failures.some((f) => f.kind === 'unapproved-input')).toBe(true);
  });

  it('passes prior-workflow check when previous workflow has succeeded', async () => {
    writeFrontmatter(join(tmpRoot, 'foundation/BRD.md'), { status: 'approved' });
    writeFrontmatter(join(tmpRoot, 'references/dictionary.md'), { status: 'approved' });

    // simulate a successful prior run
    const prior = repos.runs.createRun({
      workflow_id: 'prior-wf',
      item_id: null,
      status: 'queued',
      worktree_path: null,
      triggered_by: 'test',
    });
    repos.runs.transitionRun(prior.id, 'running');
    repos.runs.transitionRun(prior.id, 'succeeded');

    const enforcer = new GateEnforcer({ repoRoot: tmpRoot, runs: repos.runs });
    const result = await enforcer.check(makeGraph(), { previousWorkflowId: 'prior-wf' });
    expect(result.ok).toBe(true);
  });

  it('fails prior-workflow check when no prior run has succeeded', async () => {
    writeFrontmatter(join(tmpRoot, 'foundation/BRD.md'), { status: 'approved' });
    writeFrontmatter(join(tmpRoot, 'references/dictionary.md'), { status: 'approved' });

    // a prior run exists but it failed
    const prior = repos.runs.createRun({
      workflow_id: 'prior-wf',
      item_id: null,
      status: 'queued',
      worktree_path: null,
      triggered_by: 'test',
    });
    repos.runs.transitionRun(prior.id, 'running');
    repos.runs.transitionRun(prior.id, 'failed', { error_message: 'oops' });

    const enforcer = new GateEnforcer({ repoRoot: tmpRoot, runs: repos.runs });
    const result = await enforcer.check(makeGraph(), { previousWorkflowId: 'prior-wf' });
    expect(result.ok).toBe(false);
    expect(result.failures.some((f) => f.kind === 'previous-not-succeeded')).toBe(true);
  });

  it('fails prior-workflow check when no prior run exists at all', async () => {
    writeFrontmatter(join(tmpRoot, 'foundation/BRD.md'), { status: 'approved' });
    writeFrontmatter(join(tmpRoot, 'references/dictionary.md'), { status: 'approved' });

    const enforcer = new GateEnforcer({ repoRoot: tmpRoot, runs: repos.runs });
    const result = await enforcer.check(makeGraph(), { previousWorkflowId: 'never-ran' });
    expect(result.ok).toBe(false);
    expect(result.failures.some((f) => f.kind === 'previous-not-succeeded')).toBe(true);
  });

  it('resolves relative input paths against the repo root', async () => {
    // The graph's external inputs are "foundation/BRD.md" — relative.
    // GateEnforcer must resolve them against repoRoot.
    writeFrontmatter(join(tmpRoot, 'foundation/BRD.md'), { status: 'approved' });
    writeFrontmatter(join(tmpRoot, 'references/dictionary.md'), { status: 'approved' });

    const enforcer = new GateEnforcer({ repoRoot: tmpRoot, runs: repos.runs });
    const result = await enforcer.check(makeGraph());
    expect(result.ok).toBe(true);
  });
});
