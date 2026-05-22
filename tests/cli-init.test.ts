import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { initCommand } from '../server/cli/init.ts';

let tmpRoot: string;
let templatesDir: string;
let targetDir: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-init-'));
  templatesDir = join(tmpRoot, 'templates');
  targetDir = join(tmpRoot, 'project');
  mkdirSync(templatesDir, { recursive: true });
  mkdirSync(targetDir, { recursive: true });

  // Minimal template tree: enough to exercise the scaffold loop.
  mkdirSync(join(templatesDir, 'agents'), { recursive: true });
  writeFileSync(join(templatesDir, 'agents', 'persona.md'), '# Persona\n', 'utf8');
  mkdirSync(join(templatesDir, 'workflows'), { recursive: true });
  writeFileSync(join(templatesDir, 'workflows', 'wf.md'), '# WF\n', 'utf8');
  mkdirSync(join(templatesDir, 'rules'), { recursive: true });
  writeFileSync(join(templatesDir, 'rules', 'behavior.md'), '# Rules\n', 'utf8');
  mkdirSync(join(templatesDir, 'workspace', 'references'), { recursive: true });
  writeFileSync(
    join(templatesDir, 'workspace', 'references', 'blueprint.md'),
    '---\nstatus: draft\n---\n# Blueprint\n',
    'utf8',
  );
  writeFileSync(join(templatesDir, 'AGENTS.md'), '# Template AGENTS\n', 'utf8');
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('initCommand', () => {
  it('scaffolds a fresh project with all template dirs + AGENTS.md + DB', () => {
    const result = initCommand({ targetDir, templatesDir });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');

    expect(result.created).toEqual(
      expect.arrayContaining([
        'agents',
        'workflows',
        'rules',
        'workspace',
        'AGENTS.md',
        join('.kortext', 'runtime', 'kortext.db'),
      ]),
    );
    expect(result.skipped).toEqual([]);

    expect(existsSync(join(targetDir, 'agents', 'persona.md'))).toBe(true);
    expect(existsSync(join(targetDir, 'workflows', 'wf.md'))).toBe(true);
    expect(existsSync(join(targetDir, 'rules', 'behavior.md'))).toBe(true);
    expect(existsSync(join(targetDir, 'workspace', 'references', 'blueprint.md'))).toBe(true);

    const agentsMd = readFileSync(join(targetDir, 'AGENTS.md'), 'utf8');
    expect(agentsMd).toBe('# Template AGENTS\n');

    // DB was created and migrations applied (schemaVersion > 0).
    expect(result.schemaVersion).toBeGreaterThan(0);
    expect(existsSync(result.dbPath)).toBe(true);

    // Sanity: schema_migrations row should be present.
    const db = new Database(result.dbPath, { readonly: true });
    const rows = db.prepare('SELECT id FROM schema_migrations').all();
    db.close();
    expect(rows.length).toBeGreaterThan(0);
  });

  it('is idempotent: skips existing dirs and DB on a second run', () => {
    const first = initCommand({ targetDir, templatesDir });
    expect(first.ok).toBe(true);

    const second = initCommand({ targetDir, templatesDir });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error('expected ok');

    expect(second.created).toEqual([]);
    expect(second.skipped).toEqual(
      expect.arrayContaining([
        'agents',
        'workflows',
        'rules',
        'workspace',
        'AGENTS.md',
        join('.kortext', 'runtime', 'kortext.db'),
      ]),
    );
  });

  it('writes the default AGENTS.md when the template lacks one', () => {
    rmSync(join(templatesDir, 'AGENTS.md'));
    const result = initCommand({ targetDir, templatesDir });
    expect(result.ok).toBe(true);
    const written = readFileSync(join(targetDir, 'AGENTS.md'), 'utf8');
    expect(written).toMatch(/Kortext v3/);
    expect(written).toMatch(/kortext serve/);
  });

  it('with --force re-copies even when target dirs already exist', () => {
    initCommand({ targetDir, templatesDir });

    // User edited a scaffolded file; --force should overwrite.
    writeFileSync(join(targetDir, 'agents', 'persona.md'), '# Edited\n', 'utf8');

    const result = initCommand({ targetDir, templatesDir, force: true });
    expect(result.ok).toBe(true);
    const restored = readFileSync(join(targetDir, 'agents', 'persona.md'), 'utf8');
    expect(restored).toBe('# Persona\n');
  });

  it('refuses to init into the templates dir itself without --force', () => {
    const result = initCommand({ targetDir: templatesDir, templatesDir });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errorMessage).toMatch(/templates directory/i);
  });
});
