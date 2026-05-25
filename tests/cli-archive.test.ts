import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archiveCommand } from '../server/cli/archive.ts';

let projectRoot: string;
let livePath: string;

const ENTRY = (id: string) =>
  `## Handover: ${id} — Item ${id}\n\n` +
  `> [!INFO]\n` +
  `> - **Author:** +a\n` +
  `> - **To:** +b\n` +
  `> - **Date:** 22.05.26-10:30\n` +
  `> - **Status:** Tamamlandı\n\n` +
  `### Completed\n\n- done\n\n`;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'kortext-archive-cli-'));
  mkdirSync(join(projectRoot, '.kortext', 'memory'), { recursive: true });
  livePath = join(projectRoot, '.kortext', 'memory', 'handover.md');
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('archiveCommand', () => {
  it('reports no_file when handover.md is missing', () => {
    const res = archiveCommand({ what: 'handover', projectRoot });
    expect(res).toMatchObject({ ok: true, rotated: false, reason: 'no_file' });
  });

  it('forces rotation even when below the default threshold', () => {
    writeFileSync(livePath, '# Handover Reports\n\n' + ENTRY('T01'), 'utf8');
    const res = archiveCommand({ what: 'handover', projectRoot });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.rotated).toBe(true);
    expect(res.archivePath).toMatch(/handover-2026-05-22-1030\.md$/);
    if (!res.archivePath) throw new Error('expected archivePath');
    expect(existsSync(res.archivePath)).toBe(true);
    const live = readFileSync(livePath, 'utf8');
    expect(live).not.toContain('## Handover:');
  });

  it('rejects unsupported targets', () => {
    // @ts-expect-error — intentionally bad input
    const res = archiveCommand({ what: 'decisions', projectRoot });
    expect(res).toEqual({ ok: false, errorMessage: expect.stringContaining('decisions') });
  });
});
