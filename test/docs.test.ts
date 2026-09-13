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
  parseIncoming,
  parseOutgoing,
  parseDenied,
  markRequestHandled,
  removeRequest,
  appendIncomingRequest,
  appendListItem,
  parseConflicts,
  parseWarnings,
  listVersions,
  readVersion,
  recordVersion,
  templateFor,
  unfilledPlaceholders,
} from '../server/docs.js';

const pkgRoot = process.cwd();

test('parseWorkflowSteps extracts inputs/outputs/author/approver per output', () => {
  const steps = parseWorkflowSteps(
    readFileSync(join(pkgRoot, 'workflows', 'new-project-analysis.md'), 'utf8'),
  );
  const prd = steps.find((s) => s.output === 'PRODUCT.md');
  assert.ok(prd);
  assert.equal(prd.author, '+product-manager');
  // PRODUCT.md depends on the brief; growth and compliance documents depend on later analysis.
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
  // Verify maximum dependency depth across shared inputs: STACK to ARCHITECTURE,
  // then SECURITY to ENVIRONMENT to DATABASE to API.
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

  // A conflict and a finding are records handed to the build phase, not
  // decisions owed — neither one holds the handshake back.
  const { appendListItem: append } = await import('../server/docs.js');
  append(p, 'ENVIRONMENT.md', 'Findings', '.gitignore', '.env is tracked', 'found');
  append(
    p,
    'ENVIRONMENT.md',
    'Change Requests',
    'SECURITY.md',
    'the access log stays',
    undefined,
    true,
  );
  markRequestHandled(p, 'ENVIRONMENT.md', 'SECURITY.md', 'the access log stays', 'denied by prime');
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

test('a request travels to the document it names when its author is approved', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Req', repoPath: join(work, 'req') }, pkgRoot);

  const parsed = parseOutgoing(`# TRD

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
  // One place: the request now lives in ENVIRONMENT.md, as a line `from`
  // the document that asked, and ENGINEERING.md no longer carries it.
  assert.deepEqual(env.revisionRequests, [{ from: 'ENGINEERING.md', reason: 'logs must go' }]);
  assert.match(
    readFileSync(docPath(p, 'ENVIRONMENT.md'), 'utf8'),
    /^- \[ \] from `ENGINEERING\.md` — logs must go$/m,
  );
  assert.doesNotMatch(readFileSync(docPath(p, 'ENGINEERING.md'), 'utf8'), /logs must go/);

  // An open request keeps the handshake from completing, and being decided clears it.
  assert.equal(analysisComplete(db, p, pkgRoot), false);
  markRequestHandled(
    p,
    'ENVIRONMENT.md',
    'ENGINEERING.md',
    'logs must go',
    'denied by prime — no change made',
  );
  const after = listDocs(db, p, pkgRoot).find((d) => d.rel === 'ENVIRONMENT.md')!;
  assert.deepEqual(after.revisionRequests, []);
  assert.deepEqual(after.denied, [{ from: 'ENGINEERING.md', reason: 'logs must go' }]);
  rmSync(work, { recursive: true, force: true });
});

test('a refusal leaves the mailbox and enters the ledger', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Key', repoPath: join(work, 'key') }, pkgRoot);
  writeFileSync(
    docPath(p, 'BRIEF.md'),
    '---\nstatus: approved\n---\n\n# Brief\n\n## Change Requests\n\n- [ ] from `PRODUCT.md` — say it the other way round\n',
    'utf8',
  );
  const brd = () => listDocs(db, p, pkgRoot).find((d) => d.rel === 'BRIEF.md')!;
  assert.equal(brd().revisionRequests.length, 1);
  markRequestHandled(p, 'BRIEF.md', 'PRODUCT.md', 'say it the other way round', 'it reads fine');
  assert.equal(brd().revisionRequests.length, 0);
  // Not a request any more — a decision: no box, no "denied", under its own
  // heading, with prime's reason and the day beneath it.
  const brief = readFileSync(docPath(p, 'BRIEF.md'), 'utf8');
  assert.doesNotMatch(brief, /from `PRODUCT\.md`/);
  assert.match(
    brief,
    /## Decisions\n\n- `PRODUCT\.md` — say it the other way round\n {2}- it reads fine$/m,
  );
  assert.deepEqual(brd().denied, [{ from: 'PRODUCT.md', reason: 'say it the other way round' }]);
  // A done request leaves instead — the text says what it asked for.
  appendIncomingRequest(p, 'BRIEF.md', 'STACK.md', 'name the region');
  assert.match(readFileSync(docPath(p, 'BRIEF.md'), 'utf8'), /name the region/);
  removeRequest(p, 'BRIEF.md', 'STACK.md', 'name the region');
  assert.doesNotMatch(readFileSync(docPath(p, 'BRIEF.md'), 'utf8'), /name the region/);
  rmSync(work, { recursive: true, force: true });
});

test('a template line the agent never replaced is unfilled; prose in brackets is not', () => {
  const template = templateFor(pkgRoot, 'DATABASE.md')!;
  assert.ok(template.includes('[table_name]'), 'the shipped template still carries the pattern');

  // What the real test produced: the skeleton kept, the pattern heading intact.
  const left = unfilledPlaceholders(template, template);
  assert.ok(left.some((l) => l.includes('[table_name]')));

  // A document that answered every prompt keeps its own bracketed prose.
  const written = [
    '# Database Schema',
    '',
    '## Database Overview',
    '',
    '- **Database Engine:** PostgreSQL 16 [see docker-compose.yml]',
    '',
    '### Table: `invoices`',
    '',
    '- **Description:** one row per issued invoice',
  ].join('\n');
  assert.deepEqual(unfilledPlaceholders(written, template), []);

  // A heading carrying a pattern is unfilled wherever it came from.
  assert.deepEqual(unfilledPlaceholders('### [Surface name]\n', null), ['### [Surface name]']);

  // An alert marker the template ships is markdown, not a blank: a finished
  // DESIGN.md keeps `> [!WARNING] **FE RULE:**` and is still approvable.
  const design = templateFor(pkgRoot, 'DESIGN.md')!;
  assert.ok(design.includes('> [!WARNING] **FE RULE:**'));
  assert.deepEqual(
    unfilledPlaceholders(
      '> [!WARNING] **FE RULE:**\n> No hex values outside tokens.\n- [x] done\n',
      design,
    ),
    [],
  );
});

test('conflicts and warnings read as demands do, but a warning may name any path', () => {
  const body = [
    '# Security',
    '',
    '## Conflicts',
    '',
    '- [ ] `ENVIRONMENT.md` — the access-log lines must follow the no-logs decision',
    '- [x] `LEGAL.md` — settled already',
    '  - cleared by prime · 2026-09-08',
    '',
    '## Warnings',
    '',
    '- [ ] `.gitignore` — `.env` is tracked and holds live credentials',
    '- [ ] `.github/workflows/release.yml` — the deploy step runs on every branch',
    '',
    '## Revision Requests',
    '',
    '- `TEST.md` — add the storage-limit case',
    '- `deploy/nginx.conf` — the CSP allows every third-party origin',
  ].join('\n');

  assert.deepEqual(parseConflicts(body), [
    {
      from: 'ENVIRONMENT.md',
      reason: 'the access-log lines must follow the no-logs decision',
    },
  ]);

  // The subjects that used to be dropped for not ending in .md — including the
  // one an agent filed under Revision Requests, where it could never be acted on.
  assert.deepEqual(parseWarnings(body), [
    { subject: '.gitignore', reason: '`.env` is tracked and holds live credentials' },
    {
      subject: '.github/workflows/release.yml',
      reason: 'the deploy step runs on every branch',
    },
    { subject: 'deploy/nginx.conf', reason: 'the CSP allows every third-party origin' },
  ]);

  // A demand still insists on a document, and reads only its own section.
  assert.deepEqual(parseOutgoing(body), [
    { target: 'TEST.md', reason: 'add the storage-limit case' },
  ]);
});

test('the first recorded write brings the text it replaced with it', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme') }, pkgRoot);
  const skeleton = '---\nstatus: uninitialized\n---\n\n# Product\n';
  const written = '---\nstatus: draft\n---\n\n# Product\n\nOne page, one visitor.\n';

  // The chain has no predecessor to compare against, so the bytes it replaced
  // go in underneath it.
  recordVersion(db, p, 'PRODUCT.md', written, 'agent', skeleton, 7);
  assert.deepEqual(
    listVersions(db, p, 'PRODUCT.md').map((v) => v.source),
    ['agent', 'pre-existing'],
  );

  // Every write after that is one row: the prior text is already the row below.
  const revised = written.replace('One page', 'One page, five products');
  recordVersion(db, p, 'PRODUCT.md', revised, 'prime', written);
  assert.deepEqual(
    listVersions(db, p, 'PRODUCT.md').map((v) => v.source),
    ['prime', 'agent', 'pre-existing'],
  );

  const [latest, previous] = listVersions(db, p, 'PRODUCT.md');
  assert.equal(readVersion(db, p, latest!.id)!.content, revised);
  assert.equal(readVersion(db, p, previous!.id)!.content, written);

  // Another project cannot read this one's history.
  const other = createProject(db, { name: 'Other', repoPath: join(work, 'other') }, pkgRoot);
  assert.equal(readVersion(db, other, latest!.id), null);
});

test('every document is filed by one rule, and the first matching rule wins', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme') }, pkgRoot);

  const write = (rel: string, body: string) => writeFileSync(docPath(p, rel), body, 'utf8');
  const job = (rel: string, status: string, kind = 'doc', notes = '[]') =>
    db
      .prepare('INSERT INTO jobs (project_id, doc_rel, kind, status, notes) VALUES (?,?,?,?,?)')
      .run(p.id, rel, kind, status, notes);
  const label = (rel: string) => {
    const d = listDocs(db, p, pkgRoot).find((x) => x.rel === rel)!;
    return `${d.section}/${d.state}${d.detail ? `:(${d.detail})` : ''}`;
  };

  // Untouched: the skeleton is queued.
  assert.equal(label('PRODUCT.md'), 'todo/waiting:(queue)');

  // Being written for the first time, then rewritten — the notes tell them apart.
  job('PRODUCT.md', 'running');
  assert.equal(label('PRODUCT.md'), 'doing/writing:(draft)');
  job('PRODUCT.md', 'running', 'doc', '["[STACK.md asks] fix it"]');
  assert.equal(label('PRODUCT.md'), 'doing/writing:(revision)');

  // Stopped mid-write keeps the same distinction.
  job('PRODUCT.md', 'stopped');
  assert.equal(label('PRODUCT.md'), 'doing/paused:(draft)');
  job('PRODUCT.md', 'stopped', 'doc', '["[STACK.md asks] fix it"]');
  assert.equal(label('PRODUCT.md'), 'doing/paused:(revision)');

  // A failed job is nobody's work in progress — it waits for a retry. It is its
  // own state, so `paused` keeps one meaning: prime stopped it.
  job('PRODUCT.md', 'failed');
  assert.equal(label('PRODUCT.md'), 'needs/failed:(draft)');
  job('PRODUCT.md', 'failed', 'doc', '["[STACK.md asks] fix it"]');
  assert.equal(label('PRODUCT.md'), 'needs/failed:(revision)');

  // A question is an Action Needed item like any other, so it reads as review.
  db.prepare('DELETE FROM jobs').run();
  write(
    'PRODUCT.md',
    '---\nstatus: draft\n---\n\n# P\n\n## Open Questions for prime\n\n- Which currency?\n',
  );
  assert.equal(label('PRODUCT.md'), 'needs/waiting:(review)');

  write('PRODUCT.md', '---\nstatus: draft\n---\n\n# P\n');
  assert.equal(label('PRODUCT.md'), 'needs/waiting:(approve)');

  // A demand outranks the approval it is waiting on.
  write(
    'STACK.md',
    '---\nstatus: approved\n---\n\n## Revision Requests\n\n- `PRODUCT.md` — redo\n',
  );
  assert.equal(label('PRODUCT.md'), 'needs/waiting:(review)');

  // A finding does not. It is a record the next writer reads, not a decision
  // owed — the document stays where it was.
  write('STACK.md', '---\nstatus: approved\n---\n\n## Findings\n\n- `.gitignore` — .env tracked\n');
  assert.equal(label('STACK.md'), 'done/approved');

  // Approved and settled.
  write('STACK.md', '---\nstatus: approved\n---\n\n# S\n');
  assert.equal(label('STACK.md'), 'done/approved');
  write('DATABASE.md', '---\nstatus: not-applicable\n---\n\n# D\n\nNo persistence layer.\n');
  assert.equal(label('DATABASE.md'), 'done/n/a');

  // An approved document waiting to be re-read is queued, not done — while the
  // recheck runs as much as before it starts.
  db.prepare(
    'INSERT INTO pending_rechecks (project_id, source_rel, reader_rel) VALUES (?,?,?)',
  ).run(p.id, 'PRODUCT.md', 'STACK.md');
  assert.equal(label('STACK.md'), 'todo/waiting:(recheck)');
  job('STACK.md', 'running', 'recheck');
  assert.equal(label('STACK.md'), 'todo/waiting:(recheck)');
});

test('a change request does not leave its document until prime approves it', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Sent', repoPath: join(work, 'sent') }, pkgRoot);

  writeFileSync(docPath(p, 'ENVIRONMENT.md'), '---\nstatus: approved\n---\n\n# Env\n', 'utf8');
  const body = '## Change Requests\n\n- `ENVIRONMENT.md` — the logs must go\n';
  writeFileSync(docPath(p, 'SECURITY.md'), `---\nstatus: draft\n---\n\n${body}`, 'utf8');

  // Prime may still edit the draft and delete the reason, so it has not been
  // asked for yet — it waits in the body where prime reads it before approving.
  const inbox = (rel: string) =>
    listDocs(db, p, pkgRoot).find((d) => d.rel === rel)!.revisionRequests;
  assert.deepEqual(inbox('ENVIRONMENT.md'), []);

  setFrontmatterStatus(docPath(p, 'SECURITY.md'), 'approved');
  assert.deepEqual(inbox('ENVIRONMENT.md'), [{ from: 'SECURITY.md', reason: 'the logs must go' }]);
  // …and it travelled: the draft's own line is gone from SECURITY.md.
  assert.doesNotMatch(readFileSync(docPath(p, 'SECURITY.md'), 'utf8'), /the logs must go/);
});

test('a decision is the record, and it holds nothing up', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme') }, pkgRoot);

  const reason = 'the access-log lines must follow the no-logs decision';
  writeFileSync(
    docPath(p, 'ENVIRONMENT.md'),
    `---\nstatus: approved\n---\n\n# Env\n\n## Change Requests\n\n- [ ] from \`SECURITY.md\` — ${reason}\n`,
    'utf8',
  );

  markRequestHandled(p, 'ENVIRONMENT.md', 'SECURITY.md', reason, 'kept');

  const env = listDocs(db, p, pkgRoot).find((d) => d.rel === 'ENVIRONMENT.md')!;
  assert.deepEqual(env.revisionRequests, []);
  assert.deepEqual(env.denied, [{ from: 'SECURITY.md', reason }]);
  // Prime decided. Asking them to settle a "conflict" too would be asking
  // twice, so the document goes nowhere near Action Needed.
  assert.equal(env.section, 'done');
  assert.equal(env.detail, null);

  const body = readFileSync(docPath(p, 'ENVIRONMENT.md'), 'utf8');
  assert.match(body, /## Decisions/);
  assert.match(body, /^ {2}- kept$/m);
  assert.deepEqual(parseDenied(body), [{ from: 'SECURITY.md', reason }]);
  // The two older shapes are still read as decisions.
  assert.deepEqual(
    parseDenied(
      '## Change Requests\n\n- [x] from `A.md` — old\n  - denied by prime · 2026-09-01\n',
    ),
    [{ from: 'A.md', reason: 'old' }],
  );
});

test('a demand that wraps over two lines is read whole, and its outcome lands after it', () => {
  const body = `# SECURITY

## Change Requests

- [ ] from \`STACK.md\` — "veriler şifreli saklanır" ifadesi kodla çelişiyor;
      SQLite dosyası düz. Ya ifade düzeltilmeli ya şifreleme eklenmeli.
- [ ] from \`API.md\` — tek satır, sarmalanmamış.
`;
  const reason =
    '"veriler şifreli saklanır" ifadesi kodla çelişiyor; SQLite dosyası düz. Ya ifade düzeltilmeli ya şifreleme eklenmeli.';
  assert.deepEqual(parseIncoming(body), [
    { from: 'STACK.md', reason },
    { from: 'API.md', reason: 'tek satır, sarmalanmamış.' },
  ]);

  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme') }, pkgRoot);
  writeFileSync(join(p.repo_path, '.kortext', 'SECURITY.md'), body, 'utf8');
  // Refusing a wrapped request moves the whole of it, not just its first line.
  markRequestHandled(p, 'SECURITY.md', 'STACK.md', reason, 'kept');
  const after = readFileSync(join(p.repo_path, '.kortext', 'SECURITY.md'), 'utf8');
  assert.deepEqual(parseIncoming(after), [{ from: 'API.md', reason: 'tek satır, sarmalanmamış.' }]);
  assert.deepEqual(parseDenied(after), [{ from: 'STACK.md', reason }]);
  assert.doesNotMatch(after.split('## Decisions')[0]!, /SQLite dosyası düz/);
});
