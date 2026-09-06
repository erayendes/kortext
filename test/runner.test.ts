import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readdirSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logPathFor, logRootDir, openDb } from '../server/db.js';
import { createProject, BRIEF_REL } from '../server/projects.js';
import { setFrontmatterStatus, docPath, listDocs } from '../server/docs.js';
import {
  abortRuns,
  advance,
  buildStepPrompt,
  proposeRevision,
  removeRunLogs,
  reviseDoc,
  nextStep,
  recheckDependents,
  runStep,
  runningJob,
  listJobs,
} from '../server/runner.js';
import type { EngineSpec } from '../server/engines.js';

const pkgRoot = process.cwd();

// A fake engine: a shell script that reads the prompt from stdin, extracts the
// target rel from the "Produce EXACTLY" line, and writes a draft doc there.
function mockEngine(work: string, behavior: 'ok' | 'noop' | 'wrong-status'): EngineSpec {
  const script = join(work, 'mock-engine.sh');
  const body =
    behavior === 'noop'
      ? '#!/bin/sh\ncat > /dev/null\nexit 0\n'
      : `#!/bin/sh
prompt=$(cat)
case "$prompt" in
  *readiness.json*) printf '{ "ready": true }\\n' > .kortext/.readiness.json; exit 0;;
esac
rel=$(printf '%s' "$prompt" | grep 'Produce EXACTLY' | sed 's/.*: \\.kortext\\///')
status=${behavior === 'wrong-status' ? 'approved' : 'draft'}
printf -- '---\\nstatus: %s\\nauthor: +mock\\n---\\n\\n# Mock doc\\n' "$status" > ".kortext/$rel"
`;
  writeFileSync(script, body);
  chmodSync(script, 0o755);
  return { id: 'mock', binary: script, args: [], installHint: '' };
}

// The readiness gate refuses to start on a brief that says nothing, so chain
// tests need a brief that says something. Content, not status, is the point.
function approveBrief(p: { repo_path: string }): void {
  writeFileSync(
    docPath(p as never, 'BRIEF.md'),
    `---
status: approved
author: +prime
---

# Project Brief (BRD)

## Product Vision & Goals

A shared shopping list for households, so two people never buy the same milk twice.

## Target Audience & Personas

Couples and flatmates who share a kitchen and shop separately.

## Interface Language

Turkish only in v1; English is a later decision, not a v1 scope item.

## Key Performance Indicators (KPIs)

Weekly lists completed per household; duplicate purchases self-reported per month.

## Future Scope & Out of Scope

No price tracking, no recipes, no store integrations in v1.
`,
    'utf8',
  );
}

test('nextStep: first unblocked unwritten doc by dependency depth; BRD gate respected', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme') }, pkgRoot);
  // BRD is draft (not approved) → everything downstream blocked → nothing to run
  assert.equal(nextStep(db, p, pkgRoot), null);
  approveBrief(p);
  const step = nextStep(db, p, pkgRoot);
  assert.ok(step);
  assert.equal(step.output, 'PRODUCT.md'); // the brief unblocks exactly one step
  rmSync(work, { recursive: true, force: true });
});

test('runStep happy path: engine writes draft, job settles done', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme') }, pkgRoot);
  approveBrief(p);
  const step = nextStep(db, p, pkgRoot)!;
  const out = await runStep(db, p, step, mockEngine(work, 'ok'), pkgRoot);
  assert.equal(out.ok, true);
  assert.match(readFileSync(docPath(p, step.output), 'utf8'), /status: draft/);
  assert.equal(listJobs(db, p.id)[0].status, 'done');
  assert.equal(runningJob(db, p.id), undefined);
  rmSync(work, { recursive: true, force: true });
});

test('runStep failure paths: no output file / wrong status → job failed with error', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme') }, pkgRoot);
  approveBrief(p);
  const step = nextStep(db, p, pkgRoot)!;

  // the skeleton already exists, so a lazy engine leaves status: uninitialized
  const noop = await runStep(db, p, step, mockEngine(work, 'noop'), pkgRoot);
  assert.equal(noop.ok, false);
  assert.match(noop.error!, /status is 'uninitialized'/);

  const wrong = await runStep(db, p, step, mockEngine(work, 'wrong-status'), pkgRoot);
  assert.equal(wrong.ok, false);
  assert.match(wrong.error!, /expected draft/);
  rmSync(work, { recursive: true, force: true });
});

test('buildStepPrompt carries hard rules, inputs, persona and revision notes', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme') }, pkgRoot);
  const prompt = buildStepPrompt(
    p,
    {
      output: 'LEGAL.md',
      inputs: ['BRIEF.md'],
      author: '+compliance-expert',
      approver: '+prime',
    },
    '1. **+compliance-expert:** LEGAL üret.',
    'persona body',
    ['KVKK bölümünü genişlet'],
  );
  assert.match(prompt, /Produce EXACTLY this file .*\.kortext\/LEGAL\.md/);
  assert.match(prompt, /status: draft, author: \+compliance-expert/);
  assert.match(prompt, /\.kortext\/BRIEF\.md/);
  assert.match(prompt, /persona body/);
  assert.match(prompt, /KVKK bölümünü genişlet/);
  assert.match(prompt, /NEVER set status to approved/);
  rmSync(work, { recursive: true, force: true });
});

test('advance: chains every unblocked step, pauses at approval gates, resumes after approve', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme') }, pkgRoot);
  const engine = mockEngine(work, 'ok');
  const { advance } = await import('../server/runner.js');

  await advance(db, p, engine, pkgRoot); // BRD not approved → nothing runs
  assert.equal(listJobs(db, p.id).length, 0);

  approveBrief(p);
  await advance(db, p, engine, pkgRoot);
  // The brief unblocks the PRD and nothing else
  const drafts = listJobs(db, p.id)
    .filter((j) => j.status === 'done')
    .map((j) => j.doc_rel)
    .sort();
  assert.deepEqual(drafts, ['PRODUCT.md']);

  setFrontmatterStatus(docPath(p, 'PRODUCT.md'), 'approved');
  await advance(db, p, engine, pkgRoot);
  const after = listJobs(db, p.id)
    .filter((j) => j.status === 'done')
    .map((j) => j.doc_rel)
    .sort();
  assert.deepEqual(after, ['PRODUCT.md', 'STACK.md', 'STRUCTURE.md']);
  // LEGAL is written against the design, so it is nowhere near ready yet
  assert.ok(!after.includes('LEGAL.md'), 'compliance waits for the technical documents');
  rmSync(work, { recursive: true, force: true });
});

test('existing project: no BRD scaffolded, chain starts from code-truth steps', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(
    db,
    { name: 'Old App', repoPath: join(work, 'old'), kind: 'existing' },
    pkgRoot,
  );
  assert.equal(existsSync(join(work, 'old', '.kortext', 'BRIEF.md')), false);
  // the readiness gate wants code to read — an existing project with an empty
  // folder has no evidence, so give this one a real source tree
  mkdirSync(join(work, 'old', 'src'), { recursive: true });
  for (const f of ['index.ts', 'server.ts', 'db.ts']) {
    writeFileSync(join(work, 'old', 'src', f), 'export const x = 1;\n');
  }
  const step = nextStep(db, p, pkgRoot);
  assert.ok(step); // STACK/STRUCTURE have no inputs in the existing workflow
  assert.ok(['STACK.md', 'STRUCTURE.md'].includes(step.output));
  const { advance } = await import('../server/runner.js');
  await advance(db, p, mockEngine(work, 'ok'), pkgRoot);
  const done = listJobs(db, p.id)
    .filter((j) => j.status === 'done')
    .map((j) => j.doc_rel)
    .sort();
  assert.deepEqual(done, ['STACK.md', 'STRUCTURE.md']); // ARCHITECTURE waits for approvals
  rmSync(work, { recursive: true, force: true });
});

test('advance runs independent steps in parallel (capped)', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Par', repoPath: join(work, 'par') }, pkgRoot);
  approveBrief(p);
  // The brief unblocks the PRD alone; the first fork is right after it, so
  // settle the PRD by hand and time only the fork.
  writeFileSync(
    docPath(p, 'PRODUCT.md'),
    '---\nstatus: approved\nauthor: +mock\n---\n\n# Done\n',
    'utf8',
  );
  // slow mock: each step sleeps 400ms — two sequential ≈ 800ms, parallel ≈ 400ms
  const script = join(work, 'slow.sh');
  writeFileSync(
    script,
    `#!/bin/sh
prompt=$(cat)
case "$prompt" in
  *readiness.json*) printf '{ "ready": true }\\n' > .kortext/.readiness.json; exit 0;;
esac
rel=$(printf '%s' "$prompt" | grep 'Produce EXACTLY' | sed 's/.*: \\.kortext\\///')
sleep 0.4
printf -- '---\\nstatus: draft\\nauthor: +mock\\n---\\n\\n# Mock\\n' > ".kortext/$rel"
`,
  );
  chmodSync(script, 0o755);
  const { advance } = await import('../server/runner.js');
  const { ensureReadiness } = await import('../server/readiness.js');
  // Settle the readiness gate first — this measures the chain's parallelism,
  // not the one-off gate spawn that precedes it.
  await ensureReadiness(
    db,
    p,
    { id: 'slow', binary: script, args: [], installHint: '' },
    new AbortController().signal,
  );
  const t0 = Date.now();
  await advance(db, p, { id: 'slow', binary: script, args: [], installHint: '' }, pkgRoot);
  const elapsed = Date.now() - t0;
  const done = listJobs(db, p.id)
    .filter((j) => j.status === 'done')
    .map((j) => j.doc_rel)
    .sort();
  assert.deepEqual(done, ['STACK.md', 'STRUCTURE.md']);
  assert.ok(elapsed < 750, `expected parallel (<750ms), took ${elapsed}ms`);
  rmSync(work, { recursive: true, force: true });
});

test('reviseDoc re-runs the producing step with notes; explainDoc answers without writing', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Rev', repoPath: join(work, 'rev') }, pkgRoot);
  approveBrief(p);
  const { advance, reviseDoc, explainDoc } = await import('../server/runner.js');
  await advance(db, p, mockEngine(work, 'ok'), pkgRoot); // LEGAL + GROWTH drafts

  // revise: capture the prompt the engine receives
  const cap = join(work, 'cap.sh');
  writeFileSync(
    cap,
    `#!/bin/sh
prompt=$(cat)
printf '%s' "$prompt" > prompt-capture.txt
rel=$(printf '%s' "$prompt" | grep 'Produce EXACTLY' | sed 's/.*: \\.kortext\\///')
printf -- '---\\nstatus: draft\\nauthor: +mock\\n---\\n\\n# Revised\\n' > ".kortext/$rel"
`,
  );
  chmodSync(cap, 0o755);
  const out = await reviseDoc(
    db,
    p,
    'LEGAL.md',
    ['KVKK bölümünü genişlet'],
    { id: 'cap', binary: cap, args: [], installHint: '' },
    pkgRoot,
  );
  assert.equal(out.ok, true);
  assert.match(
    readFileSync(join(work, 'rev', 'prompt-capture.txt'), 'utf8'),
    /REVISION REQUEST[\s\S]*KVKK bölümünü genişlet/,
  );
  assert.match(readFileSync(docPath(p, 'LEGAL.md'), 'utf8'), /# Revised/);

  // explain: answer comes from stdout, no file touched
  const ans = join(work, 'ans.sh');
  writeFileSync(ans, '#!/bin/sh\ncat > /dev/null\nprintf "MOCK CEVAP: satır şunu diyor"\n');
  chmodSync(ans, 0o755);
  const before = readFileSync(docPath(p, 'LEGAL.md'), 'utf8');
  const r = await explainDoc(
    db,
    p,
    'LEGAL.md',
    'seçili satır',
    'bu ne demek?',
    [],
    { id: 'ans', binary: ans, args: [], installHint: '' },
    pkgRoot,
  );
  assert.match(r.answer, /MOCK CEVAP/);
  assert.equal(readFileSync(docPath(p, 'LEGAL.md'), 'utf8'), before);
  rmSync(work, { recursive: true, force: true });
});

test('a mid-run approval wakes the active chain and fills free pool slots', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Wake', repoPath: join(work, 'wake') }, pkgRoot);
  approveBrief(p);
  setFrontmatterStatus(docPath(p, 'PRODUCT.md'), 'approved');
  // pre-write DESIGN as draft so only the STACK step is producible at loop start
  writeFileSync(docPath(p, 'DESIGN.md'), '---\nstatus: draft\nauthor: +mock\n---\n\n# D\n');
  const slow = join(work, 'slow.sh');
  writeFileSync(
    slow,
    `#!/bin/sh
prompt=$(cat)
case "$prompt" in
  *readiness.json*) printf '{ "ready": true }\\n' > .kortext/.readiness.json; exit 0;;
esac
rel=$(printf '%s' "$prompt" | grep 'Produce EXACTLY' | sed 's/.*: \\.kortext\\///')
sleep 0.6
printf -- '---\\nstatus: draft\\nauthor: +mock\\n---\\n\\n# S\\n' > ".kortext/$rel"
`,
  );
  chmodSync(slow, 0o755);
  const engine = { id: 'slow', binary: slow, args: [], installHint: '' };
  const { advance } = await import('../server/runner.js');

  const t0 = Date.now();
  const loop = advance(db, p, engine, pkgRoot); // starts STACK + STRUCTURE (0.6s)
  await new Promise((r) => setTimeout(r, 150));
  // mid-run: the DESIGN approval unlocks GROWTH; the nudge must start it NOW
  setFrontmatterStatus(docPath(p, 'DESIGN.md'), 'approved');
  await advance(db, p, engine, pkgRoot); // = kickChain from the approve route
  await loop;
  const elapsed = Date.now() - t0;
  const done = listJobs(db, p.id)
    .filter((j) => j.status === 'done')
    .map((j) => j.doc_rel);
  assert.ok(done.includes('GROWTH.md'), `GROWTH should have run (done: ${done})`);
  // sequential would be ≥1.2s (STACK finishes, then GROWTH); the wake overlaps them
  assert.ok(elapsed < 1100, `expected overlap via wake (<1100ms), took ${elapsed}ms`);
  rmSync(work, { recursive: true, force: true });
});

test('runPlanning: engine writes .kopeng tree → done with counts; empty tasks → failed', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Plan', repoPath: join(work, 'plan'), code: 'PLN' }, pkgRoot);
  const { runPlanning } = await import('../server/runner.js');

  const good = join(work, 'plan-good.sh');
  writeFileSync(
    good,
    `#!/bin/sh
cat > /dev/null
mkdir -p .kopeng/versions .kopeng/epics .kopeng/tasks
printf 'name: Plan\\ncode: PLN\\nstatus: draft\\n' > .kopeng/project.yaml
printf 'id: v0.1\\n' > .kopeng/versions/v0.1.yaml
printf 'id: PLN-E01\\nversion: v0.1\\n' > .kopeng/epics/PLN-E01.yaml
printf -- '---\\nid: PLN-T001\\nassignee: ai\\nblocked_by: []\\n---\\n\\n## Description\\nX\\n' > .kopeng/tasks/PLN-T001.md
`,
  );
  chmodSync(good, 0o755);
  const ok = await runPlanning(
    db,
    p,
    { id: 'g', binary: good, args: [], installHint: '' },
    pkgRoot,
  );
  assert.equal(ok.ok, true);

  const bad = join(work, 'plan-bad.sh');
  writeFileSync(
    bad,
    '#!/bin/sh\ncat > /dev/null\nmkdir -p .kopeng\nprintf "status: draft\\n" > .kopeng/project.yaml\n',
  );
  chmodSync(bad, 0o755);
  const p2 = createProject(
    db,
    { name: 'Plan2', repoPath: join(work, 'plan2'), code: 'PLB' },
    pkgRoot,
  );
  const fail = await runPlanning(
    db,
    p2,
    { id: 'b', binary: bad, args: [], installHint: '' },
    pkgRoot,
  );
  assert.equal(fail.ok, false);
  assert.match(fail.error!, /tasks\/ is empty/);
  rmSync(work, { recursive: true, force: true });
});

test('abortRuns kills a running step: the job settles as stopped, not failed', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme') }, pkgRoot);
  approveBrief(p);
  const step = nextStep(db, p, pkgRoot)!;

  const slow = join(work, 'slow-engine.sh');
  writeFileSync(slow, '#!/bin/sh\ncat > /dev/null\nsleep 30\n');
  chmodSync(slow, 0o755);

  const running = runStep(
    db,
    p,
    step,
    { id: 'slow', binary: slow, args: [], installHint: '' },
    pkgRoot,
  );
  await new Promise((r) => setTimeout(r, 300)); // let it spawn
  assert.ok(runningJob(db, p.id));
  abortRuns(p.id);
  const out = await running;
  assert.equal(out.ok, false);
  assert.match(out.error!, /stopped/);
  assert.equal(listJobs(db, p.id)[0]!.status, 'stopped');
  rmSync(work, { recursive: true, force: true });
});

test('the gate blocks an existing project whose folder holds no code', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(
    db,
    { name: 'Empty', repoPath: join(work, 'empty'), kind: 'existing' },
    pkgRoot,
  );
  const { advance } = await import('../server/runner.js');
  await advance(db, p, mockEngine(work, 'ok'), pkgRoot);
  assert.deepEqual(listJobs(db, p.id), []); // nothing ran, nothing was written
  rmSync(work, { recursive: true, force: true });
});

test('two documents can be revised at once; one document cannot be revised twice', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Rev2', repoPath: join(work, 'rev2') }, pkgRoot);
  const { reviseDoc, runningDoc } = await import('../server/runner.js');
  const engine = mockEngine(work, 'ok');

  // Answering the second of two open documents used to be dropped, because the
  // guard refused while ANY step was running.
  db.prepare(
    "INSERT INTO jobs (project_id, doc_rel, status) VALUES (?, 'ARCHITECTURE.md', 'running')",
  ).run(p.id);
  assert.equal(runningDoc(db, p.id, 'ARCHITECTURE.md'), true);
  assert.equal(runningDoc(db, p.id, 'DESIGN.md'), false);

  writeFileSync(docPath(p, 'DESIGN.md'), '---\nstatus: draft\nauthor: +mock\n---\n\n# D\n', 'utf8');
  const out = await reviseDoc(db, p, 'DESIGN.md', ['[Q] answer'], engine, pkgRoot);
  assert.equal(out.ok, true, out.error);

  const busy = await reviseDoc(db, p, 'ARCHITECTURE.md', ['[Q] answer'], engine, pkgRoot);
  assert.equal(busy.ok, false);
  assert.match(busy.error ?? '', /already being rewritten/);
  rmSync(work, { recursive: true, force: true });
});

test('the brief has no producing step: a revision refuses, loudly, and leaves the file alone', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Brief', repoPath: join(work, 'brief') }, pkgRoot);
  approveBrief(p);
  const engine = mockEngine(work, 'ok');
  const { reviseDoc } = await import('../server/runner.js');
  const before = readFileSync(docPath(p, 'BRIEF.md'), 'utf8');

  const out = await reviseDoc(db, p, 'BRIEF.md', ['change this'], engine, pkgRoot);
  assert.equal(out.ok, false);
  // Callers fire and forget, so the refusal has to be visible somewhere.
  const jobs = listJobs(db, p.id).filter((j) => j.doc_rel === 'BRIEF.md');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].status, 'failed');
  assert.match(jobs[0].error ?? '', /no producing step/);
  // And the brief itself is untouched — nothing wrote it, so nothing moved it.
  assert.equal(readFileSync(docPath(p, 'BRIEF.md'), 'utf8'), before);
  rmSync(work, { recursive: true, force: true });
});

test('a proposed revision reaches the editor, never the document', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Propose', repoPath: join(work, 'propose') }, pkgRoot);
  approveBrief(p);
  const before = readFileSync(docPath(p, 'BRIEF.md'), 'utf8');

  const script = join(work, 'proposer.sh');
  writeFileSync(
    script,
    `#!/bin/sh
prompt=$(cat)
# the scratch file is named in the prompt, one per call — write where told
rel=$(printf '%s' "$prompt" | grep -o '\\.kortext/\\.proposal-[a-z0-9]*\\.txt' | head -1)
printf -- '---\\nstatus: draft\\nauthor: +prime\\n---\\n\\n# Brief\\n\\nrevised\\n' > "$rel"
`,
  );
  chmodSync(script, 0o755);
  const { proposeRevision } = await import('../server/runner.js');
  const out = await proposeRevision(
    db,
    p,
    'BRIEF.md',
    ['[PRODUCT.md asks] say it the other way round'],
    { id: 'proposer', binary: script, args: [], installHint: '' },
    pkgRoot,
  );

  assert.match(out.proposal, /revised/);
  // The document is the human's: the proposal is theirs to apply, or not.
  assert.equal(readFileSync(docPath(p, 'BRIEF.md'), 'utf8'), before);
  // And the scratch file does not linger as a document-shaped thing in .kortext.
  assert.equal(existsSync(join(p.repo_path, '.kortext', '.proposal.txt')), false);
  rmSync(work, { recursive: true, force: true });
});

test('an engine that proposes nothing is an error, not an empty document', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Silent', repoPath: join(work, 'silent') }, pkgRoot);
  approveBrief(p);
  const { proposeRevision } = await import('../server/runner.js');
  await assert.rejects(
    () => proposeRevision(db, p, 'BRIEF.md', ['change it'], mockEngine(work, 'noop'), pkgRoot),
    /wrote no proposal/,
  );
  rmSync(work, { recursive: true, force: true });
});

test('a verdict becomes a demand in the document that caused it', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Recheck', repoPath: join(work, 'recheck') }, pkgRoot);
  const { appendRevisionRequest } = await import('../server/runner.js');

  // The line lands under the heading, above whatever follows it.
  writeFileSync(
    docPath(p, 'STACK.md'),
    '---\nstatus: approved\n---\n\n# Stack\n\n## Revision Requests\n\n- `API.md` — an older demand\n\n## Open Questions for prime\n\n- something\n',
    'utf8',
  );
  appendRevisionRequest(
    p,
    'STACK.md',
    'PRODUCT.md',
    'the runtime changed, the flow list must follow',
  );
  const stack = readFileSync(docPath(p, 'STACK.md'), 'utf8');
  const lines = stack.split('\n');
  const head = lines.findIndex((l) => l === '## Revision Requests');
  const next = lines.findIndex((l) => l === '## Open Questions for prime');
  const at = lines.findIndex((l) => l.startsWith('- `PRODUCT.md`'));
  assert.ok(
    at > head && at < next,
    `the demand must sit inside the section (${at} vs ${head}..${next})`,
  );
  assert.match(stack, /- `PRODUCT\.md` — the runtime changed, the flow list must follow/);
  // Frontmatter is untouched: writing a demand does not un-approve the writer.
  assert.match(stack, /status: approved/);
  // The panel reads it back as a demand on the PRD — which has to have been
  // written, or there is nothing to ask of it.
  setFrontmatterStatus(docPath(p, 'PRODUCT.md'), 'approved');
  const prd = listDocs(db, p, pkgRoot).find((d) => d.rel === 'PRODUCT.md')!;
  assert.equal(prd.revisionRequests.length, 1);
  assert.equal(prd.revisionRequests[0].from, 'STACK.md');

  // A document with no such section gets one rather than losing the finding.
  writeFileSync(docPath(p, 'DESIGN.md'), '---\nstatus: approved\n---\n\n# Design\n', 'utf8');
  appendRevisionRequest(p, 'DESIGN.md', 'CONTENT.md', 'the empty state lost its slot');
  assert.match(
    readFileSync(docPath(p, 'DESIGN.md'), 'utf8'),
    /## Revision Requests\n\n- `CONTENT\.md` —/,
  );
  rmSync(work, { recursive: true, force: true });
});

test('aborting alone lets the chain restart what it just stopped; pausing first does not', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Stop', repoPath: join(work, 'stop'), code: 'STP' }, pkgRoot);
  writeFileSync(
    join(work, 'stop', BRIEF_REL),
    `---\nstatus: approved\n---\n\n${'A brief long enough to clear the floor. '.repeat(12)}\n`,
    'utf8',
  );
  const slow = join(work, 'slow.sh');
  writeFileSync(
    slow,
    `#!/bin/sh
prompt=$(cat)
case "$prompt" in
  *readiness.json*) printf '{ "ready": true }\\n' > .kortext/.readiness.json; exit 0;;
esac
rel=$(printf '%s' "$prompt" | grep 'Produce EXACTLY' | sed 's/.*: \\.kortext\\///')
sleep 0.5
printf -- '---\\nstatus: draft\\nauthor: +mock\\n---\\n\\n# S\\n' > ".kortext/$rel"
`,
  );
  chmodSync(slow, 0o755);
  const engine = { id: 'slow', binary: slow, args: [], installHint: '' };
  const { advance, abortRuns } = await import('../server/runner.js');

  // What cancel and restart do: pause the project, THEN abort. Without the pause
  // the stopped steps settle, the loop wakes, sees the same documents unwritten
  // and starts them again — inside the window the route is waiting through.
  const loop = advance(db, p, engine, pkgRoot);
  await new Promise((r) => setTimeout(r, 150));
  db.prepare('UPDATE projects SET paused = 1 WHERE id = ?').run(p.id);
  abortRuns(p.id);
  await loop;

  const started = listJobs(db, p.id).length;
  await new Promise((r) => setTimeout(r, 300)); // the window a route would wait through
  assert.equal(listJobs(db, p.id).length, started, 'no step may start after the abort');
  assert.ok(
    listJobs(db, p.id).every((j) => j.status !== 'running'),
    'every job settles when the project is paused and the runs are aborted',
  );
  rmSync(work, { recursive: true, force: true });
});

test('cancel takes its own logs back, and leaves every other project alone', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const logs = join(work, 'logs');
  mkdirSync(logs, { recursive: true });
  for (const f of ['p7-STACK.md.log', 'p7-readiness.log', 'p70-STACK.md.log', 'p8-plan.log']) {
    writeFileSync(join(logs, f), 'x', 'utf8');
  }
  const { removeRunLogs } = await import('../server/runner.js');
  removeRunLogs(7, logs);
  assert.deepEqual(readdirSync(logs).sort(), ['p70-STACK.md.log', 'p8-plan.log']);
  removeRunLogs(999, join(work, 'nope')); // a directory that does not exist is not an error
  rmSync(work, { recursive: true, force: true });
});

test('two approvals landing together run one chain, not two pools', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Race', repoPath: join(work, 'race'), code: 'RCE' }, pkgRoot);
  writeFileSync(
    join(work, 'race', BRIEF_REL),
    `---\nstatus: approved\n---\n\n${'A brief long enough to clear the floor. '.repeat(12)}\n`,
    'utf8',
  );
  const slow = join(work, 'slow.sh');
  writeFileSync(
    slow,
    `#!/bin/sh
prompt=$(cat)
case "$prompt" in
  *readiness.json*) sleep 0.3; printf '{ "ready": true }\\n' > .kortext/.readiness.json; exit 0;;
esac
rel=$(printf '%s' "$prompt" | grep 'Produce EXACTLY' | sed 's/.*: \\.kortext\\///')
sleep 0.4
printf -- '---\\nstatus: draft\\nauthor: +mock\\n---\\n\\n# S\\n' > ".kortext/$rel"
`,
  );
  chmodSync(slow, 0o755);
  const engine = { id: 'slow', binary: slow, args: [], installHint: '' };
  const { advance } = await import('../server/runner.js');

  // Both callers arrive while the gate is still out — the second must find the
  // loop already claimed rather than starting a pool of its own.
  await Promise.all([advance(db, p, engine, pkgRoot), advance(db, p, engine, pkgRoot)]);
  const perDoc = new Map<string, number>();
  for (const j of listJobs(db, p.id)) perDoc.set(j.doc_rel, (perDoc.get(j.doc_rel) ?? 0) + 1);
  for (const [rel, n] of perDoc) assert.equal(n, 1, `${rel} ran ${n} times, expected once`);
  rmSync(work, { recursive: true, force: true });
});

test('a step killed by its own clock says so, and is not blamed on the human', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Slow', repoPath: join(work, 'slow'), code: 'SLW' }, pkgRoot);
  const { spawnCli } = await import('../server/cli-spawn.js');
  const sleeper = join(work, 'sleeper.sh');
  writeFileSync(sleeper, '#!/bin/sh\ncat > /dev/null\nsleep 30\n');
  chmodSync(sleeper, 0o755);
  const res = await spawnCli({
    binary: sleeper,
    args: [],
    cwd: work,
    logPath: join(work, 'log.txt'),
    signal: new AbortController().signal,
    timeoutMs: 150,
    sigkillDelayMs: 50,
  });
  assert.equal(res.timedOut, true, 'the run must report its own timeout');
  assert.equal(res.aborted, true, 'a timeout still kills the process');
  rmSync(work, { recursive: true, force: true });
  assert.ok(p.id > 0);
});

test('a binary that vanished fails the run instead of killing the server', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const { spawnCli } = await import('../server/cli-spawn.js');
  // spawn emits BOTH 'error' and 'close' here; ending the log twice used to
  // raise ERR_STREAM_WRITE_AFTER_END with no listener and take the process down.
  const res = await spawnCli({
    binary: join(work, 'no-such-binary'),
    args: [],
    cwd: work,
    logPath: join(work, 'log.txt'),
    signal: new AbortController().signal,
  });
  assert.ok(res.exitCode !== 0, 'a missing binary is a failed run');
  assert.match(res.stderrTail, /spawn-error/);
  await new Promise((r) => setTimeout(r, 200)); // the second event lands here
  rmSync(work, { recursive: true, force: true });
});

test('pausing stops the recheck fan-out, it does not just stop the run in flight', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Fan', repoPath: join(work, 'fan') }, pkgRoot);

  // Twelve documents read PRODUCT.md. The fan-out runs them one at a time, and
  // each step used to register a controller the earlier abort never saw — so a
  // pause stopped the first and let the other eleven run to the end.
  const witness = join(work, 'runs.txt');
  const script = join(work, 'counting-engine.sh');
  writeFileSync(script, `#!/bin/sh\ncat > /dev/null\necho run >> ${witness}\nexit 0\n`, 'utf8');
  chmodSync(script, 0o755);
  const engine = { id: 'count', binary: script, args: [], installHint: '' };

  for (const d of listDocs(db, p, pkgRoot)) {
    writeFileSync(docPath(p, d.rel), '---\nstatus: approved\n---\n\nbody\n', 'utf8');
  }
  const runs = () =>
    existsSync(witness) ? readFileSync(witness, 'utf8').trim().split('\n').length : 0;

  db.prepare('UPDATE projects SET paused = 1 WHERE id = ?').run(p.id);
  recheckDependents(db, p, 'PRODUCT.md', engine, pkgRoot);
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(runs(), 0, 'a paused project starts nothing');

  // And the guard is not simply refusing everything: unpaused, the same call runs.
  db.prepare('UPDATE projects SET paused = 0 WHERE id = ?').run(p.id);
  recheckDependents(db, p, 'PRODUCT.md', engine, pkgRoot);
  for (let i = 0; i < 40 && runs() === 0; i++) await new Promise((r) => setTimeout(r, 50));
  assert.ok(runs() > 0, 'an unpaused project runs its readers');

  db.prepare('UPDATE projects SET paused = 1 WHERE id = ?').run(p.id);
  abortRuns(p.id);
  await new Promise((r) => setTimeout(r, 300));
  rmSync(work, { recursive: true, force: true });
});

test('a draft the human asked for can be stopped, like every other run', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Stop', repoPath: join(work, 'stop') }, pkgRoot);

  // Half a minute of CLI. If the run is not in the abort registry, the call
  // below waits all of it; if it is, the abort lands in milliseconds.
  const script = join(work, 'slow.sh');
  writeFileSync(script, '#!/bin/sh\ncat > /dev/null\nsleep 30\n', 'utf8');
  chmodSync(script, 0o755);
  const engine = { id: 'slow', binary: script, args: [], installHint: '' };

  const started = Date.now();
  const call = proposeRevision(db, p, 'STACK.md', ['change it'], engine, pkgRoot);
  await new Promise((r) => setTimeout(r, 400));
  abortRuns(p.id);
  await assert.rejects(call, /stopped/, 'an aborted draft says it was stopped');
  assert.ok(Date.now() - started < 10_000, 'and it stops now, not when the CLI is done');
  rmSync(work, { recursive: true, force: true });
});

test('a paused project does not spend a run on the readiness gate', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Gate', repoPath: join(work, 'gate') }, pkgRoot);

  const witness = join(work, 'runs.txt');
  const script = join(work, 'counting.sh');
  writeFileSync(script, `#!/bin/sh\ncat > /dev/null\necho run >> ${witness}\nexit 0\n`, 'utf8');
  chmodSync(script, 0o755);
  const engine = { id: 'count', binary: script, args: [], installHint: '' };

  // An approved brief is what makes the gate reach for the CLI at all.
  writeFileSync(
    join(work, 'gate', BRIEF_REL),
    '---\nstatus: approved\n---\n\n' +
      'A real product brief with enough substance to pass the floor. '.repeat(20),
    'utf8',
  );
  db.prepare('UPDATE projects SET paused = 1 WHERE id = ?').run(p.id);

  await advance(db, p, engine, pkgRoot);
  const runs = existsSync(witness) ? readFileSync(witness, 'utf8').trim().split('\n').length : 0;
  assert.equal(runs, 0, 'pause is read before the gate, not after it');
  rmSync(work, { recursive: true, force: true });
});

test('a step that always fails is tried three times, not forever', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Loop', repoPath: join(work, 'loop') }, pkgRoot);

  // Opens the gate, then fails every analysis step — the deterministic failure
  // (a bad model id, a rejected key) that used to spin until someone paused.
  const script = join(work, 'always-fails.sh');
  writeFileSync(
    script,
    `#!/bin/sh
prompt=$(cat)
case "$prompt" in
  *readiness.json*) printf '{ "ready": true }\\n' > .kortext/.readiness.json; exit 0;;
esac
exit 1
`,
    'utf8',
  );
  chmodSync(script, 0o755);
  const engine = { id: 'fail', binary: script, args: [], installHint: '' };
  writeFileSync(
    join(work, 'loop', BRIEF_REL),
    '---\nstatus: approved\n---\n\n' +
      'A real product brief with enough substance to pass the floor. '.repeat(20),
    'utf8',
  );
  // Settle everything but one document, so the loop has exactly one step to
  // pick and the test measures the cap rather than the whole workflow.
  const target = 'PRODUCT.md';
  for (const d of listDocs(db, p, pkgRoot)) {
    if (d.rel === target || d.rel === 'BRIEF.md') continue;
    writeFileSync(docPath(p, d.rel), '---\nstatus: approved\n---\n\nsettled\n', 'utf8');
  }

  await advance(db, p, engine, pkgRoot);

  const tries = listJobs(db, p.id).filter((j) => j.doc_rel === target).length;
  assert.ok(tries > 0, 'the step was actually attempted');
  assert.equal(tries, 3, `${target} was attempted ${tries} times — the cap is 3`);
  rmSync(work, { recursive: true, force: true });
});

test('a revision the agent did not make is a failure, not a success', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Noop', repoPath: join(work, 'noop') }, pkgRoot);

  // Reads the prompt, changes nothing, exits 0. The document is already on disk
  // — it is a rewrite — so existsSync proves nothing about whether it moved.
  const script = join(work, 'noop.sh');
  writeFileSync(script, '#!/bin/sh\ncat > /dev/null\nexit 0\n', 'utf8');
  chmodSync(script, 0o755);
  const engine = { id: 'noop', binary: script, args: [], installHint: '' };

  const doc = docPath(p, 'STACK.md');
  writeFileSync(doc, '---\nstatus: draft\n---\n\n# Stack\n\nthe original text\n', 'utf8');
  const before = readFileSync(doc, 'utf8');

  const out = await reviseDoc(db, p, 'STACK.md', ['change the database'], engine, pkgRoot);
  assert.equal(out.ok, false, 'an untouched document is not a completed revision');
  assert.match(out.error ?? '', /exactly as it was/);
  assert.equal(readFileSync(doc, 'utf8'), before, 'and the document really is untouched');
  rmSync(work, { recursive: true, force: true });
});

test('a failed readiness run cannot inherit the previous brief’s approval', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Stale', repoPath: join(work, 'stale') }, pkgRoot);

  const script = join(work, 'broken.sh');
  writeFileSync(script, '#!/bin/sh\ncat > /dev/null\nexit 1\n', 'utf8');
  chmodSync(script, 0o755);
  const engine = { id: 'broken', binary: script, args: [], installHint: '' };

  // An approval the OLD brief earned, sitting where the gate caches its verdict.
  writeFileSync(
    join(work, 'stale', '.kortext', '.readiness.json'),
    JSON.stringify({
      ready: true,
      stage: 'judgment',
      questions: [],
      briefHash: 'old',
      checkedAt: '',
    }),
    'utf8',
  );
  writeFileSync(
    join(work, 'stale', BRIEF_REL),
    '---\nstatus: approved\n---\n\n' +
      'A different brief, rewritten after that verdict was recorded. '.repeat(20),
    'utf8',
  );

  const { ensureReadiness } = await import('../server/readiness.js');
  const out = await ensureReadiness(db, p, engine, new AbortController().signal);
  assert.equal(out.ready, false, 'a CLI that exited 1 judged nothing');
  rmSync(work, { recursive: true, force: true });
});

test('run logs belong to the database they describe, not to the home directory', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));

  // One shared folder keyed on nothing but the project id meant a second
  // server on its own --db wrote into the first one's logs, and cancelling
  // ITS project 1 deleted the other project 1's history.
  assert.equal(logRootDir(db), join(work, 'db.sqlite.logs'));
  assert.equal(logPathFor(db, 'p1-plan.log'), join(work, 'db.sqlite.logs', 'p1-plan.log'));

  mkdirSync(join(work, 'db.sqlite.logs'), { recursive: true });
  writeFileSync(logPathFor(db, 'p1-plan.log'), 'mine', 'utf8');
  writeFileSync(logPathFor(db, 'p2-plan.log'), 'someone else', 'utf8');
  removeRunLogs(1, logRootDir(db));
  assert.equal(
    existsSync(logPathFor(db, 'p1-plan.log')),
    false,
    "cancel takes its own project's logs",
  );
  assert.equal(existsSync(logPathFor(db, 'p2-plan.log')), true, 'and leaves every other alone');
  rmSync(work, { recursive: true, force: true });
});
