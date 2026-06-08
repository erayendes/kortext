import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-persona-'));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

function writePersona(dir: string, name: string, body: string): void {
  writeFileSync(join(dir, name), body, 'utf8');
}

const validPersona = `# sample-persona

- description: A short one-line description.

## identity

You are sample. Be sample.
`;

describe('loadPersonasFromDir', () => {
  it('returns empty registry for an empty directory', () => {
    const reg = loadPersonasFromDir(tmpRoot);
    expect(reg.list()).toHaveLength(0);
    expect(reg.errors()).toHaveLength(0);
    expect(reg.get('+anything')).toBeNull();
  });

  it('loads a valid persona and indexes it by + handle', () => {
    writePersona(tmpRoot, 'sample-persona.md', validPersona);

    const reg = loadPersonasFromDir(tmpRoot);

    expect(reg.errors()).toEqual([]);
    expect(reg.list()).toHaveLength(1);

    const p = reg.get('+sample-persona');
    expect(p).not.toBeNull();
    expect(p?.handle).toBe('+sample-persona');
    expect(p?.id).toBe('sample-persona');
    expect(p?.description).toBe('A short one-line description.');
    expect(p?.systemPrompt).toContain('## identity');
    expect(p?.systemPrompt).toContain('You are sample');
  });

  it('also resolves get() when called without the + prefix', () => {
    writePersona(tmpRoot, 'sample-persona.md', validPersona);
    const reg = loadPersonasFromDir(tmpRoot);

    expect(reg.get('sample-persona')).not.toBeNull();
    expect(reg.get('+sample-persona')).not.toBeNull();
  });

  it('records an error when the file is missing an H1 handle', () => {
    writePersona(tmpRoot, 'broken.md', '- description: no h1 here\n\n## identity\nbody\n');
    const reg = loadPersonasFromDir(tmpRoot);

    expect(reg.list()).toHaveLength(0);
    expect(reg.errors()).toHaveLength(1);
    expect(reg.errors()[0]?.file).toBe('broken.md');
    expect(reg.errors()[0]?.reason).toMatch(/h1|handle/i);
  });

  it('records an error when the description bullet is missing', () => {
    writePersona(tmpRoot, 'no-desc.md', '# no-desc\n\n## identity\nbody\n');
    const reg = loadPersonasFromDir(tmpRoot);

    expect(reg.list()).toHaveLength(0);
    expect(reg.errors()).toHaveLength(1);
    expect(reg.errors()[0]?.file).toBe('no-desc.md');
    expect(reg.errors()[0]?.reason).toMatch(/description/i);
  });

  it('ignores non-markdown files and subdirectories', () => {
    writePersona(tmpRoot, 'real.md', validPersona);
    writeFileSync(join(tmpRoot, 'README.txt'), 'not a persona', 'utf8');
    writeFileSync(join(tmpRoot, '.DS_Store'), 'noise', 'utf8');
    mkdirSync(join(tmpRoot, 'sub'));

    const reg = loadPersonasFromDir(tmpRoot);

    expect(reg.list()).toHaveLength(1);
    expect(reg.errors()).toEqual([]);
  });

  it('throws when the directory does not exist (config error)', () => {
    expect(() => loadPersonasFromDir(join(tmpRoot, 'missing'))).toThrow();
  });

  it('reads - model: bullet into the model field', () => {
    writePersona(
      tmpRoot,
      'routed-dev.md',
      `# routed-dev\n\n- description: A routed developer.\n- model: gemini\n\n## identity\n\nYou are routed.\n`,
    );
    const reg = loadPersonasFromDir(tmpRoot);
    const p = reg.get('+routed-dev');
    expect(p?.model).toBe('gemini');
  });

  it('sets model to null when - model: bullet is absent', () => {
    writePersona(
      tmpRoot,
      'plain-dev.md',
      `# plain-dev\n\n- description: No model override.\n\n## identity\n\nYou are plain.\n`,
    );
    const reg = loadPersonasFromDir(tmpRoot);
    const p = reg.get('+plain-dev');
    expect(p?.model).toBeNull();
  });

  it('loads the real agents/ directory with all 14 personas and no errors', () => {
    const reg = loadPersonasFromDir(resolve(process.cwd(), 'agents'));
    expect(reg.errors()).toEqual([]);
    expect(reg.list()).toHaveLength(14);
    // Anchor checks across roles.
    expect(reg.get('+backend-developer')).not.toBeNull();
    expect(reg.get('+product-manager')).not.toBeNull();
    expect(reg.get('+qa-engineer')).not.toBeNull();
    // System prompt body must include the identity section verbatim.
    expect(reg.get('+backend-developer')?.systemPrompt).toContain('## identity');
    expect(reg.get('+backend-developer')?.description.length).toBeGreaterThan(20);
  });
});
