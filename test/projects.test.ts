import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';
import { createProject, listProjects, removeProject, BRIEF_REL } from '../server/projects.js';

const templatesDir = join(process.cwd(), 'templates');

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'kortext-test-'));
}

test('create new project scaffolds .kortext workspace with draft BRD', () => {
  const work = tempDir();
  const db = openDb(join(work, 'db.sqlite'));
  const repo = join(work, 'acme');
  const p = createProject(db, { name: 'Acme', repoPath: repo, mode: 'new' }, templatesDir);
  assert.equal(p.name, 'Acme');
  const brief = join(repo, BRIEF_REL);
  assert.ok(existsSync(brief));
  assert.match(readFileSync(brief, 'utf8'), /status: draft/);
  assert.ok(existsSync(join(repo, '.kortext', 'references')));
  assert.ok(existsSync(join(repo, '.kortext', 'reports')));
  rmSync(work, { recursive: true, force: true });
});

test('existing mode requires the path to exist; registry list/remove works', () => {
  const work = tempDir();
  const db = openDb(join(work, 'db.sqlite'));
  assert.throws(() =>
    createProject(db, { name: 'Ghost', repoPath: join(work, 'nope'), mode: 'existing' }, templatesDir),
  );
  const a = createProject(db, { name: 'A', repoPath: join(work, 'a'), mode: 'new' }, templatesDir);
  createProject(db, { name: 'B', repoPath: join(work, 'b'), mode: 'new' }, templatesDir);
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
  createProject(db, { name: 'One', repoPath: repo, mode: 'new' }, templatesDir);
  assert.throws(() => createProject(db, { name: 'Two', repoPath: repo, mode: 'existing' }, templatesDir));
  rmSync(work, { recursive: true, force: true });
});
