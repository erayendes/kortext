import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';
import { createProject } from '../server/projects.js';
import {
  analysisComplete,
  docPath,
  listDocs,
  parseWorkflowSteps,
  setFrontmatterStatus,
  hasOpenQuestions,
  parseRevisionRequests,
  markRequestHandled,
} from '../server/docs.js';

const pkgRoot = process.cwd();

test('parseWorkflowSteps extracts inputs/outputs/author/approver per output', () => {
  const steps = parseWorkflowSteps(
    readFileSync(join(pkgRoot, 'workflows', 'new-project-analysis.md'), 'utf8'),
  );
  const prd = steps.find((s) => s.output === 'PRODUCT.md');
  assert.ok(prd);
  assert.equal(prd.author, '+product-manager');
  // The PRD is written from the brief alone: measurement instruments it and
  // compliance judges it, so both come after.
  assert.deepEqual(prd.inputs, ['BRIEF.md']);
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
  // the brief is draft and unblocked; PRODUCT depends on it → blocked
  assert.equal(byRel('BRIEF.md').status, 'draft');
  assert.equal(byRel('BRIEF.md').blocked, false);
  assert.equal(byRel('PRODUCT.md').blocked, true);
  // the brief sorts before PRODUCT (dependency depth)
  assert.ok(
    docs.findIndex((d) => d.rel === 'BRIEF.md') < docs.findIndex((d) => d.rel === 'PRODUCT.md'),
  );
  // The graph is a diamond: nearly everything descends from the PRD, so a
  // document must sort behind every input, not behind whichever branch was
  // walked first. STACK feeds ARCHITECTURE, SECURITY feeds ENVIRONMENT feeds
  // DATABASE feeds API.
  const at = (rel: string) => docs.findIndex((d) => d.rel === rel);
  for (const [before, after] of [
    ['STACK.md', 'ARCHITECTURE.md'],
    ['ARCHITECTURE.md', 'SECURITY.md'],
    ['SECURITY.md', 'ENVIRONMENT.md'],
    ['ENVIRONMENT.md', 'DATABASE.md'],
    ['DATABASE.md', 'API.md'],
    ['DESIGN.md', 'GROWTH.md'],
    ['LEGAL.md', 'ENGINEERING.md'],
    ['ENGINEERING.md', 'TEST.md'],
  ]) {
    assert.ok(at(before) < at(after), `${before} must sort before ${after}`);
  }

  // approve the brief → PRODUCT unblocks; LEGAL stays blocked far longer, because it is
  // written against the design rather than before it
  setFrontmatterStatus(docPath(p, 'BRIEF.md'), 'approved');
  docs = listDocs(db, p, pkgRoot);
  assert.equal(byRel('BRIEF.md').status, 'approved');
  assert.equal(byRel('PRODUCT.md').blocked, false);
  assert.equal(byRel('LEGAL.md').blocked, true);

  setFrontmatterStatus(docPath(p, 'PRODUCT.md'), 'approved');
  docs = listDocs(db, p, pkgRoot);
  assert.equal(byRel('STACK.md').blocked, false);
  // measurement reads the surfaces design names, so GROWTH waits for DESIGN
  assert.equal(byRel('GROWTH.md').blocked, true);
  assert.equal(byRel('LEGAL.md').blocked, true); // still waiting on STACK, DATABASE, ENVIRONMENT

  // Only an approved document is dependent: a draft one is about to be
  // rewritten anyway, so an input that moved under it is not news.
  setFrontmatterStatus(docPath(p, 'BRIEF.md'), 'draft');
  docs = listDocs(db, p, pkgRoot);
  assert.deepEqual(byRel('PRODUCT.md').dependentOn, ['BRIEF.md']);
  // …and a document still in draft is not: STACK reads the same brief.
  assert.deepEqual(byRel('STACK.md').dependentOn, []);

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

test("the brief is prime's own document; every other one has a step that writes it", () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Own', repoPath: join(work, 'own') }, pkgRoot);
  const docs = listDocs(db, p, pkgRoot);
  assert.equal(docs.find((d) => d.rel === 'BRIEF.md')!.hasProducingStep, false);
  for (const d of docs.filter((x) => x.rel !== 'BRIEF.md')) {
    assert.equal(d.hasProducingStep, true, d.rel);
  }
  rmSync(work, { recursive: true, force: true });
});

test('not-applicable input satisfies dependencies downstream', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme') }, pkgRoot);
  setFrontmatterStatus(docPath(p, 'BRIEF.md'), 'approved');
  setFrontmatterStatus(docPath(p, 'PRODUCT.md'), 'approved');
  setFrontmatterStatus(docPath(p, 'DESIGN.md'), 'not-applicable');
  const docs = listDocs(db, p, pkgRoot);
  const growth = docs.find((d) => d.rel === 'GROWTH.md')!;
  assert.equal(growth.blocked, false); // a product with no surface still gets measured
  rmSync(work, { recursive: true, force: true });
});

test('analysisComplete: only when every workflow-produced doc is settled', async () => {
  const { analysisComplete } = await import('../server/docs.js');
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'HS', repoPath: join(work, 'hs') }, pkgRoot);
  assert.equal(analysisComplete(db, p, pkgRoot), false);
  // settle everything the map produces (+ the brief gate)
  setFrontmatterStatus(docPath(p, 'BRIEF.md'), 'approved');
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

test('a revision request lands in the inbox of the document it names', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Req', repoPath: join(work, 'req') }, pkgRoot);

  const parsed = parseRevisionRequests(`# TRD

## Revision Requests

- \`ENVIRONMENT.md\` — the access-log lines must follow the no-logs decision
- [\`TARGET.md\` — what must change there and why]
- A sentence about ENVIRONMENT.md that is not a request.
`);
  // Only the backticked form counts; the template's own prompt does not.
  assert.deepEqual(parsed, [
    { target: 'ENVIRONMENT.md', reason: 'the access-log lines must follow the no-logs decision' },
  ]);

  writeFileSync(
    docPath(p, 'ENGINEERING.md'),
    '---\nstatus: approved\n---\n\n## Revision Requests\n\n- `ENVIRONMENT.md` — logs must go\n',
    'utf8',
  );
  writeFileSync(docPath(p, 'ENVIRONMENT.md'), '---\nstatus: approved\n---\n\n# Env\n', 'utf8');
  const docs = listDocs(db, p, pkgRoot);
  const env = docs.find((d) => d.rel === 'ENVIRONMENT.md')!;
  assert.deepEqual(env.revisionRequests, [{ from: 'ENGINEERING.md', reason: 'logs must go' }]);
  // The same demand is decidable from the document that made it.
  assert.deepEqual(docs.find((d) => d.rel === 'ENGINEERING.md')!.sentRequests, [
    { target: 'ENVIRONMENT.md', reason: 'logs must go', targetHasStep: true },
  ]);

  // An open demand keeps the handshake from completing, and being actioned clears it.
  assert.equal(analysisComplete(db, p, pkgRoot), false);
  markRequestHandled(
    p,
    'ENGINEERING.md',
    'ENVIRONMENT.md',
    'logs must go',
    'dismissed by prime — no change made',
  );
  const after = listDocs(db, p, pkgRoot).find((d) => d.rel === 'ENVIRONMENT.md')!;
  assert.deepEqual(after.revisionRequests, []);
  rmSync(work, { recursive: true, force: true });
});

test('a demand on a foundation document is settled by the path it was decided on', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Key', repoPath: join(work, 'key') }, pkgRoot);
  // Documents name their target the short way; the route records the rel.
  // Keying the two differently left foundation demands standing forever.
  writeFileSync(
    docPath(p, 'PRODUCT.md'),
    '---\nstatus: approved\n---\n\n## Revision Requests\n\n- `BRIEF.md` — say it the other way round\n',
    'utf8',
  );
  setFrontmatterStatus(docPath(p, 'BRIEF.md'), 'approved');
  const brd = () => listDocs(db, p, pkgRoot).find((d) => d.rel === 'BRIEF.md')!;
  assert.equal(brd().revisionRequests.length, 1);
  markRequestHandled(
    p,
    'PRODUCT.md',
    'BRIEF.md',
    'say it the other way round',
    'applied — the agent rewrote it',
  );
  assert.equal(brd().revisionRequests.length, 0);
  // The ticked box is what closes it, and the line under it says what closed
  // it — a dismissal and a rewrite must not leave the same record.
  const prd = readFileSync(docPath(p, 'PRODUCT.md'), 'utf8');
  assert.match(prd, /^- \[x\] `BRIEF\.md` — say it the other way round$/m);
  assert.match(prd, /^ {2}- applied — the agent rewrote it · \d{4}-\d{2}-\d{2}$/m);
  rmSync(work, { recursive: true, force: true });
});
