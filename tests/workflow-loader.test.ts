import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadWorkflowsFromDir } from '../server/engine/workflow-loader.ts';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-wf-loader-'));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

function writeWorkflow(dir: string, name: string, body: string): void {
  writeFileSync(join(dir, name), body, 'utf8');
}

const minimalValidWorkflow = `# Sample (\`!start sample\`)

## Phase A

1. **+developer:** do a thing.
   - Outputs: \`output.md\`
`;

describe('loadWorkflowsFromDir', () => {
  it('returns empty registry for an empty directory', () => {
    const reg = loadWorkflowsFromDir(tmpRoot);
    expect(reg.list()).toHaveLength(0);
    expect(reg.errors()).toHaveLength(0);
    expect(reg.get('anything')).toBeNull();
  });

  it('loads a single valid workflow and indexes it by filename id', () => {
    writeWorkflow(tmpRoot, 'sample.md', minimalValidWorkflow);

    const reg = loadWorkflowsFromDir(tmpRoot);

    expect(reg.errors()).toHaveLength(0);
    expect(reg.list()).toHaveLength(1);
    const wf = reg.get('sample');
    expect(wf).not.toBeNull();
    expect(wf?.id).toBe('sample');
    expect(wf?.steps.length).toBeGreaterThan(0);
  });

  it('loads multiple workflows and lists them all', () => {
    writeWorkflow(tmpRoot, 'a.md', minimalValidWorkflow);
    writeWorkflow(tmpRoot, 'b.md', minimalValidWorkflow.replace('sample', 'b'));
    writeWorkflow(tmpRoot, 'c.md', minimalValidWorkflow.replace('sample', 'c'));

    const reg = loadWorkflowsFromDir(tmpRoot);

    expect(reg.errors()).toHaveLength(0);
    expect(reg.list()).toHaveLength(3);
    expect(reg.get('a')).not.toBeNull();
    expect(reg.get('b')).not.toBeNull();
    expect(reg.get('c')).not.toBeNull();
  });

  it('ignores non-markdown files', () => {
    writeWorkflow(tmpRoot, 'real.md', minimalValidWorkflow);
    writeFileSync(join(tmpRoot, 'README.txt'), 'not a workflow', 'utf8');
    writeFileSync(join(tmpRoot, '.DS_Store'), 'macos noise', 'utf8');
    mkdirSync(join(tmpRoot, 'nested')); // directories should also be skipped

    const reg = loadWorkflowsFromDir(tmpRoot);

    expect(reg.list()).toHaveLength(1);
    expect(reg.errors()).toHaveLength(0);
    expect(reg.get('real')).not.toBeNull();
  });

  it('records an error for an empty/zero-step workflow and skips it', () => {
    writeWorkflow(tmpRoot, 'good.md', minimalValidWorkflow);
    writeWorkflow(tmpRoot, 'empty.md', '# Just a title\n\nNo steps here.\n');

    const reg = loadWorkflowsFromDir(tmpRoot);

    expect(reg.list()).toHaveLength(1);
    expect(reg.get('good')).not.toBeNull();
    expect(reg.get('empty')).toBeNull();
    expect(reg.errors()).toHaveLength(1);
    expect(reg.errors()[0]?.file).toBe('empty.md');
    expect(reg.errors()[0]?.reason).toMatch(/empty|no steps/i);
  });

  it('throws when the directory does not exist (config error)', () => {
    const missing = join(tmpRoot, 'nope');
    expect(() => loadWorkflowsFromDir(missing)).toThrow();
  });

  it('loads the real workflows/ directory without errors', () => {
    const reg = loadWorkflowsFromDir(resolve(process.cwd(), 'workflows'));
    expect(reg.errors()).toEqual([]);
    expect(reg.list().length).toBeGreaterThanOrEqual(10);
    // Anchor: development-cycle must be loadable.
    expect(reg.get('development-cycle')).not.toBeNull();
  });
});
