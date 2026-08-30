import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
