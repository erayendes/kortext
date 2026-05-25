import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  countHandoverEntries,
  deriveArchiveTimestamp,
  rotateHandover,
} from '../server/services/handover-rotation.ts';

let projectRoot: string;
let memoryDir: string;
let livePath: string;

const ENTRY_TEMPLATE = (id: string, dateLine = '**Date:** 22.05.26-10:30') =>
  `## Handover: ${id} — Item ${id}\n\n` +
  `> [!INFO]\n` +
  `> - **Author:** +backend-developer\n` +
  `> - **To:** +qa-engineer\n` +
  `> - ${dateLine}\n` +
  `> - **Status:** Tamamlandı\n\n` +
  `### Completed\n\n- did stuff\n\n`;

function seedLiveFile(entries: string[]): void {
  const header = '# Handover Reports\n\n';
  writeFileSync(livePath, header + entries.join(''), 'utf8');
}

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'kortext-rotation-'));
  memoryDir = join(projectRoot, '.kortext', 'memory');
  mkdirSync(memoryDir, { recursive: true });
  livePath = join(memoryDir, 'handover.md');
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('countHandoverEntries', () => {
  it('counts `## Handover:` heading occurrences', () => {
    expect(countHandoverEntries('')).toBe(0);
    expect(countHandoverEntries('## Handover: T01 — x\n## Handover: T02 — y\n')).toBe(2);
  });

  it('ignores ## headings that are not handover entries', () => {
    const md = '## Random\n## Handover: T01 — x\n## Notes\n';
    expect(countHandoverEntries(md)).toBe(1);
  });
});

describe('deriveArchiveTimestamp', () => {
  it('uses the oldest entry date when present', () => {
    const md =
      '## Handover: A\n**Date:** 20.05.26-09:15\n\n' +
      '## Handover: B\n**Date:** 18.05.26-14:42\n';
    const fallback = new Date('1999-01-01T00:00:00Z');
    expect(deriveArchiveTimestamp(md, fallback)).toBe('2026-05-18-1442');
  });

  it('falls back to now() when no Date line matches', () => {
    expect(
      deriveArchiveTimestamp('no entries here', new Date('2026-05-22T10:30:00Z')),
    ).toBe('2026-05-22-1030');
  });
});

describe('rotateHandover', () => {
  it('returns no_file when the live file does not exist', () => {
    const res = rotateHandover({ projectRoot });
    expect(res).toEqual({ rotated: false, reason: 'no_file' });
  });

  it('returns below_threshold when fewer than maxEntries and small file', () => {
    seedLiveFile([ENTRY_TEMPLATE('T01'), ENTRY_TEMPLATE('T02')]);
    const res = rotateHandover({ projectRoot });
    expect(res).toEqual({ rotated: false, reason: 'below_threshold' });
  });

  it('rotates when entry count reaches maxEntries (default 5)', () => {
    const entries = ['T01', 'T02', 'T03', 'T04', 'T05'].map((id) =>
      ENTRY_TEMPLATE(id, '**Date:** 22.05.26-10:30'),
    );
    seedLiveFile(entries);
    const res = rotateHandover({
      projectRoot,
      now: () => new Date('2026-05-22T10:30:00Z'),
    });
    expect(res.rotated).toBe(true);
    if (!res.rotated) throw new Error('expected rotation');
    expect(res.entries).toBe(5);
    expect(res.archivePath).toMatch(/handover-2026-05-22-1030\.md$/);

    const archived = readFileSync(res.archivePath, 'utf8');
    expect(archived).toContain('## Handover: T01');
    expect(archived).toContain('## Handover: T05');

    const live = readFileSync(livePath, 'utf8');
    expect(live.startsWith('# Handover Reports')).toBe(true);
    expect(live).not.toContain('## Handover:');
  });

  it('rotates when byte size exceeds maxBytes regardless of entry count', () => {
    const big = ENTRY_TEMPLATE('T01') + 'X'.repeat(100);
    seedLiveFile([big, big]);
    const res = rotateHandover({
      projectRoot,
      maxBytes: 50,
      maxEntries: 1000,
      now: () => new Date('2026-05-22T10:30:00Z'),
    });
    expect(res.rotated).toBe(true);
  });

  it('does not rotate when over byte threshold but zero entries (empty body)', () => {
    writeFileSync(livePath, '# Handover Reports\n\n' + 'Y'.repeat(40 * 1024), 'utf8');
    const res = rotateHandover({ projectRoot });
    expect(res).toEqual({ rotated: false, reason: 'below_threshold' });
  });

  it('idempotent — second call after rotation is a no-op', () => {
    const entries = ['T01', 'T02', 'T03', 'T04', 'T05'].map((id) => ENTRY_TEMPLATE(id));
    seedLiveFile(entries);
    rotateHandover({ projectRoot, now: () => new Date('2026-05-22T10:30:00Z') });
    const before = readdirSync(memoryDir).sort();
    const res2 = rotateHandover({ projectRoot, now: () => new Date('2026-05-22T10:30:00Z') });
    expect(res2.rotated).toBe(false);
    const after = readdirSync(memoryDir).sort();
    expect(after).toEqual(before);
  });

  it('suffixes -2 when an archive with the same timestamp already exists', () => {
    const entries = ['T01', 'T02', 'T03', 'T04', 'T05'].map((id) =>
      ENTRY_TEMPLATE(id, '**Date:** 22.05.26-10:30'),
    );
    seedLiveFile(entries);
    rotateHandover({ projectRoot, now: () => new Date('2026-05-22T10:30:00Z') });

    // Re-seed live file with another batch carrying the same date stamp.
    seedLiveFile(entries);
    const res = rotateHandover({
      projectRoot,
      now: () => new Date('2026-05-22T10:30:00Z'),
    });
    expect(res.rotated).toBe(true);
    if (!res.rotated) throw new Error('expected rotation');
    expect(res.archivePath).toMatch(/handover-2026-05-22-1030-2\.md$/);
  });
});
