import test from 'node:test';
import assert from 'node:assert/strict';
import { isNewer } from '../server/update.js';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { buildApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { createProject } from '../server/projects.js';
import { forgetDetectedEngines } from '../server/engines.js';
import { abortRuns, hasActiveRuns } from '../server/runner.js';

test('a newer release shows, an older or equal one does not', () => {
  assert.equal(isNewer('3.2.0', '3.1.0'), true);
  assert.equal(isNewer('3.1.1', '3.1.0'), true);
  assert.equal(isNewer('4.0.0', '3.10.0'), true);
  assert.equal(isNewer('3.1.0', '3.1.0'), false);
  assert.equal(isNewer('3.1.0', '3.2.0'), false);
  // Two digits sort as numbers, not as text: 3.10.0 is after 3.9.0.
  assert.equal(isNewer('3.9.0', '3.10.0'), false);
  // A prerelease is not the release, and never nags anyone into installing it.
  assert.equal(isNewer('3.2.0-rc.1', '3.2.0'), false);
});

test(
  'updates exclude agent work, other updates, polling and resets in both directions',
  {
    skip: process.platform === 'win32' && 'POSIX stand-ins; Windows remains experimental',
  },
  async () => {
    const work = mkdtempSync(join(tmpdir(), 'kortext-update-'));
    const pkg = join(work, 'node_modules', 'kortext');
    const bin = join(work, 'bin');
    mkdirSync(pkg, { recursive: true });
    mkdirSync(bin);
    for (const name of ['templates', 'agents', 'workflows', 'package.json']) {
      cpSync(join(process.cwd(), name), join(pkg, name), { recursive: true });
    }
    // No real npm or agent can be reached, even if engine selection falls back.
    for (const name of ['npm', 'claude', 'codex', 'gemini']) {
      writeFileSync(
        join(bin, name),
        `#!${process.execPath}
const fs = require('node:fs');
const root = ${JSON.stringify(work)};
const name = ${JSON.stringify(name)};
if (name === 'codex' || name === 'gemini') process.exit(97);
process.stdin.resume();
fs.writeFileSync(root + '/' + name + '.started', '');
const deadline = Date.now() + 10000;
const timer = setInterval(() => {
  if (fs.existsSync(root + '/' + name + '.release') || Date.now() > deadline) {
    clearInterval(timer);
    process.exit(name === 'npm' && !fs.existsSync(root + '/fail') ? 0 : 97);
  }
}, 10);
`,
        { mode: 0o755 },
      );
    }
    const oldPath = process.env.PATH;
    process.env.PATH = bin + delimiter + oldPath;
    forgetDetectedEngines();
    const dbPath = join(work, 'db.sqlite');
    const db = openDb(dbPath);
    const project = createProject(
      db,
      {
        name: 'Update',
        code: 'UPD',
        repoPath: join(work, 'repo'),
      },
      pkg,
    );
    db.prepare('UPDATE projects SET paused = 1').run();
    const server = buildApp(db, pkg, dbPath).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
    const route = `/projects/${project.id}`;
    const request = (path: string, body: unknown = {}, method = 'POST') =>
      fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const waitFor = async (check: () => boolean) => {
      for (let i = 0; i < 250; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.fail('stand-in timed out');
    };
    const release = (name: string) => writeFileSync(join(work, name + '.release'), '');
    try {
      const before = readFileSync(join(project.repo_path, '.kortext', 'PRODUCT.md'), 'utf8');
      const update = request('/version/update');
      await waitFor(() => existsSync(join(work, 'npm.started')));
      for (const path of [
        '/version/update',
        '/quit',
        route + '/restart',
        route + '/run-next',
        route + '/pause',
        route + '/transfer',
        route + '/docs/revise',
        route + '/docs/retry',
        route + '/docs/approve',
        route + '/docs/propose',
        route + '/docs/explain',
        route + '/docs/decide-request',
      ]) {
        const res = await request(path, {
          rel: 'PRODUCT.md',
          notes: ['Revise this'],
          paused: false,
        });
        assert.equal(res.status, 409, path);
        assert.match((await res.json()).error, /updating/, path);
      }
      assert.equal(
        (await request(route + '/docs/content', { rel: 'PRODUCT.md', content: 'changed' }, 'PUT'))
          .status,
        409,
      );
      assert.equal((await fetch(base + route + '/docs')).status, 409);
      assert.equal((await fetch(base + '/health')).status, 200);
      assert.equal(readFileSync(join(project.repo_path, '.kortext', 'PRODUCT.md'), 'utf8'), before);
      assert.equal(db.prepare('SELECT 1 FROM jobs').get(), undefined);
      assert.equal(existsSync(join(work, 'claude.started')), false);
      release('npm');
      assert.equal((await update).status, 200);
      assert.equal((await fetch(base + route + '/docs')).status, 200);

      // An unsuccessful install, including failure to spawn npm, releases the lock.
      writeFileSync(join(work, 'fail'), '');
      assert.equal((await request('/version/update')).status, 500);
      assert.equal((await fetch(base + route + '/docs')).status, 200);
      renameSync(join(bin, 'npm'), join(bin, 'npm.disabled'));
      process.env.PATH = bin;
      assert.equal((await request('/version/update')).status, 500);
      assert.equal((await fetch(base + route + '/docs')).status, 200);
      renameSync(join(bin, 'npm.disabled'), join(bin, 'npm'));
      process.env.PATH = bin + delimiter + oldPath;

      // Q&A has no jobs row; the live-run registry must still exclude updates.
      const question = request(route + '/docs/explain', { rel: 'PRODUCT.md', question: 'Why?' });
      await waitFor(() => existsSync(join(work, 'claude.started')));
      assert.equal(db.prepare('SELECT 1 FROM jobs').get(), undefined);
      assert.equal((await request('/version/update')).status, 409);
      release('claude');
      assert.equal((await question).status, 500); // the stand-in exits nonzero

      // A fire-and-forget revision remains protected after its HTTP response ends.
      rmSync(join(work, 'claude.release'));
      rmSync(join(work, 'claude.started'));
      assert.equal(
        (await request(route + '/docs/revise', { rel: 'PRODUCT.md', notes: ['Revise'] })).status,
        202,
      );
      await waitFor(() => existsSync(join(work, 'claude.started')));
      assert.equal((await request('/version/update')).status, 409);
      release('claude');
      await waitFor(() => !hasActiveRuns());

      // Restart is asleep between aborting runs and reading package templates.
      db.prepare('UPDATE projects SET paused = 0').run();
      const restart = request(route + '/restart');
      await waitFor(
        () => (db.prepare('SELECT paused FROM projects').get() as { paused: number }).paused === 1,
      );
      assert.equal(hasActiveRuns(), false);
      assert.equal((await request('/version/update')).status, 409);
      assert.equal((await restart).status, 200);
      // The failing stand-in returns 500 once the restart lock is released.
      assert.equal((await request('/version/update')).status, 500);
    } finally {
      release('npm');
      release('claude');
      abortRuns(project.id);
      await waitFor(() => !hasActiveRuns());
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
      process.env.PATH = oldPath;
      forgetDetectedEngines();
      rmSync(work, { recursive: true, force: true });
    }
  },
);
