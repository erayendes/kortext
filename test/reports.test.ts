import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';
import { createProject } from '../server/projects.js';
import { generateChangeReport, listReports } from '../server/reports.js';

const pkgRoot = process.cwd();

test('change report: doc snapshot written to .kortext/reports and listed', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme') }, pkgRoot);

  const report = generateChangeReport(db, p, pkgRoot, new Date('2026-08-28T10:00:00Z'));
  assert.match(report.rel, /^reports\/change-2026-08-28/);
  const body = readFileSync(join(work, 'acme', '.kortext', report.rel), 'utf8');
  assert.match(body, /type: change/);
  assert.match(body, /foundation\/BRD\.md \| draft/);

  const listed = listReports(p);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].type, 'change');
  rmSync(work, { recursive: true, force: true });
});

test('agent-written report files appear in the listing, newest first', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme') }, pkgRoot);
  const dir = join(work, 'acme', '.kortext', 'reports');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'risk-2026-08-28.md'), '---\nstatus: report\ntype: risk\n---\n\n# Risk\n');
  const listed = listReports(p);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].type, 'risk');
  // report templates are no longer copied — they travel inside the request payload
  assert.equal(existsSync(join(work, 'acme', '.kortext', 'templates')), false);
  rmSync(work, { recursive: true, force: true });
});
