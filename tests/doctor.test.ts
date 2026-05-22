import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { loadWorkflowsFromDir } from '../server/engine/workflow-loader.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { runDoctor } from '../server/cli/doctor.ts';

let tmpRoot: string;
let wfDir: string;
let agentsDir: string;
let db: Database.Database;
let repos: Repositories;

const personaMd = (handle: string) =>
  `# ${handle}\n\n- description: ${handle} role.\n\n## identity\nbody\n`;

const workflowMd = (id: string, persona: string) =>
  `# ${id} (\`!start ${id}\`)\n\n## Phase A\n\n1. **${persona}:** do thing.\n   - Outputs: out.md\n`;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-doctor-'));
  wfDir = join(tmpRoot, 'workflows');
  agentsDir = join(tmpRoot, 'agents');
  mkdirSync(wfDir, { recursive: true });
  mkdirSync(agentsDir, { recursive: true });
  const bundle = openDb({ path: join(tmpRoot, 'doctor.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

function run() {
  return runDoctor({
    workflows: loadWorkflowsFromDir(wfDir),
    personas: loadPersonasFromDir(agentsDir),
    repos,
    now: () => new Date('2026-05-22T12:00:00Z'),
  });
}

describe('runDoctor — healthy state', () => {
  it('reports all-ok when everything is in shape', () => {
    writeFileSync(join(agentsDir, 'dev.md'), personaMd('dev'));
    writeFileSync(join(wfDir, 'wf.md'), workflowMd('wf', '+dev'));

    const report = run();

    expect(report.hasErrors).toBe(false);
    expect(report.summary.workflowsLoaded).toBe(1);
    expect(report.summary.workflowErrors).toBe(0);
    expect(report.summary.personasLoaded).toBe(1);
    expect(report.summary.personaErrors).toBe(0);
    expect(report.summary.unknownPersonaRefs).toBe(0);
    expect(report.summary.staleLocks).toBe(0);
    expect(report.summary.blockedItems).toBe(0);
    // All findings should be severity='ok' when nothing's wrong
    for (const f of report.findings) {
      expect(f.severity).toBe('ok');
    }
  });
});

describe('runDoctor — workflow integrity', () => {
  it('records an error finding for each malformed workflow file', () => {
    writeFileSync(join(agentsDir, 'dev.md'), personaMd('dev'));
    writeFileSync(join(wfDir, 'good.md'), workflowMd('good', '+dev'));
    writeFileSync(join(wfDir, 'bad.md'), '# title only, no steps\n');

    const report = run();
    expect(report.hasErrors).toBe(true);
    expect(report.summary.workflowErrors).toBe(1);
    const wf = report.findings.find((f) => f.category === 'workflow');
    expect(wf?.severity).toBe('error');
    expect(wf?.message).toMatch(/bad\.md/);
  });
});

describe('runDoctor — persona integrity', () => {
  it('records an error finding for each malformed persona file', () => {
    writeFileSync(join(agentsDir, 'dev.md'), personaMd('dev'));
    writeFileSync(join(agentsDir, 'broken.md'), '## no h1\n- description: x\n');
    writeFileSync(join(wfDir, 'wf.md'), workflowMd('wf', '+dev'));

    const report = run();
    expect(report.hasErrors).toBe(true);
    expect(report.summary.personaErrors).toBe(1);
    const p = report.findings.find((f) => f.category === 'persona');
    expect(p?.severity).toBe('error');
    expect(p?.message).toMatch(/broken\.md/);
  });
});

describe('runDoctor — cross references', () => {
  it('flags workflow steps that reference unknown personas', () => {
    writeFileSync(join(agentsDir, 'dev.md'), personaMd('dev'));
    writeFileSync(join(wfDir, 'wf.md'), workflowMd('wf', '+ghost'));

    const report = run();
    expect(report.hasErrors).toBe(true);
    expect(report.summary.unknownPersonaRefs).toBe(1);
    const x = report.findings.find((f) => f.category === 'cross-ref');
    expect(x?.severity).toBe('error');
    expect(x?.message).toContain('+ghost');
  });

  it('does NOT flag +prime by default (human-in-the-loop allow-list)', () => {
    writeFileSync(join(agentsDir, 'dev.md'), personaMd('dev'));
    writeFileSync(join(wfDir, 'wf.md'), workflowMd('wf', '+prime'));

    const report = run();
    expect(report.summary.unknownPersonaRefs).toBe(0);
    expect(report.findings.some((f) => f.category === 'cross-ref' && f.severity === 'error')).toBe(false);
  });
});

describe('runDoctor — stale locks', () => {
  it('warns about locks whose expires_at is in the past', () => {
    writeFileSync(join(agentsDir, 'dev.md'), personaMd('dev'));
    writeFileSync(join(wfDir, 'wf.md'), workflowMd('wf', '+dev'));
    // Seed two locks: one expired, one active.
    const pastMs = new Date('2026-05-22T10:00:00Z').getTime();  // 2h before "now"
    const futureMs = new Date('2026-05-22T13:00:00Z').getTime(); // 1h after "now"
    repos.locks.acquire({ resource: 'tasks/A', holder: '+dev', expires_at: pastMs });
    repos.locks.acquire({ resource: 'tasks/B', holder: '+dev', expires_at: futureMs });

    const report = run();
    expect(report.summary.staleLocks).toBe(1);
    const lockFinding = report.findings.find((f) => f.category === 'lock');
    expect(lockFinding?.severity).toBe('warn');
    expect(lockFinding?.message).toMatch(/tasks\/A/);
  });
});

describe('runDoctor — blocked items', () => {
  it('warns when there are items stuck in blocked status', () => {
    writeFileSync(join(agentsDir, 'dev.md'), personaMd('dev'));
    writeFileSync(join(wfDir, 'wf.md'), workflowMd('wf', '+dev'));
    repos.backlog.create({ id: 'T1', type: 'task', title: 't1' });
    repos.backlog.create({ id: 'T2', type: 'task', title: 't2' });
    repos.backlog.transitionStatus('T1', 'blocked');
    repos.backlog.transitionStatus('T2', 'blocked');

    const report = run();
    expect(report.summary.blockedItems).toBe(2);
    const item = report.findings.find((f) => f.category === 'item');
    expect(item?.severity).toBe('warn');
    expect(item?.message).toMatch(/2 blocked/i);
  });
});

describe('runDoctor — real repo', () => {
  it('returns a clean bill of health on the real workflows/ + agents/', () => {
    const report = runDoctor({
      workflows: loadWorkflowsFromDir(resolve(process.cwd(), 'workflows')),
      personas: loadPersonasFromDir(resolve(process.cwd(), 'agents')),
      repos,
      now: () => new Date('2026-05-22T12:00:00Z'),
    });
    expect(report.hasErrors).toBe(false);
    expect(report.summary.workflowErrors).toBe(0);
    expect(report.summary.personaErrors).toBe(0);
    expect(report.summary.unknownPersonaRefs).toBe(0);
  });
});
