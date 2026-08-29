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
  const p = createProject(db, { name: 'Acme', repoPath: repo, mode: 'new' }, pkgRoot);
  assert.equal(p.name, 'Acme');
  const brief = join(repo, BRIEF_REL);
  assert.ok(existsSync(brief));
  assert.match(readFileSync(brief, 'utf8'), /status: draft/);
  assert.ok(existsSync(join(repo, '.kortext', 'STACK.md')));
  assert.ok(existsSync(join(repo, '.kortext', 'reports')));
  rmSync(work, { recursive: true, force: true });
});

test('existing mode requires the path to exist; registry list/remove works', () => {
  const work = tempDir();
  const db = openDb(join(work, 'db.sqlite'));
  assert.throws(() =>
    createProject(db, { name: 'Ghost', repoPath: join(work, 'nope'), mode: 'existing' }, pkgRoot),
  );
  const a = createProject(db, { name: 'A', repoPath: join(work, 'a'), mode: 'new' }, pkgRoot);
  createProject(db, { name: 'B', repoPath: join(work, 'b'), mode: 'new' }, pkgRoot);
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
  createProject(db, { name: 'One', repoPath: repo, mode: 'new' }, pkgRoot);
  assert.throws(() => createProject(db, { name: 'Two', repoPath: repo, mode: 'existing' }, pkgRoot));
  rmSync(work, { recursive: true, force: true });
});

test('brief from the add form lands as prime-authored APPROVED BRD', () => {
  const work = tempDir();
  const db = openDb(join(work, 'db.sqlite'));
  const repo = join(work, 'brf');
  createProject(db, { name: 'Brf', repoPath: repo, mode: 'new', brief: '# Acme\n\nKüçük CRM.' }, pkgRoot);
  const body = readFileSync(join(repo, BRIEF_REL), 'utf8');
  assert.match(body, /status: approved/);
  assert.match(body, /author: \+prime/);
  assert.match(body, /Küçük CRM/);
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

  createProject(db, { name: 'Legacy', repoPath: repo, mode: 'existing' }, pkgRoot);

  assert.match(readFileSync(join(kx, 'STACK.md'), 'utf8'), /eski içerik/); // moved, not overwritten
  assert.match(readFileSync(join(kx, 'TODO.md'), 'utf8'), /- \[ \] X/);
  assert.match(readFileSync(join(kx, 'DECISIONS.md'), 'utf8'), /eski karar/);
  for (const d of ['references', 'memory', 'workflows', 'agents', 'templates']) {
    assert.equal(existsSync(join(kx, d)), false);
  }
  rmSync(work, { recursive: true, force: true });
});
