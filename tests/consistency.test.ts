import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadWorkflowsFromDir } from '../server/engine/workflow-loader.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { findUnknownPersonas, SYNTHETIC_PERSONA_HANDLES } from '../server/engine/consistency.ts';

let tmpRoot: string;
let wfDir: string;
let agentsDir: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-consistency-'));
  wfDir = join(tmpRoot, 'workflows');
  agentsDir = join(tmpRoot, 'agents');
  mkdirSync(wfDir, { recursive: true });
  mkdirSync(agentsDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

const personaMd = (handle: string) =>
  `# ${handle}\n\n- description: ${handle} role.\n\n## identity\nbody\n`;

const workflowMd = (id: string, persona: string) =>
  `# ${id} (\`!start ${id}\`)\n\n## Phase A\n\n1. **${persona}:** do thing.\n   - Outputs: out.md\n`;

describe('findUnknownPersonas', () => {
  it('returns no findings when every workflow persona has a definition', () => {
    writeFileSync(join(agentsDir, 'developer.md'), personaMd('developer'));
    writeFileSync(join(agentsDir, 'reviewer.md'), personaMd('reviewer'));
    writeFileSync(join(wfDir, 'wf1.md'), workflowMd('wf1', '+developer'));
    writeFileSync(join(wfDir, 'wf2.md'), workflowMd('wf2', '+reviewer'));

    const wfs = loadWorkflowsFromDir(wfDir);
    const personas = loadPersonasFromDir(agentsDir);

    expect(findUnknownPersonas(wfs, personas)).toEqual([]);
  });

  it('reports each workflow step that references an unknown persona', () => {
    writeFileSync(join(agentsDir, 'developer.md'), personaMd('developer'));
    writeFileSync(join(wfDir, 'wf1.md'), workflowMd('wf1', '+ghost'));
    writeFileSync(join(wfDir, 'wf2.md'), workflowMd('wf2', '+developer'));

    const wfs = loadWorkflowsFromDir(wfDir);
    const personas = loadPersonasFromDir(agentsDir);

    const findings = findUnknownPersonas(wfs, personas);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.workflowId).toBe('wf1');
    expect(findings[0]?.persona).toBe('+ghost');
    expect(findings[0]?.stepKey).toBeTruthy();
  });

  it('ignores steps that have no persona (e.g. NOTE-only headings)', () => {
    writeFileSync(join(agentsDir, 'developer.md'), personaMd('developer'));
    writeFileSync(
      join(wfDir, 'wf.md'),
      `# wf\n\n## P\n\n1. plain step with no persona handle.\n   - Outputs: x.md\n`,
    );

    const wfs = loadWorkflowsFromDir(wfDir);
    const personas = loadPersonasFromDir(agentsDir);

    expect(findUnknownPersonas(wfs, personas)).toEqual([]);
  });

  it('is silent on the real workflows/ + agents/ pair (no unknown personas)', () => {
    const wfs = loadWorkflowsFromDir(resolve(process.cwd(), 'workflows'));
    const personas = loadPersonasFromDir(resolve(process.cwd(), 'agents'));

    const findings = findUnknownPersonas(wfs, personas);
    // Synthetic handles (+prime + dynamic +assignee/+approver) are allowed
    // to be missing from agents/.
    const unexpected = findings.filter(
      (f) => !SYNTHETIC_PERSONA_HANDLES.includes(f.persona),
    );
    expect(unexpected).toEqual([]);
  });
});
