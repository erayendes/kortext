import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { openDb, logPathFor, logRootDir } from '../server/db.js';
import { buildApp } from '../server/app.js';
import { createProject } from '../server/projects.js';
import { analysisComplete, docPath, docVersion, listDocs } from '../server/docs.js';
import {
  abortRuns,
  advance,
  failStaleJobs,
  listJobs,
  recheckDependents,
  removeRunLogs,
} from '../server/runner.js';
import { forgetDetectedEngines } from '../server/engines.js';

const pkgRoot = process.cwd();
const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean) {
  for (let i = 0; i < 250; i++) {
    if (check()) return;
    await wait();
  }
  assert.fail('timed out waiting for the stand-in');
}

async function fixture(t: TestContext) {
  const work = mkdtempSync(join(tmpdir(), 'kortext-release-'));
  const path = join(work, 'db.sqlite');
  const db = openDb(path);
  const p = createProject(
    db,
    { name: 'Release', code: 'REL', repoPath: join(work, 'repo') },
    pkgRoot,
  );
  for (const d of listDocs(db, p, pkgRoot)) {
    writeFileSync(
      docPath(p, d.rel),
      '---\nstatus: approved\n---\n\n' +
        'A shared shopping list for households. '.repeat(15) +
        '\n\n## Revision Requests\n',
    );
  }
  db.prepare('UPDATE projects SET paused = 1 WHERE id = ?').run(p.id);
  const bin = join(work, 'bin');
  mkdirSync(bin);
  const script = join(bin, 'claude');
  writeFileSync(
    script,
    `#!${process.execPath}
const fs = require('node:fs');
let prompt = '';
process.stdin.on('data', chunk => prompt += chunk);
process.stdin.on('end', async () => {
  fs.appendFileSync('prompts.txt', prompt + '\\n=====\\n');
  const mode = fs.existsSync('mode.json') ? JSON.parse(fs.readFileSync('mode.json')) : {};
  if (mode.delay) await new Promise(r => setTimeout(r, mode.delay));
  if (mode.fail) process.exit(12);
  if (prompt.includes('readiness gate')) {
    fs.writeFileSync('.kortext/.readiness.json', JSON.stringify({ready: true}));
  } else if (prompt.includes('Write your verdict to')) {
    const path = prompt.match(/Write your verdict to (\\S+) and NOTHING/)[1];
    fs.writeFileSync(path, JSON.stringify({needsChange: false}));
  } else {
    const rel = prompt.match(/Produce EXACTLY this file and nothing else: \\.kortext\\/([^\\n]+)/)[1];
    fs.writeFileSync('.kortext/' + rel, '---\\nstatus: draft\\n---\\n\\nRevision ' + Date.now());
  }
});
`,
  );
  chmodSync(script, 0o755);
  for (const name of ['codex', 'gemini']) {
    const other = join(bin, name);
    writeFileSync(other, `#!${process.execPath}\nprocess.exit(97);\n`);
    chmodSync(other, 0o755);
  }
  const oldPath = process.env.PATH;
  process.env.PATH = bin + delimiter + oldPath;
  forgetDetectedEngines();
  const server = buildApp(db, pkgRoot, path).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  t.after(async () => {
    db.prepare('UPDATE projects SET paused = 1').run();
    abortRuns(p.id);
    await until(() => !listJobs(db, p.id).some((j) => j.status === 'running'));
    await wait(50);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    process.env.PATH = oldPath;
    forgetDetectedEngines();
    rmSync(work, { recursive: true, force: true });
  });
  const request = (suffix: string, body: unknown, method = 'POST') =>
    fetch(`http://127.0.0.1:${port}/api/projects/${p.id}/${suffix}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const engine = { id: 'stand-in', binary: script, args: [], installHint: '' };
  return { work, db, p, request, engine };
}

test('approval and saving reject stale text and a writer in flight', async (t) => {
  const { db, p, request } = await fixture(t);
  const path = docPath(p, 'PRODUCT.md');
  const original = '---\nstatus: draft\n---\n\nOriginal';
  writeFileSync(path, original);
  assert.equal(
    (
      await request(
        'docs/content',
        { rel: 'PRODUCT.md', content: original + '\nA', expectedVersion: docVersion(original) },
        'PUT',
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        'docs/content',
        { rel: 'PRODUCT.md', content: original + '\nB', expectedVersion: docVersion(original) },
        'PUT',
      )
    ).status,
    409,
  );
  assert.equal(
    (await request('docs/approve', { rel: 'PRODUCT.md', expectedVersion: docVersion(original) }))
      .status,
    409,
  );
  assert.equal((await request('docs/approve', { rel: 'PRODUCT.md' })).status, 428);
  const current = readFileSync(path, 'utf8');
  db.prepare("INSERT INTO jobs (project_id, doc_rel) VALUES (?, 'PRODUCT.md')").run(p.id);
  assert.equal(
    (await request('docs/approve', { rel: 'PRODUCT.md', expectedVersion: docVersion(current) }))
      .status,
    409,
  );
  assert.equal(readFileSync(path, 'utf8'), current);
  db.prepare("UPDATE jobs SET status = 'done'").run();
  assert.equal(
    (await request('docs/approve', { rel: 'PRODUCT.md', expectedVersion: docVersion(current) }))
      .status,
    200,
  );
});

test('an approved edit while paused persists rechecks until Continue', async (t) => {
  const { db, p, request, engine } = await fixture(t);
  const original = readFileSync(docPath(p, 'PRODUCT.md'), 'utf8');
  assert.equal(
    (
      await request(
        'docs/content',
        {
          rel: 'PRODUCT.md',
          expectedVersion: docVersion(original),
          content: original + '\nNew requirement',
        },
        'PUT',
      )
    ).status,
    200,
  );
  await wait();
  const count = () =>
    (db.prepare('SELECT count(*) n FROM pending_rechecks').get() as { n: number }).n;
  assert.ok(count() > 0);
  assert.equal(analysisComplete(db, p, pkgRoot), false);
  assert.equal(listJobs(db, p.id).length, 0);
  db.prepare('UPDATE projects SET paused = 0').run();
  await advance(db, p, engine, pkgRoot);
  assert.equal(count(), 0);
  assert.equal(analysisComplete(db, p, pkgRoot), true);
});

test('interrupted rechecks survive reopening the database and retry once', async (t) => {
  const { db, p, engine, work } = await fixture(t);
  writeFileSync(join(p.repo_path, 'mode.json'), JSON.stringify({ delay: 300 }));
  db.prepare('UPDATE projects SET paused = 0').run();
  recheckDependents(db, p, 'PRODUCT.md', engine, pkgRoot);
  await until(() => listJobs(db, p.id).some((j) => j.kind === 'recheck' && j.status === 'running'));
  db.prepare('UPDATE projects SET paused = 1').run();
  abortRuns(p.id);
  await until(() => !listJobs(db, p.id).some((j) => j.status === 'running'));
  await wait(50);
  const resumed = openDb(join(work, 'db.sqlite'));
  try {
    failStaleJobs(resumed);
    assert.ok(resumed.prepare('SELECT 1 FROM pending_rechecks').get());
    writeFileSync(join(p.repo_path, 'mode.json'), '{}');
    resumed.prepare('UPDATE projects SET paused = 0').run();
    await advance(resumed, p, engine, pkgRoot);
    assert.equal(resumed.prepare('SELECT 1 FROM pending_rechecks').get(), undefined);
    assert.equal(analysisComplete(resumed, p, pkgRoot), true);
  } finally {
    resumed.close();
  }
});

test('Retry repeats the failed revision notes and settles its matching demand', async (t) => {
  const { db, p, request } = await fixture(t);
  writeFileSync(join(p.repo_path, 'mode.json'), JSON.stringify({ fail: true }));
  db.prepare('UPDATE projects SET paused = 0').run();
  const source = docPath(p, 'STACK.md');
  writeFileSync(
    source,
    readFileSync(source, 'utf8') + '\n- `PRODUCT.md` — Keep the household rule.\n',
  );
  const notes = [
    '[STACK.md asks] Keep the household rule.',
    '[prime decides] Preserve offline access.',
  ];
  assert.equal((await request('docs/revise', { rel: 'PRODUCT.md', notes })).status, 202);
  await until(() => listJobs(db, p.id)[0]?.status === 'failed');
  assert.deepEqual(JSON.parse(listJobs(db, p.id)[0].notes), notes);
  writeFileSync(join(p.repo_path, 'mode.json'), '{}');
  assert.equal((await request('docs/retry', { rel: 'PRODUCT.md' })).status, 202);
  await until(() => listJobs(db, p.id)[0]?.status === 'done');
  assert.deepEqual(JSON.parse(listJobs(db, p.id)[0].notes), notes);
  assert.match(readFileSync(docPath(p, 'PRODUCT.md'), 'utf8'), /Revision/);
  assert.equal(
    listDocs(db, p, pkgRoot).find((d) => d.rel === 'PRODUCT.md')!.revisionRequests.length,
    0,
  );
});

test('symlink aliases and new folders below them cannot register twice', async (t) => {
  const { db, p, work } = await fixture(t);
  const alias = join(work, 'alias');
  symlinkSync(p.repo_path, alias, 'dir');
  assert.throws(
    () => createProject(db, { name: 'Alias', code: 'ALIAS', repoPath: alias }, pkgRoot),
    /already the project/,
  );
  createProject(db, { name: 'Child', code: 'CHILD', repoPath: join(alias, 'child') }, pkgRoot);
  assert.throws(
    () =>
      createProject(
        db,
        { name: 'Again', code: 'AGAIN', repoPath: join(p.repo_path, 'child') },
        pkgRoot,
      ),
    /already the project/,
  );
});

test('sibling databases retain separate logs after both are opened', () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-logs-'));
  const a = openDb(join(work, 'a.sqlite'));
  const b = openDb(join(work, 'b.sqlite'));
  try {
    assert.notEqual(logRootDir(a), logRootDir(b));
    for (const db of [a, b]) {
      mkdirSync(logRootDir(db));
      writeFileSync(logPathFor(db, 'p1-plan.log'), 'log');
    }
    removeRunLogs(1, logRootDir(a));
    assert.equal(existsSync(logPathFor(a, 'p1-plan.log')), false);
    assert.equal(existsSync(logPathFor(b, 'p1-plan.log')), true);
  } finally {
    a.close();
    b.close();
    rmSync(work, { recursive: true, force: true });
  }
});
