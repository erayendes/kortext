import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';
import { createProject, listProjects, removeProject, BRIEF_REL } from '../server/projects.js';

const pkgRoot = process.cwd();

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'kortext-test-'));
}

test('create new project scaffolds .kortext workspace with draft BRD', () => {
  const work = tempDir();
  const db = openDb(join(work, 'db.sqlite'));
  const repo = join(work, 'acme');
  const p = createProject(db, { name: 'Acme', repoPath: repo }, pkgRoot);
  assert.equal(p.name, 'Acme');
  const brief = join(repo, BRIEF_REL);
  assert.ok(existsSync(brief));
  assert.match(readFileSync(brief, 'utf8'), /status: draft/);
  assert.ok(existsSync(join(repo, '.kortext', 'STACK.md')));
  assert.ok(!existsSync(join(repo, '.kortext', 'reports')));
  rmSync(work, { recursive: true, force: true });
});

test('registry list/remove works; a missing folder is simply created', () => {
  const work = tempDir();
  const db = openDb(join(work, 'db.sqlite'));
  const a = createProject(db, { name: 'A', repoPath: join(work, 'a') }, pkgRoot);
  createProject(db, { name: 'B', repoPath: join(work, 'b') }, pkgRoot);
  assert.equal(listProjects(db).length, 2);
  assert.equal(removeProject(db, a.id), true);
  assert.equal(listProjects(db).length, 1);
  // remove only unregisters — repo files stay untouched
  assert.ok(existsSync(join(work, 'a', BRIEF_REL)));
  rmSync(work, { recursive: true, force: true });
});

test('duplicate repo_path is rejected by the registry', () => {
  const work = tempDir();
  const db = openDb(join(work, 'db.sqlite'));
  const repo = join(work, 'dup');
  createProject(db, { name: 'One', repoPath: repo }, pkgRoot);
  assert.throws(() => createProject(db, { name: 'Two', repoPath: repo }, pkgRoot));
  rmSync(work, { recursive: true, force: true });
});

const FORM_BRIEF = `# Acme CRM

## Product Vision & Goals

Küçük satış ekipleri için bir CRM: müşteri kartı, görüşme notları, sonraki adım hatırlatması.
Ekip bugün müşterileri ortak bir tabloda tutuyor ve görüşmeler arasında bağlamı kaybediyor.

## Target Audience & Personas

5-20 kişilik satış ekipleri, teknik olmayan kullanıcılar.

## Interface Language

Yalnızca Türkçe; ikinci dil v1 kapsamında değil.

## Key Performance Indicators (KPIs)

Aktif kullanıcı başına haftalık yazılan görüşme notu; son 30 günde notu olan müşteri oranı.

## Future Scope & Out of Scope

Faturalama yok, telefon entegrasyonu yok, mobil uygulama yok.`;

test('a brief written in the add form lands as the prime-approved BRD', () => {
  const work = tempDir();
  const db = openDb(join(work, 'db.sqlite'));
  const repo = join(work, 'brf');
  createProject(db, { name: 'Brf', repoPath: repo, brief: FORM_BRIEF }, pkgRoot);
  const body = readFileSync(join(repo, BRIEF_REL), 'utf8');
  assert.match(body, /status: approved/);
  assert.match(body, /author: \+prime/);
  assert.match(body, /Küçük satış ekipleri/);
  rmSync(work, { recursive: true, force: true });
});

test('Initialize judges nothing: even a thin brief lands as written', async () => {
  const work = tempDir();
  const db = openDb(join(work, 'db.sqlite'));
  const repo = join(work, 'thin');
  const p = createProject(db, { name: 'Thin', repoPath: repo, brief: 'deneme' }, pkgRoot);
  // Submitting your own brief is the approval; nothing has been read yet.
  assert.match(readFileSync(join(repo, BRIEF_REL), 'utf8'), /status: approved/);

  // The gate is what reads it, and a refusal sends it back to the human's desk
  // rather than leaving an approved brief next to "not enough to start".
  const { ensureReadiness } = await import('../server/readiness.js');
  const verdict = await ensureReadiness(p, { id: 'x', binary: 'true', args: [], installHint: '' });
  assert.equal(verdict.ready, false);
  assert.equal(verdict.stage, 'floor');
  assert.match(readFileSync(join(repo, BRIEF_REL), 'utf8'), /status: draft/);
  rmSync(work, { recursive: true, force: true });
});

test('legacy layout migrates: references flatten, memory TODO/decisions survive', () => {
  const work = tempDir();
  const db = openDb(join(work, 'db.sqlite'));
  const repo = join(work, 'legacy');
  const kx = join(repo, '.kortext');
  // hand-build a pre-flat project
  for (const d of ['references', 'memory', 'workflows', 'agents', 'templates']) {
    mkdirSync(join(kx, d), { recursive: true });
  }
  writeFileSync(join(kx, 'references', 'STACK.md'), '---\nstatus: approved\n---\n\n# Stack: eski içerik\n');
  writeFileSync(join(kx, 'memory', 'TODO.md'), '---\nstatus: approved\n---\n\n- [ ] X\n');
  writeFileSync(join(kx, 'memory', 'decisions.md'), '# eski karar\n');
  writeFileSync(join(kx, 'workflows', 'old.md'), 'x');

  createProject(db, { name: 'Legacy', repoPath: repo }, pkgRoot);

  assert.match(readFileSync(join(kx, 'STACK.md'), 'utf8'), /eski içerik/); // moved, not overwritten
  assert.match(readFileSync(join(kx, 'TODO.md'), 'utf8'), /- \[ \] X/);
  assert.match(readFileSync(join(kx, 'DECISIONS.md'), 'utf8'), /eski karar/);
  for (const d of ['references', 'memory', 'workflows', 'agents', 'templates']) {
    assert.equal(existsSync(join(kx, d)), false);
  }
  rmSync(work, { recursive: true, force: true });
});

test('the documents language chosen in the form reaches the step prompt', async () => {
  const work = tempDir();
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(
    db,
    { name: 'TR', repoPath: join(work, 'tr'), kind: 'existing', docLang: 'Türkçe' },
    pkgRoot,
  );
  assert.equal(p.doc_lang, 'Türkçe');
  const { buildStepPrompt } = await import('../server/runner.js');
  const prompt = buildStepPrompt(
    p,
    { output: 'STACK.md', inputs: [], author: '+architect', approver: '+prime' },
    '',
    null,
  );
  // An existing project has no brief, so a stated language is the only thing
  // standing between the reader and a document in the repository's language.
  assert.match(prompt, /write the PROSE in Türkçe/);
  assert.match(prompt, /ENGLISH ALWAYS/);
  rmSync(work, { recursive: true, force: true });
});
