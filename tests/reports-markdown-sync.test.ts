import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import {
  MarkdownSyncService,
  parseReportFilename,
} from '../server/services/markdown-sync.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;
let sync: MarkdownSyncService;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-md-reports-'));
  const bundle = openDb({ path: join(tmpRoot, 'md.db') });
  db = bundle.db;
  repos = bundle.repositories;
  sync = new MarkdownSyncService(repos, { root: tmpRoot });
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('parseReportFilename', () => {
  it('parses a well-formed per-file report name', () => {
    expect(
      parseReportFilename('test-reports_login-flow_2026-05-24-1432.md'),
    ).toEqual({
      scope: 'test-reports',
      slug: 'login-flow',
      timestamp: '2026-05-24-1432',
    });
  });

  it('accepts a full path and parses the basename', () => {
    expect(
      parseReportFilename(
        '/abs/.kortext/reports/security-reports_auth-audit_2026-05-26-1100.md',
      ),
    ).toEqual({
      scope: 'security-reports',
      slug: 'auth-audit',
      timestamp: '2026-05-26-1100',
    });
  });

  it('rejects names that do not match the pattern', () => {
    expect(parseReportFilename('blueprint.md')).toBeNull();
    expect(parseReportFilename('test-reports_only-two-parts.md')).toBeNull();
    expect(
      parseReportFilename('test-reports_slug_2026-05-24.md'),
    ).toBeNull();
    expect(parseReportFilename('TEST_slug_2026-05-24-1100.md')).toBeNull();
  });

  it('parses the new canonical timestamp YYYY-MM-DD_HH-MM-SS', () => {
    expect(
      parseReportFilename('status-reports_NOT_2026-06-08_17-46-49.md'),
    ).toEqual({
      scope: 'status-reports',
      slug: 'NOT',
      timestamp: '2026-06-08_17-46-49',
    });
  });

  it('accepts an UPPERCASE project-id slug (project.json.code)', () => {
    const parsed = parseReportFilename('test-reports_TF_2026-06-08_17-46-49.md');
    expect(parsed?.slug).toBe('TF');
  });
});

describe('MarkdownSyncService.writeReport', () => {
  it('writes a per-file report and indexes it', () => {
    const { markdown_path, reportId } = sync.writeReport({
      scope: 'test-reports',
      slug: 'login-flow',
      author: '+qa-engineer',
      status: 'writing',
      tags: ['p1'],
      body_md: '# Login flow\n\nTests passed.\n',
      timestamp: new Date(Date.UTC(2026, 4, 24, 14, 32)), // 2026-05-24 14:32 UTC
    });
    // Canonical single timestamp format: YYYY-MM-DD_HH-MM-SS (UAT #5 standard).
    expect(markdown_path).toBe(
      '.kortext/reports/test-reports_login-flow_2026-05-24_14-32-00.md',
    );
    const row = repos.reports.get(reportId);
    expect(row?.scope).toBe('test-reports');
    expect(row?.status).toBe('writing');
    expect(row?.tags).toEqual(['p1']);

    const content = sync.readArtifact(markdown_path);
    expect(content).toContain('status: writing');
    expect(content).toContain('author: +qa-engineer');
    expect(content).toContain('# Login flow');
  });

  it('re-write at same path reuses the row and updates status', () => {
    const ts = new Date(Date.UTC(2026, 5, 1, 9, 0));
    const first = sync.writeReport({
      scope: 'delivery-reports',
      slug: 'v1-staging',
      body_md: 'draft',
      status: 'writing',
      timestamp: ts,
    });
    const second = sync.writeReport({
      scope: 'delivery-reports',
      slug: 'v1-staging',
      body_md: 'final',
      status: 'approved',
      timestamp: ts,
    });
    expect(second.reportId).toBe(first.reportId);
    expect(repos.reports.get(second.reportId)?.status).toBe('approved');
    expect(repos.reports.list()).toHaveLength(1);
  });
});

describe('MarkdownSyncService.indexReportFromPath', () => {
  it('indexes a file that lives under .kortext/reports/ with the pattern', () => {
    const filename = 'security-reports_auth-audit_2026-05-26-1100.md';
    const abs = join(tmpRoot, '.kortext/reports', filename);
    mkdirSync(join(tmpRoot, '.kortext/reports'), { recursive: true });
    writeFileSync(abs, '# audit\n');

    const id = sync.indexReportFromPath({
      absolutePath: abs,
      author: '+security-engineer',
      relatedItem: 'T07-auth',
    });
    expect(id).not.toBeNull();
    const row = repos.reports.get(id!);
    expect(row?.scope).toBe('security-reports');
    expect(row?.slug).toBe('auth-audit');
    expect(row?.related_item).toBe('T07-auth');
    expect(row?.file_path).toBe(
      `.kortext/reports/${filename}`,
    );
  });

  it('returns the same row id if called twice for the same path', () => {
    const filename = 'test-reports_idempotent_2026-05-26-1200.md';
    const abs = join(tmpRoot, '.kortext/reports', filename);
    mkdirSync(join(tmpRoot, '.kortext/reports'), { recursive: true });
    writeFileSync(abs, 'body');

    const first = sync.indexReportFromPath({ absolutePath: abs });
    const second = sync.indexReportFromPath({ absolutePath: abs });
    expect(first).toBe(second);
    expect(repos.reports.list()).toHaveLength(1);
  });

  it('ignores files outside .kortext/reports/', () => {
    const filename = 'test-reports_outside_2026-05-26-1200.md';
    const abs = join(tmpRoot, 'random', filename);
    mkdirSync(join(tmpRoot, 'random'), { recursive: true });
    writeFileSync(abs, 'body');
    expect(sync.indexReportFromPath({ absolutePath: abs })).toBeNull();
    expect(repos.reports.list()).toHaveLength(0);
  });

  it('ignores files in .kortext/reports/ that do not match the pattern', () => {
    const abs = join(tmpRoot, '.kortext/reports', 'not-a-report.md');
    mkdirSync(join(tmpRoot, '.kortext/reports'), { recursive: true });
    writeFileSync(abs, 'body');
    expect(sync.indexReportFromPath({ absolutePath: abs })).toBeNull();
    expect(repos.reports.list()).toHaveLength(0);
  });

  it('ignores files that match the pattern but do not exist on disk', () => {
    const abs = join(
      tmpRoot,
      '.kortext/reports',
      'test-reports_ghost_2026-05-26-1200.md',
    );
    expect(sync.indexReportFromPath({ absolutePath: abs })).toBeNull();
  });
});
