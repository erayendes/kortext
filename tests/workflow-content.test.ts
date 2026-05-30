import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { loadWorkflowsFromDir } from '../server/engine/workflow-loader.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { syncRegistriesToDb } from '../server/engine/index-sync.ts';
import { findUnknownPersonas, SYNTHETIC_PERSONA_HANDLES } from '../server/engine/consistency.ts';

/**
 * Faz 13 acceptance: every workflow .md in the package's `workflows/`
 * dir parses cleanly AND every step it produces carries a persona handle
 * that resolves to a real `agents/*.md` (or the synthetic `+prime`).
 *
 * In UAT-pre-Faz-13 the boot log read:
 *
 *   sql index: 15 persona(s), 41 workflow step(s) upserted
 *   sql index: 161 step(s) skipped — no persona handle
 *
 * After Faz 13 the skipped count must be 0 (this test pins it) AND
 * `findUnknownPersonas` (filtered for +prime, which is synthetic) must
 * return empty.
 *
 * If anyone adds a new workflow with a free-text step (no `**+handle:**`)
 * or references a persona that doesn't exist in `agents/`, this test
 * fails before the change can land — preserving the index-sync FK
 * contract from Faz 12.8.
 */

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-workflow-content-'));
  const bundle = openDb({ path: join(tmpRoot, 'wf-content.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('workflow content acceptance (Faz 13)', () => {
  const projectRoot = resolve(__dirname, '..');
  const workflowsDir = join(projectRoot, 'workflows');
  const agentsDir = join(projectRoot, 'agents');

  it('all workflows parse with zero load errors', () => {
    const reg = loadWorkflowsFromDir(workflowsDir);
    expect(reg.errors()).toEqual([]);
    expect(reg.list().length).toBeGreaterThanOrEqual(9);
  });

  it('every step carries a persona handle (no "no persona handle" skips)', () => {
    const reg = loadWorkflowsFromDir(workflowsDir);
    const offenders: Array<{ workflow: string; stepKey: string; description: string }> = [];
    for (const wf of reg.list()) {
      for (const step of wf.steps) {
        if (!step.persona) {
          offenders.push({
            workflow: wf.id,
            stepKey: step.key,
            description: step.description.slice(0, 80),
          });
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every persona handle resolves to a known persona (FK contract)', () => {
    const workflows = loadWorkflowsFromDir(workflowsDir);
    const personas = loadPersonasFromDir(agentsDir);
    const unknown = findUnknownPersonas(workflows, personas).filter(
      (f) => !SYNTHETIC_PERSONA_HANDLES.includes(f.persona),
    );
    expect(unknown).toEqual([]);
  });

  it('syncRegistriesToDb runs without throwing and skips nothing', () => {
    const workflows = loadWorkflowsFromDir(workflowsDir);
    const personas = loadPersonasFromDir(agentsDir);
    const result = syncRegistriesToDb({ personas, workflows }, repos);
    expect(result.stepsWithoutPersona).toEqual([]);
    expect(result.workflowStepsUpserted).toBeGreaterThanOrEqual(60);
    expect(result.personasUpserted).toBeGreaterThanOrEqual(14);
  });

  it('every workflow has at least one approval gate OR every step succeeds without one', () => {
    // Sanity: gate detection still works post-callout-removal — at least
    // half the workflows should have a +prime gate (analysis, planning,
    // env setup, deployment, incident, spike all do).
    const reg = loadWorkflowsFromDir(workflowsDir);
    const workflowsWithGates = reg.list().filter((w) => w.gates.length > 0);
    expect(workflowsWithGates.length).toBeGreaterThanOrEqual(5);
  });
});
