import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findActualOutputFiles,
  isPatternedPath,
  resolveDeclaredOutput,
} from '../server/engine/output-resolver.ts';

describe('isPatternedPath', () => {
  it('detects <slug> placeholder', () => {
    expect(isPatternedPath('.kortext/reports/foo_<slug>_2026-01-01-0000.md')).toBe(true);
  });
  it('detects <ts> placeholder', () => {
    expect(isPatternedPath('.kortext/reports/foo_bar_<ts>.md')).toBe(true);
  });
  it('false for static path', () => {
    expect(isPatternedPath('.kortext/foundation/BRD.md')).toBe(false);
  });
});

describe('resolveDeclaredOutput', () => {
  const worktree = '/tmp/wt';

  it('returns static for paths without placeholders', () => {
    const r = resolveDeclaredOutput('.kortext/foundation/BRD.md', worktree);
    expect(r.kind).toBe('static');
    if (r.kind === 'static') {
      expect(r.absolutePath).toBe('/tmp/wt/.kortext/foundation/BRD.md');
    }
  });

  it('returns pattern for filename placeholders', () => {
    const r = resolveDeclaredOutput(
      '.kortext/reports/product-requirements_<slug>_<ts>.md',
      worktree,
    );
    expect(r.kind).toBe('pattern');
    if (r.kind === 'pattern') {
      expect(r.dirAbsolute).toBe('/tmp/wt/.kortext/reports');
      // Matches the markdown-sync naming pattern.
      expect(r.filenameRegex.test('product-requirements_acme_2026-05-25-2030.md')).toBe(true);
      expect(r.filenameRegex.test('product-requirements_a_2026-05-25-2030.md')).toBe(true);
      expect(r.filenameRegex.test('product-requirements_2026-05-25-2030.md')).toBe(false);
      expect(r.filenameRegex.test('other_acme_2026-05-25-2030.md')).toBe(false);
      // Slug cannot start with hyphen.
      expect(r.filenameRegex.test('product-requirements_-acme_2026-05-25-2030.md')).toBe(false);
    }
  });

  it('tolerates timestamp forms real headless agents emit', () => {
    // Headless Claude writes files via the raw Write tool, inventing its own
    // filename — it does NOT always honour the canonical YYYY-MM-DD-HHMM form.
    // The live run produced `planning-reports_planning_20260605.md` (compact,
    // date-only) and the strict pattern dropped a file that existed on disk.
    const r = resolveDeclaredOutput(
      '.kortext/reports/planning-reports_<slug>_<ts>.md',
      worktree,
    );
    if (r.kind !== 'pattern') throw new Error('expected pattern');
    // Canonical form still matches (no regression).
    expect(r.filenameRegex.test('planning-reports_planning_2026-06-05-1959.md')).toBe(true);
    // Compact date (YYYYMMDD) — the exact form the live run emitted.
    expect(r.filenameRegex.test('planning-reports_planning_20260605.md')).toBe(true);
    // Date-only with dashes.
    expect(r.filenameRegex.test('planning-reports_planning_2026-06-05.md')).toBe(true);
    // Compact date + time.
    expect(r.filenameRegex.test('planning-reports_planning_20260605-1959.md')).toBe(true);
    // Still rejects clearly non-date junk in the <ts> slot.
    expect(r.filenameRegex.test('planning-reports_planning_draft.md')).toBe(false);
    // Still anchored on the .md extension.
    expect(r.filenameRegex.test('planning-reports_planning_20260605xmd')).toBe(false);
  });

  it('supports absolute declared paths', () => {
    const r = resolveDeclaredOutput('/var/foo_<slug>_<ts>.md', worktree);
    expect(r.kind).toBe('pattern');
    if (r.kind === 'pattern') expect(r.dirAbsolute).toBe('/var');
  });

  it('rejects placeholders in directory segments', () => {
    expect(() =>
      resolveDeclaredOutput('.kortext/<slug>/foo.md', worktree),
    ).toThrowError(/placeholders are only allowed in the filename/);
  });

  it('escapes regex special chars in literal segments', () => {
    // Dots in literal must be escaped so 'foo_a_2026-05-25-2030xmd' does NOT match.
    const r = resolveDeclaredOutput('reports/test-reports_<slug>_<ts>.md', worktree);
    if (r.kind !== 'pattern') throw new Error('expected pattern');
    expect(r.filenameRegex.test('test-reports_a_2026-05-25-2030.md')).toBe(true);
    expect(r.filenameRegex.test('test-reports_a_2026-05-25-2030xmd')).toBe(false);
  });
});

describe('findActualOutputFiles', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'output-resolver-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('static: returns the file when it exists', () => {
    const file = join(tmp, '.kortext/foundation/BRD.md');
    mkdirSync(join(tmp, '.kortext/foundation'), { recursive: true });
    writeFileSync(file, 'hi');
    expect(findActualOutputFiles('.kortext/foundation/BRD.md', tmp)).toEqual([file]);
  });

  it('static: returns empty when file missing', () => {
    expect(findActualOutputFiles('.kortext/foundation/BRD.md', tmp)).toEqual([]);
  });

  it('pattern: returns matching files in directory', () => {
    const dir = join(tmp, '.kortext/reports');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'product-requirements_acme_2026-05-25-2030.md'), 'a');
    writeFileSync(join(dir, 'product-requirements_other_2026-05-26-1130.md'), 'b');
    writeFileSync(join(dir, 'unrelated.md'), 'c');
    writeFileSync(join(dir, 'tech-requirements_acme_2026-05-25-2031.md'), 'd');

    const matches = findActualOutputFiles(
      '.kortext/reports/product-requirements_<slug>_<ts>.md',
      tmp,
    ).sort();
    expect(matches).toEqual([
      join(dir, 'product-requirements_acme_2026-05-25-2030.md'),
      join(dir, 'product-requirements_other_2026-05-26-1130.md'),
    ]);
  });

  it('pattern: returns empty when directory missing', () => {
    expect(
      findActualOutputFiles('.kortext/reports/foo_<slug>_<ts>.md', tmp),
    ).toEqual([]);
  });

  it('pattern: returns empty when no filenames match', () => {
    const dir = join(tmp, '.kortext/reports');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'unrelated.md'), 'c');
    expect(
      findActualOutputFiles('.kortext/reports/foo_<slug>_<ts>.md', tmp),
    ).toEqual([]);
  });

  it('pattern: ignores subdirectories with matching names', () => {
    const dir = join(tmp, '.kortext/reports');
    mkdirSync(join(dir, 'test-reports_acme_2026-05-25-2030.md'), { recursive: true });
    expect(
      findActualOutputFiles('.kortext/reports/test-reports_<slug>_<ts>.md', tmp),
    ).toEqual([]);
  });
});
