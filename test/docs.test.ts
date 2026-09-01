import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';
import { createProject } from '../server/projects.js';
import { docPath, listDocs, parseWorkflowSteps, setFrontmatterStatus, hasOpenQuestions } from '../server/docs.js';

const pkgRoot = process.cwd();

test('parseWorkflowSteps extracts inputs/outputs/author/approver per output', () => {
  const steps = parseWorkflowSteps(readFileSync(join(pkgRoot, 'workflows', 'new-project-analysis.md'), 'utf8'));
  const prd = steps.find((s) => s.output === 'foundation/PRD.md');
  assert.ok(prd);
  assert.equal(prd.author, '+product-manager');
  // The PRD is written from the brief alone: measurement instruments it and
  // compliance judges it, so both come after.
  assert.deepEqual(prd.inputs, ['foundation/BRD.md']);
  const legal = steps.find((s) => s.output === 'LEGAL.md');
  assert.ok(legal);
  assert.ok(legal.inputs.includes('ENVIRONMENT.md'), 'compliance needs the hosting region');
  assert.ok(legal.inputs.includes('DATABASE.md'), 'compliance needs the stored fields');
  const stack = steps.find((s) => s.output === 'STACK.md');
  assert.ok(stack);
  assert.equal(stack.author, '+architect');
});

test('listDocs: dependency blocking follows approvals; regressed input warns dependents', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme') }, pkgRoot);

  let docs = listDocs(db, p, pkgRoot);
  const byRel = (rel: string) => docs.find((d) => d.rel === rel)!;
  // BRD is draft and unblocked; PRD depends on BRD (not approved yet) → blocked
  assert.equal(byRel('foundation/BRD.md').status, 'draft');
  assert.equal(byRel('foundation/BRD.md').blocked, false);
  assert.equal(byRel('foundation/PRD.md').blocked, true);
  // BRD sorts before PRD (dependency depth)
  assert.ok(docs.findIndex((d) => d.rel === 'foundation/BRD.md') < docs.findIndex((d) => d.rel === 'foundation/PRD.md'));

  // approve BRD → PRD unblocks; LEGAL stays blocked far longer, because it is
  // written against the design rather than before it
  setFrontmatterStatus(docPath(p, 'foundation/BRD.md'), 'approved');
  docs = listDocs(db, p, pkgRoot);
  assert.equal(byRel('foundation/BRD.md').status, 'approved');
  assert.equal(byRel('foundation/PRD.md').blocked, false);
  assert.equal(byRel('LEGAL.md').blocked, true);

  setFrontmatterStatus(docPath(p, 'foundation/PRD.md'), 'approved');
  docs = listDocs(db, p, pkgRoot);
  assert.equal(byRel('GROWTH.md').blocked, false);
  assert.equal(byRel('STACK.md').blocked, false);
  assert.equal(byRel('LEGAL.md').blocked, true); // still waiting on STACK, DATABASE, ENVIRONMENT

  // BRD falls back to draft after PRD was written → PRD warns upstreamChanged
  setFrontmatterStatus(docPath(p, 'foundation/BRD.md'), 'draft');
  docs = listDocs(db, p, pkgRoot);
  assert.equal(byRel('foundation/PRD.md').upstreamChanged, true);

  rmSync(work, { recursive: true, force: true });
});

test('docPath rejects traversal', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme') }, pkgRoot);
  assert.throws(() => docPath(p, '../../etc/passwd'));
  assert.throws(() => docPath(p, 'foundation/../secret.md'));
  rmSync(work, { recursive: true, force: true });
});

test('plan gate rel (TODO.md at root) passes docPath guard', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme') }, pkgRoot);
  assert.ok(docPath(p, 'TODO.md').endsWith('/.kortext/TODO.md'));
  rmSync(work, { recursive: true, force: true });
});

test('parsePickedPath: trims, strips trailing slash, null on cancel/empty', async () => {
  const { parsePickedPath } = await import('../server/pick-directory.js');
  assert.equal(parsePickedPath('/Users/x/proj/\n', 0), '/Users/x/proj');
  assert.equal(parsePickedPath('', 0), null);
  assert.equal(parsePickedPath('/Users/x\n', 1), null);
});

test('not-applicable input satisfies dependencies downstream', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme') }, pkgRoot);
  setFrontmatterStatus(docPath(p, 'foundation/BRD.md'), 'approved');
  setFrontmatterStatus(docPath(p, 'LEGAL.md'), 'approved');
  setFrontmatterStatus(docPath(p, 'GROWTH.md'), 'not-applicable');
  const docs = listDocs(db, p, pkgRoot);
  const prd = docs.find((d) => d.rel === 'foundation/PRD.md')!;
  assert.equal(prd.blocked, false); // GROWTH n/a + LEGAL approved unblock PRD
  rmSync(work, { recursive: true, force: true });
});

test('analysisComplete: only when every workflow-produced doc is settled', async () => {
  const { analysisComplete } = await import('../server/docs.js');
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'HS', repoPath: join(work, 'hs') }, pkgRoot);
  assert.equal(analysisComplete(db, p, pkgRoot), false);
  // settle everything the map produces (+ BRD gate)
  setFrontmatterStatus(docPath(p, 'foundation/BRD.md'), 'approved');
  const { loadDocMap } = await import('../server/docs.js');
  for (const rel of loadDocMap(pkgRoot, 'new').keys()) {
    if (rel.endsWith('backlog.yaml') || rel === 'TODO.md') continue;
    setFrontmatterStatus(docPath(p, rel), rel === 'GROWTH.md' ? 'not-applicable' : 'approved');
  }
  assert.equal(analysisComplete(db, p, pkgRoot), true);
  rmSync(work, { recursive: true, force: true });
});

test('open questions are the ones a human still has to answer', () => {
  const empty = `# Doc

## Open Questions for prime

- [Anything prime must answer before this document can be relied on — leave this section empty when there is nothing]
`;
  assert.equal(hasOpenQuestions(empty), false); // the template's own prompt is not a question

  const asked = `# Doc

## Open Questions for prime

- Hosting region: Frankfurt or Türkiye?
`;
  assert.equal(hasOpenQuestions(asked), true);

  // A question outside the section is not tracked — one place to look is the point.
  assert.equal(hasOpenQuestions('# Doc\n\n## Scope\n\n- Which region?\n'), false);
});
