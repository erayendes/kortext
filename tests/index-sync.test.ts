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

/**
 * Boot-time SQL sync (Faz 12.8). The sync is what enforces the
 * parse-time foreign key between workflow steps and personas — a
 * stale `+ajan` placeholder in any workflow file makes the sync
 * throw, which the engine boot surfaces as fatal.
 */

let tmpRoot: string;
let agentsDir: string;
let workflowsDir: string;
let db: Database.Database;
let repos: Repositories;

function writeAgent(id: string, body?: string): void {
  const content = body ??
    `# ${id}\n\n- description: ${id} role.\n\n## purpose\n\nDo ${id} work.\n\n## when to use\n\nWhen ${id} is needed.\n`;
  writeFileSync(join(agentsDir, `${id}.md`), content, 'utf8');
}

function writeWorkflow(id: string, body: string): void {
  writeFileSync(join(workflowsDir, `${id}.md`), body, 'utf8');
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-index-sync-'));
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

describe('syncRegistriesToDb', () => {
  it('upserts personas with purpose + when_to_use extracted from markdown', () => {
    writeAgent('backend-developer');
    writeAgent('qa-engineer');
    writeWorkflow(
      'wf-1',
      '# wf 1 (`!start wf1`)\n\n## Phase\n\n1. **+backend-developer:** ship.\n   - Inputs: `a.md`\n   - Outputs: `b.md`\n',
    );

    const result = syncRegistriesToDb(
      {
        personas: loadPersonasFromDir(agentsDir),
        workflows: loadWorkflowsFromDir(workflowsDir),
      },
      repos,
    );

    // 2 file personas + synthetic +prime.
    expect(result.personasUpserted).toBe(3);
    expect(result.workflowStepsUpserted).toBe(1);
    const backend = repos.personas.get('+backend-developer');
    expect(backend?.purpose).toBe('Do backend-developer work.');
    expect(backend?.when_to_use).toBe('When backend-developer is needed.');
    expect(backend?.source_path).toBe('agents/backend-developer.md');
    expect(repos.personas.get('+prime')).not.toBeNull();
  });

  it('upserts workflow steps with inputs/outputs and source_path', () => {
    writeAgent('backend-developer');
    writeWorkflow(
      'wf-1',
      '# wf 1 (`!start wf1`)\n\n## Phase\n\n1. **+backend-developer:** ship.\n   - Inputs: `a.md`, `b.md`\n   - Outputs: `out.md`\n',
    );

    syncRegistriesToDb(
      {
        personas: loadPersonasFromDir(agentsDir),
        workflows: loadWorkflowsFromDir(workflowsDir),
      },
      repos,
    );
    const steps = repos.workflowSteps.list('wf-1');
    expect(steps).toHaveLength(1);
    expect(steps[0]?.persona_handle).toBe('+backend-developer');
    expect(steps[0]?.inputs).toEqual(['a.md', 'b.md']);
    expect(steps[0]?.outputs).toEqual(['out.md']);
    expect(steps[0]?.source_path).toBe('workflows/wf-1.md');
  });

  it('THROWS when a workflow references an unknown persona handle', () => {
    writeAgent('backend-developer');
    writeWorkflow(
      'broken',
      '# broken (`!start broken`)\n\n## Phase\n\n1. **+ghost-agent:** do it.\n   - Outputs: `out.md`\n',
    );

    expect(() =>
      syncRegistriesToDb(
        {
          personas: loadPersonasFromDir(agentsDir),
          workflows: loadWorkflowsFromDir(workflowsDir),
        },
        repos,
      ),
    ).toThrow(/unknown persona handles[\s\S]*\+ghost-agent/i);
  });

  it('reports every unknown persona in one error (no early-exit)', () => {
    writeAgent('backend-developer');
    writeWorkflow(
      'wf-a',
      '# wf-a (`!start a`)\n\n## P\n\n1. **+ghost-one:** x.\n   - Outputs: `o.md`\n',
    );
    writeWorkflow(
      'wf-b',
      '# wf-b (`!start b`)\n\n## P\n\n1. **+ghost-two:** y.\n   - Outputs: `o.md`\n',
    );

    let captured: Error | null = null;
    try {
      syncRegistriesToDb(
        {
          personas: loadPersonasFromDir(agentsDir),
          workflows: loadWorkflowsFromDir(workflowsDir),
        },
        repos,
      );
    } catch (err) {
      captured = err as Error;
    }
    expect(captured).not.toBeNull();
    expect(captured?.message).toMatch(/\+ghost-one/);
    expect(captured?.message).toMatch(/\+ghost-two/);
  });

  it('accepts +prime references without an agents/prime.md file', () => {
    writeAgent('backend-developer');
    writeWorkflow(
      'wf-prime',
      '# wf-prime (`!start p`)\n\n## P\n\n1. **+prime:** approve.\n   - Outputs: `decision.md`\n',
    );

    expect(() =>
      syncRegistriesToDb(
        {
          personas: loadPersonasFromDir(agentsDir),
          workflows: loadWorkflowsFromDir(workflowsDir),
        },
        repos,
      ),
    ).not.toThrow();
    expect(repos.workflowSteps.list('wf-prime')).toHaveLength(1);
  });

  it('is idempotent — re-running re-creates a clean projection', () => {
    writeAgent('backend-developer');
    writeWorkflow(
      'wf-1',
      '# wf 1 (`!start wf1`)\n\n## P\n\n1. **+backend-developer:** ship.\n   - Outputs: `o.md`\n',
    );

    const registries = {
      personas: loadPersonasFromDir(agentsDir),
      workflows: loadWorkflowsFromDir(workflowsDir),
    };
    syncRegistriesToDb(registries, repos);
    syncRegistriesToDb(registries, repos);

    expect(repos.personas.list()).toHaveLength(2); // +backend-developer + +prime
    expect(repos.workflowSteps.list('wf-1')).toHaveLength(1);
  });
});
