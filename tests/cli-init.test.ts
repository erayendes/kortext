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

  // v3.1 minimal template tree: only the things init still copies. Personas,
  // workflows, and rules now live in the npm package itself and are loaded
  // from there, so they no longer appear under templates/.
  mkdirSync(join(templatesDir, 'templates', 'references'), { recursive: true });
  writeFileSync(
    join(templatesDir, 'templates', 'references', 'blueprint.md'),
    '---\nstatus: uninitialized\n---\n# Blueprint\n',
    'utf8',
  );
  mkdirSync(join(templatesDir, 'templates', 'reports'), { recursive: true });
  writeFileSync(
    join(templatesDir, 'templates', 'reports', 'test-reports.md'),
    '---\nstatus: uninitialized\n---\n# Test Report\n',
    'utf8',
  );
  mkdirSync(join(templatesDir, 'templates', 'memory'), { recursive: true });
  writeFileSync(
    join(templatesDir, 'templates', 'memory', 'handover.md'),
    '# Handover Reports\n',
    'utf8',
  );
  writeFileSync(join(templatesDir, 'templates', 'AGENTS.md'), '# Template AGENTS\n', 'utf8');
  writeFileSync(
    join(templatesDir, 'templates', '.gitignore'),
    '.kortext/data/\n.env\nnode_modules/\n.DS_Store\n',
    'utf8',
  );
  writeFileSync(
    join(templatesDir, 'templates', '.env.example'),
    '# Kortext env\nKORTEXT_PORT=3200\n',
    'utf8',
  );
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('initCommand', () => {
  it('scaffolds a fresh project under .kortext/ + AGENTS.md + DB', () => {
    const result = initCommand({ targetDir, templatesDir });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');

    // v3.1: root gets AGENTS.md / .gitignore / .env.example; the framework
    // folder is `.kortext/` (think `.git/`); personas/workflows/rules are
    // NOT copied (loaded from the package).
    expect(result.created).toEqual(
      expect.arrayContaining([
        'AGENTS.md',
        '.gitignore',
        '.env.example',
        join('.kortext', 'references'),
        join('.kortext', 'reports'),
        join('.kortext', 'memory'),
        join('.kortext', 'data'),
        join('.kortext', 'data', 'kortext.db'),
      ]),
    );
    expect(result.skipped).toEqual([]);

    // Files copied from templates/.
    expect(existsSync(join(targetDir, '.kortext', 'references', 'blueprint.md'))).toBe(true);
    expect(existsSync(join(targetDir, '.kortext', 'reports', 'test-reports.md'))).toBe(true);
    expect(existsSync(join(targetDir, '.kortext', 'memory', 'handover.md'))).toBe(true);
    expect(existsSync(join(targetDir, '.gitignore'))).toBe(true);
    expect(existsSync(join(targetDir, '.env.example'))).toBe(true);

    // No per-project copy of personas / workflows / rules anymore.
    expect(existsSync(join(targetDir, 'agents'))).toBe(false);
    expect(existsSync(join(targetDir, 'workflows'))).toBe(false);
    expect(existsSync(join(targetDir, 'rules'))).toBe(false);
    expect(existsSync(join(targetDir, 'workspace'))).toBe(false);

    const agentsMd = readFileSync(join(targetDir, 'AGENTS.md'), 'utf8');
    expect(agentsMd).toBe('# Template AGENTS\n');

    // DB was created and migrations applied (schemaVersion > 0).
    expect(result.schemaVersion).toBeGreaterThan(0);
    expect(existsSync(result.dbPath)).toBe(true);
    expect(result.dbPath).toBe(join(targetDir, '.kortext', 'data', 'kortext.db'));

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
        'AGENTS.md',
        '.gitignore',
        '.env.example',
        join('.kortext', 'references'),
        join('.kortext', 'reports'),
        join('.kortext', 'memory'),
        join('.kortext', 'data'),
        join('.kortext', 'data', 'kortext.db'),
      ]),
    );
  });

  it('writes the default AGENTS.md when the template lacks one', () => {
    rmSync(join(templatesDir, 'templates', 'AGENTS.md'));
    const result = initCommand({ targetDir, templatesDir });
    expect(result.ok).toBe(true);
    const written = readFileSync(join(targetDir, 'AGENTS.md'), 'utf8');
    expect(written).toMatch(/Kortext v3/);
    expect(written).toMatch(/kortext serve/);
  });

  it('with --force re-copies even when target dirs already exist', () => {
    initCommand({ targetDir, templatesDir });

    // User edited a scaffolded file; --force should overwrite.
    writeFileSync(
      join(targetDir, '.kortext', 'references', 'blueprint.md'),
      '# Edited\n',
      'utf8',
    );

    const result = initCommand({ targetDir, templatesDir, force: true });
    expect(result.ok).toBe(true);
    const restored = readFileSync(
      join(targetDir, '.kortext', 'references', 'blueprint.md'),
      'utf8',
    );
    expect(restored).toMatch(/^---\nstatus: uninitialized\n---\n# Blueprint/);
  });

  it('refuses to init into the templates dir itself without --force', () => {
    const result = initCommand({ targetDir: templatesDir, templatesDir });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errorMessage).toMatch(/templates directory/i);
  });
});
