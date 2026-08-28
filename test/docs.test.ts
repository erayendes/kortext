import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';
import { createProject } from '../server/projects.js';
import { createRequest } from '../server/requests.js';
import { docPath, listDocs, parseWorkflowSteps, setFrontmatterStatus } from '../server/docs.js';

const pkgRoot = process.cwd();

test('parseWorkflowSteps extracts inputs/outputs/author/approver per output', () => {
  const steps = parseWorkflowSteps(readFileSync(join(pkgRoot, 'workflows', 'new-project-analysis.md'), 'utf8'));
  const prd = steps.find((s) => s.output === 'foundation/PRD.md');
  assert.ok(prd);
  assert.equal(prd.author, '+product-manager');
  assert.deepEqual(prd.inputs.sort(), ['foundation/BRD.md', 'references/GROWTH.md', 'references/LEGAL.md']);
  const stack = steps.find((s) => s.output === 'references/STACK.md');
  assert.ok(stack);
  assert.equal(stack.author, '+engineering-manager');
});

test('listDocs: dependency blocking follows approvals; revise request flags doc', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme'), mode: 'new' }, pkgRoot);

  let docs = listDocs(db, p, pkgRoot);
  const byRel = (rel: string) => docs.find((d) => d.rel === rel)!;
  // BRD is draft and unblocked; LEGAL depends on BRD (not approved yet) → blocked
  assert.equal(byRel('foundation/BRD.md').status, 'draft');
  assert.equal(byRel('foundation/BRD.md').blocked, false);
  assert.equal(byRel('references/LEGAL.md').blocked, true);
  // BRD sorts before PRD (dependency depth)
  assert.ok(docs.findIndex((d) => d.rel === 'foundation/BRD.md') < docs.findIndex((d) => d.rel === 'foundation/PRD.md'));

  // approve BRD → LEGAL unblocks
  setFrontmatterStatus(docPath(p, 'foundation/BRD.md'), 'approved');
  docs = listDocs(db, p, pkgRoot);
  assert.equal(byRel('foundation/BRD.md').status, 'approved');
  assert.equal(byRel('references/LEGAL.md').blocked, false);

  // pending revise on BRD → BRD flagged, dependents warn once written
  createRequest(db, p.id, 'revise', { doc: 'foundation/BRD.md', notes: ['x'] });
  setFrontmatterStatus(docPath(p, 'references/LEGAL.md'), 'draft'); // pretend agent wrote it
  docs = listDocs(db, p, pkgRoot);
  assert.equal(byRel('foundation/BRD.md').revisionPending, true);
  assert.equal(byRel('references/LEGAL.md').upstreamChanged, true);

  rmSync(work, { recursive: true, force: true });
});

test('docPath rejects traversal', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme'), mode: 'new' }, pkgRoot);
  assert.throws(() => docPath(p, '../../etc/passwd'));
  assert.throws(() => docPath(p, 'foundation/../secret.md'));
  rmSync(work, { recursive: true, force: true });
});

test('plan gate rel (memory/TODO.md) passes docPath guard', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme'), mode: 'new' }, pkgRoot);
  assert.ok(docPath(p, 'memory/TODO.md').endsWith('/.kortext/memory/TODO.md'));
  rmSync(work, { recursive: true, force: true });
});
