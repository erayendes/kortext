import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { openDb } from '../server/db.js';
import { engineFor, selectedEngine } from '../server/engines.js';
import {
  createProject,
  listProjects,
  removeProject,
  scaffoldProject,
  uninstallContract,
  BRIEF_REL,
} from '../server/projects.js';

const pkgRoot = process.cwd();

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'kortext-test-'));
}

test('create new project scaffolds .kortext workspace with a draft brief', () => {
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

test('a brief written in the add form lands as the prime-approved brief', () => {
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
  const verdict = await ensureReadiness(
    p,
    { id: 'x', binary: 'true', args: [], installHint: '' },
    new AbortController().signal,
  );
  assert.equal(verdict.ready, false);
  assert.equal(verdict.stage, 'floor');
  assert.match(readFileSync(join(repo, BRIEF_REL), 'utf8'), /status: draft/);
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

test('re-adding a registered folder names the project instead of the constraint', () => {
  const work = tempDir();
  const db = openDb(join(work, 'db.sqlite'));
  const repo = join(work, 'same');
  createProject(db, { name: 'First', repoPath: repo }, pkgRoot);
  assert.throws(
    () => createProject(db, { name: 'Second', repoPath: repo }, pkgRoot),
    /already the project "First"/,
  );
  db.prepare('UPDATE projects SET archived = 1 WHERE repo_path = ?').run(repo);
  assert.throws(
    () => createProject(db, { name: 'Second', repoPath: repo }, pkgRoot),
    /archived project "First" — unarchive it/,
  );
  rmSync(work, { recursive: true, force: true });
});

test('the contract goes in as a block: a hand-written AGENTS.md survives, and cancel takes back only the block', () => {
  const work = tempDir();
  const repo = join(work, 'acme');
  mkdirSync(repo, { recursive: true });
  writeFileSync(join(repo, 'AGENTS.md'), '# My own rules\n\nNever touch the migrations.\n', 'utf8');
  writeFileSync(join(repo, 'CLAUDE.md'), '# Project memory\n', 'utf8');

  scaffoldProject(repo, pkgRoot, { skipBrief: true });
  const agents = () => readFileSync(join(repo, 'AGENTS.md'), 'utf8');
  assert.match(agents(), /Never touch the migrations/);
  assert.match(agents(), /<!-- kortext:start -->/);
  assert.match(agents(), /Handover Constitution/);
  assert.match(readFileSync(join(repo, 'CLAUDE.md'), 'utf8'), /<!-- kortext --> Read AGENTS\.md/);

  // Re-scaffolding (the panel does it on every poll) neither duplicates the
  // block nor the pointer.
  scaffoldProject(repo, pkgRoot, { skipBrief: true });
  assert.equal(agents().split('<!-- kortext:start -->').length - 1, 1);
  assert.equal(
    readFileSync(join(repo, 'CLAUDE.md'), 'utf8').split('<!-- kortext -->').length - 1,
    1,
  );

  uninstallContract(repo);
  assert.equal(agents().trim(), '# My own rules\n\nNever touch the migrations.'.trim());
  assert.equal(readFileSync(join(repo, 'CLAUDE.md'), 'utf8'), '# Project memory\n');
  rmSync(work, { recursive: true, force: true });
});

test('with no AGENTS.md of its own the block is the whole file, and cancel removes it', () => {
  const work = tempDir();
  const repo = join(work, 'acme');
  mkdirSync(repo, { recursive: true });
  scaffoldProject(repo, pkgRoot, { skipBrief: true });
  assert.ok(existsSync(join(repo, 'AGENTS.md')));
  // No CLAUDE.md existed, so kortext must not have invented one.
  assert.ok(!existsSync(join(repo, 'CLAUDE.md')));
  uninstallContract(repo);
  assert.ok(!existsSync(join(repo, 'AGENTS.md')));
  rmSync(work, { recursive: true, force: true });
});

test('an AGENTS.md kortext never wrote is left alone by cancel', () => {
  const work = tempDir();
  const repo = join(work, 'acme');
  mkdirSync(repo, { recursive: true });
  writeFileSync(join(repo, 'AGENTS.md'), '# Mine alone\n', 'utf8');
  uninstallContract(repo);
  assert.equal(readFileSync(join(repo, 'AGENTS.md'), 'utf8'), '# Mine alone\n');
  rmSync(work, { recursive: true, force: true });
});

test('a project carries its own engine; a project without one falls back to the global setting', () => {
  const work = tempDir();
  const db = openDb(join(work, 'db.sqlite'));
  const a = createProject(
    db,
    { name: 'Acme', repoPath: join(work, 'a'), engine: 'codex' },
    pkgRoot,
  );
  const b = createProject(db, { name: 'Beta', repoPath: join(work, 'b'), code: 'BETA' }, pkgRoot);
  assert.equal(a.engine, 'codex');
  assert.equal(b.engine, '');
  // engineFor never returns an uninstalled CLI: with none installed on this
  // machine it falls through to the global resolution, which is also null.
  assert.equal(engineFor(db, { engine: 'nope' })?.id ?? null, selectedEngine(db)?.id ?? null);
  rmSync(work, { recursive: true, force: true });
});

test('a save with no content is refused, not written over the document', async () => {
  const work = tempDir();
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Guard', repoPath: join(work, 'guard') }, pkgRoot);
  const { buildApp } = await import('../server/app.js');
  const app = buildApp(db, pkgRoot, join(work, 'db.sqlite'));
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  const doc = join(work, 'guard', '.kortext', 'STACK.md');
  const before = readFileSync(doc, 'utf8');

  const save = (body: unknown) =>
    fetch(`http://127.0.0.1:${port}/api/projects/${p.id}/docs/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  assert.equal((await save({ rel: 'STACK.md' })).status, 400, 'a missing body is refused');
  assert.equal((await save({ rel: 'STACK.md', content: '   ' })).status, 400, 'so is whitespace');
  assert.equal(readFileSync(doc, 'utf8'), before, 'the document is untouched');
  assert.equal((await save({ rel: 'STACK.md', content: '# mine\n' })).status, 200);
  assert.equal(readFileSync(doc, 'utf8'), '# mine\n');
  server.close();
  rmSync(work, { recursive: true, force: true });
});

test('a document being rewritten cannot be saved over, and an approved edit re-reads its readers', async () => {
  const work = tempDir();
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Guard2', repoPath: join(work, 'guard2') }, pkgRoot);
  const { buildApp } = await import('../server/app.js');
  const app = buildApp(db, pkgRoot, join(work, 'db.sqlite'));
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  const doc = join(work, 'guard2', '.kortext', 'STACK.md');
  const before = readFileSync(doc, 'utf8');

  db.prepare("INSERT INTO jobs (project_id, doc_rel, kind) VALUES (?, 'STACK.md', 'doc')").run(
    p.id,
  );
  const res = await fetch(`http://127.0.0.1:${port}/api/projects/${p.id}/docs/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rel: 'STACK.md', content: '# mine\n' }),
  });
  assert.equal(res.status, 409, 'a rewrite in flight refuses the save');
  assert.equal(readFileSync(doc, 'utf8'), before, 'the document is untouched');
  server.close();
  rmSync(work, { recursive: true, force: true });
});

test('a cross-site page cannot reach the API, and the vite proxy still can', async () => {
  const work = tempDir();
  const db = openDb(join(work, 'db.sqlite'));
  const p = createProject(db, { name: 'Origin', repoPath: join(work, 'origin') }, pkgRoot);
  const { buildApp } = await import('../server/app.js');
  const app = buildApp(db, pkgRoot, join(work, 'db.sqlite'));
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  const kortext = join(work, 'origin', '.kortext');

  // `fetch` drops a Host header (it is forbidden there, as in a browser), and a
  // rebound name is exactly a request that carries someone else's — so this one
  // goes out over node:http, which lets the header through.
  const status = (path: string, headers: Record<string, string>): Promise<number> =>
    new Promise((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, path, method: 'POST', headers }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end();
    });

  try {
    // The shape that needs no body and no content type: a simple POST the
    // browser sends without a preflight, which used to delete the analysis.
    const cancel = `/api/projects/${p.id}/cancel`;
    assert.equal(await status(cancel, { Origin: 'https://evil.example' }), 403, 'cross-site');
    assert.ok(existsSync(kortext), 'the workspace survives the cross-site POST');
    assert.equal(await status(cancel, { Host: 'kortext.evil.example' }), 403, 'rebound name');
    assert.ok(existsSync(kortext), 'and survives the rebound host');

    // The dev panel lives on another loopback port and proxies through here;
    // refusing it would break `npm run dev:web` for everyone.
    const dev = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { Origin: 'http://localhost:3442' },
    });
    assert.equal(dev.status, 200, 'a loopback origin on another port is allowed');
  } finally {
    // A failed assertion above must not leave the listener holding the suite open.
    server.close();
    rmSync(work, { recursive: true, force: true });
  }
});
