import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';
import { createProject } from '../server/projects.js';
import { setFrontmatterStatus, docPath } from '../server/docs.js';
import { buildStepPrompt, nextStep, runStep, runningJob, listJobs } from '../server/runner.js';
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
rel=$(printf '%s' "$prompt" | grep 'Produce EXACTLY' | sed 's/.*: \\.kortext\\///')
status=${behavior === 'wrong-status' ? 'approved' : 'draft'}
printf -- '---\\nstatus: %s\\nauthor: +mock\\n---\\n\\n# Mock doc\\n' "$status" > ".kortext/$rel"
`;
  writeFileSync(script, body);
  chmodSync(script, 0o755);
  return { id: 'mock', binary: script, args: [], installHint: '' };
}

test('nextStep: first unblocked unwritten doc by dependency depth; BRD gate respected', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme') }, pkgRoot);
  // BRD is draft (not approved) → LEGAL/GROWTH blocked → nothing to run yet
  assert.equal(nextStep(db, p, pkgRoot), null);
  setFrontmatterStatus(docPath(p, 'foundation/BRD.md'), 'approved');
  const step = nextStep(db, p, pkgRoot);
  assert.ok(step);
  assert.ok(['GROWTH.md', 'LEGAL.md'].includes(step.output));
  rmSync(work, { recursive: true, force: true });
});

test('runStep happy path: engine writes draft, job settles done', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Acme', repoPath: join(work, 'acme') }, pkgRoot);
  setFrontmatterStatus(docPath(p, 'foundation/BRD.md'), 'approved');
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
  setFrontmatterStatus(docPath(p, 'foundation/BRD.md'), 'approved');
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
    { output: 'LEGAL.md', inputs: ['foundation/BRD.md'], author: '+compliance-expert', approver: '+prime' },
    '1. **+compliance-expert:** LEGAL üret.',
    'persona body',
    ['KVKK bölümünü genişlet'],
  );
  assert.match(prompt, /Produce EXACTLY this file .*\.kortext\/LEGAL\.md/);
  assert.match(prompt, /status: draft, author: \+compliance-expert/);
  assert.match(prompt, /\.kortext\/foundation\/BRD\.md/);
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

  setFrontmatterStatus(docPath(p, 'foundation/BRD.md'), 'approved');
  await advance(db, p, engine, pkgRoot);
  // GROWTH + LEGAL produced as drafts, then the chain pauses (PRD needs approvals)
  const drafts = listJobs(db, p.id).filter((j) => j.status === 'done').map((j) => j.doc_rel).sort();
  assert.deepEqual(drafts, ['GROWTH.md', 'LEGAL.md']);

  setFrontmatterStatus(docPath(p, 'GROWTH.md'), 'approved');
  setFrontmatterStatus(docPath(p, 'LEGAL.md'), 'approved');
  await advance(db, p, engine, pkgRoot);
  const after = listJobs(db, p.id).filter((j) => j.status === 'done').map((j) => j.doc_rel);
  assert.ok(after.includes('foundation/PRD.md'));
  rmSync(work, { recursive: true, force: true });
});

test('existing project: no BRD scaffolded, chain starts from code-truth steps', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Old App', repoPath: join(work, 'old'), kind: 'existing' }, pkgRoot);
  assert.equal(existsSync(join(work, 'old', '.kortext', 'foundation', 'BRD.md')), false);
  const step = nextStep(db, p, pkgRoot);
  assert.ok(step); // STACK/STRUCTURE have no inputs in the existing workflow
  assert.ok(['STACK.md', 'STRUCTURE.md'].includes(step.output));
  const { advance } = await import('../server/runner.js');
  await advance(db, p, mockEngine(work, 'ok'), pkgRoot);
  const done = listJobs(db, p.id).filter((j) => j.status === 'done').map((j) => j.doc_rel).sort();
  assert.deepEqual(done, ['STACK.md', 'STRUCTURE.md']); // ARCHITECTURE waits for approvals
  rmSync(work, { recursive: true, force: true });
});

test('advance runs independent steps in parallel (capped)', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Par', repoPath: join(work, 'par') }, pkgRoot);
  setFrontmatterStatus(docPath(p, 'foundation/BRD.md'), 'approved');
  // slow mock: each step sleeps 400ms — two sequential ≈ 800ms, parallel ≈ 400ms
  const script = join(work, 'slow.sh');
  writeFileSync(script, `#!/bin/sh
prompt=$(cat)
rel=$(printf '%s' "$prompt" | grep 'Produce EXACTLY' | sed 's/.*: \\.kortext\\///')
sleep 0.4
printf -- '---\\nstatus: draft\\nauthor: +mock\\n---\\n\\n# Mock\\n' > ".kortext/$rel"
`);
  chmodSync(script, 0o755);
  const { advance } = await import('../server/runner.js');
  const t0 = Date.now();
  await advance(db, p, { id: 'slow', binary: script, args: [], installHint: '' }, pkgRoot);
  const elapsed = Date.now() - t0;
  const done = listJobs(db, p.id).filter((j) => j.status === 'done').map((j) => j.doc_rel).sort();
  assert.deepEqual(done, ['GROWTH.md', 'LEGAL.md']);
  assert.ok(elapsed < 750, `expected parallel (<750ms), took ${elapsed}ms`);
  rmSync(work, { recursive: true, force: true });
});

test('reviseDoc re-runs the producing step with notes; explainDoc answers without writing', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Rev', repoPath: join(work, 'rev') }, pkgRoot);
  setFrontmatterStatus(docPath(p, 'foundation/BRD.md'), 'approved');
  const { advance, reviseDoc, explainDoc } = await import('../server/runner.js');
  await advance(db, p, mockEngine(work, 'ok'), pkgRoot); // LEGAL + GROWTH drafts

  // revise: capture the prompt the engine receives
  const cap = join(work, 'cap.sh');
  writeFileSync(cap, `#!/bin/sh
prompt=$(cat)
printf '%s' "$prompt" > prompt-capture.txt
rel=$(printf '%s' "$prompt" | grep 'Produce EXACTLY' | sed 's/.*: \\.kortext\\///')
printf -- '---\\nstatus: draft\\nauthor: +mock\\n---\\n\\n# Revised\\n' > ".kortext/$rel"
`);
  chmodSync(cap, 0o755);
  const out = await reviseDoc(db, p, 'LEGAL.md', ['KVKK bölümünü genişlet'], { id: 'cap', binary: cap, args: [], installHint: '' }, pkgRoot);
  assert.equal(out.ok, true);
  assert.match(readFileSync(join(work, 'rev', 'prompt-capture.txt'), 'utf8'), /REVISION REQUEST[\s\S]*KVKK bölümünü genişlet/);
  assert.match(readFileSync(docPath(p, 'LEGAL.md'), 'utf8'), /# Revised/);

  // explain: answer comes from stdout, no file touched
  const ans = join(work, 'ans.sh');
  writeFileSync(ans, '#!/bin/sh\ncat > /dev/null\nprintf "MOCK CEVAP: satır şunu diyor"\n');
  chmodSync(ans, 0o755);
  const before = readFileSync(docPath(p, 'LEGAL.md'), 'utf8');
  const r = await explainDoc(p, 'LEGAL.md', 'seçili satır', 'bu ne demek?', { id: 'ans', binary: ans, args: [], installHint: '' }, pkgRoot);
  assert.match(r.answer, /MOCK CEVAP/);
  assert.equal(readFileSync(docPath(p, 'LEGAL.md'), 'utf8'), before);
  rmSync(work, { recursive: true, force: true });
});

test('a mid-run approval wakes the active chain and fills free pool slots', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Wake', repoPath: join(work, 'wake') }, pkgRoot);
  setFrontmatterStatus(docPath(p, 'foundation/BRD.md'), 'approved');
  // pre-write GROWTH as draft so only LEGAL is producible at loop start
  writeFileSync(docPath(p, 'GROWTH.md'), '---\nstatus: draft\nauthor: +mock\n---\n\n# G\n');
  const slow = join(work, 'slow.sh');
  writeFileSync(slow, `#!/bin/sh
prompt=$(cat)
rel=$(printf '%s' "$prompt" | grep 'Produce EXACTLY' | sed 's/.*: \\.kortext\\///')
sleep 0.6
printf -- '---\\nstatus: draft\\nauthor: +mock\\n---\\n\\n# S\\n' > ".kortext/$rel"
`);
  chmodSync(slow, 0o755);
  const engine = { id: 'slow', binary: slow, args: [], installHint: '' };
  const { advance } = await import('../server/runner.js');

  const t0 = Date.now();
  const loop = advance(db, p, engine, pkgRoot); // starts LEGAL (0.6s)
  await new Promise((r) => setTimeout(r, 150));
  // mid-run: GROWTH + LEGAL approvals unlock PRD; the nudge must start it NOW
  setFrontmatterStatus(docPath(p, 'GROWTH.md'), 'approved');
  setFrontmatterStatus(docPath(p, 'LEGAL.md'), 'approved');
  await advance(db, p, engine, pkgRoot); // = kickChain from the approve route
  await loop;
  const elapsed = Date.now() - t0;
  const done = listJobs(db, p.id).filter((j) => j.status === 'done').map((j) => j.doc_rel);
  assert.ok(done.includes('foundation/PRD.md'), `PRD should have run (done: ${done})`);
  // sequential would be ≥1.2s (LEGAL finishes, then PRD); the wake overlaps them
  assert.ok(elapsed < 1100, `expected overlap via wake (<1100ms), took ${elapsed}ms`);
  rmSync(work, { recursive: true, force: true });
});
