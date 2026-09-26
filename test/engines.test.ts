import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { spawnCli } from '../server/cli-spawn.ts';
import { ENGINES, engineArgs, engineEnv } from '../server/engines.ts';

const spec = (id: string) => ENGINES.find((e) => e.id === id)!;

test('the model rides after the flag, the workspace after its own, nothing when unset', () => {
  assert.deepEqual(engineArgs(spec('codex'), { model: '' }), spec('codex').args);
  assert.deepEqual(engineArgs(spec('codex'), { model: 'gpt-6-astra' }), [
    ...spec('codex').args,
    '-m',
    'gpt-6-astra',
  ]);
  assert.deepEqual(engineArgs(spec('antigravity'), { model: 'x', repo_path: '/r' }), [
    ...spec('antigravity').args,
    '--add-dir',
    '/r',
    '--model',
    'x',
  ]);
  // No flag: the model is dropped, not passed as a stray argument.
  assert.deepEqual(engineArgs(spec('amp'), { model: 'x' }), spec('amp').args);
  // Effort: a flag on claude, a config override on codex, nothing on gemini,
  // and a level the CLI does not take is dropped.
  assert.deepEqual(engineArgs(spec('claude'), { effort: 'high' }), [
    ...spec('claude').args,
    '--effort',
    'high',
  ]);
  assert.deepEqual(engineArgs(spec('codex'), { model: 'gpt-6-astra', effort: 'low' }), [
    ...spec('codex').args,
    '-m',
    'gpt-6-astra',
    '-c',
    'model_reasoning_effort=low',
  ]);
  assert.deepEqual(engineArgs(spec('claude'), { effort: 'ultra' }), spec('claude').args);
  assert.deepEqual(engineArgs(spec('gemini'), { effort: 'high' }), spec('gemini').args);
  // Or it travels in the environment.
  assert.equal(engineEnv(spec('goose'), { model: 'm' })?.GOOSE_MODEL, 'm');
  assert.equal(engineEnv(spec('goose'), { model: 'm' })?.GOOSE_MODE, 'auto');
  assert.equal(engineEnv(spec('claude'), { model: 'm' }), undefined);
});

test('a prompt goes on stdin, after a flag, or last and alone — as the spec says', async () => {
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  // Echoes its arguments one per line, then stdin.
  const script = join(work, 'echo.sh');
  writeFileSync(script, '#!/bin/sh\nfor a in "$@"; do echo "arg:$a"; done\necho "stdin:$(cat)"\n');
  chmodSync(script, 0o755);
  const run = async (promptFlag?: string) => {
    const logPath = join(work, `${promptFlag ?? 'stdin'}.log`);
    await spawnCli({
      binary: script,
      args: ['--x'],
      cwd: work,
      stdin: 'hello there',
      promptFlag,
      logPath,
      signal: new AbortController().signal,
    });
    return readFileSync(logPath, 'utf8');
  };
  assert.match(await run(), /arg:--x\nstdin:hello there/);
  assert.match(await run('-p'), /arg:--x\narg:-p\narg:hello there\nstdin:$/m);
  assert.match(await run(''), /arg:--x\narg:hello there\nstdin:$/m);
  rmSync(work, { recursive: true, force: true });
});

test('switching the CLI drops a model the new CLI does not know', async () => {
  const { openDb } = await import('../server/db.ts');
  const { createProject } = await import('../server/projects.ts');
  const { buildApp } = await import('../server/app.ts');
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const pkgRoot = join(import.meta.dirname, '..');
  const p = createProject(db, { name: 'Sw', repoPath: join(work, 'sw') }, pkgRoot);
  const server = buildApp(db, pkgRoot, join(work, 'db.sqlite')).listen(0);
  const port = (server.address() as { port: number }).port;
  const put = (path: string, body: unknown) =>
    fetch(`http://127.0.0.1:${port}/api/projects/${p.id}/${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json());
  await put('engine', { id: 'claude' });
  await put('model', { model: 'sonnet' });
  // codex does not know `sonnet`: the switch resets it to the CLI's default.
  assert.deepEqual(await put('engine', { id: 'codex' }), {
    engine: 'codex',
    model: '',
    effort: '',
  });
  const row = () =>
    db.prepare('SELECT engine, model FROM projects WHERE id = ?').get(p.id) as {
      engine: string;
      model: string;
    };
  assert.deepEqual(row(), { engine: 'codex', model: '' });
  // A name both know survives the switch.
  await put('model', { model: 'gpt-5.4' });
  await put('engine', { id: 'copilot' });
  assert.equal(row().model, 'gpt-5.4');
  server.close();
  rmSync(work, { recursive: true, force: true });
});

test('Add project takes the picker model and effort, and refuses a level the CLI lacks', async () => {
  const { openDb } = await import('../server/db.ts');
  const { buildApp } = await import('../server/app.ts');
  const work = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const db = openDb(join(work, 'db.sqlite'));
  const pkgRoot = join(import.meta.dirname, '..');
  const server = buildApp(db, pkgRoot, join(work, 'db.sqlite')).listen(0);
  const port = (server.address() as { port: number }).port;
  const post = (body: unknown) =>
    fetch(`http://127.0.0.1:${port}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const ok = await post({
    name: 'Picked',
    repoPath: join(work, 'picked'),
    engine: 'codex',
    model: 'gpt-5.4',
    effort: 'high',
  });
  assert.equal(ok.status, 201);
  const row = db
    .prepare('SELECT engine, model, effort FROM projects WHERE id = ?')
    .get(ok.body.project.id);
  assert.deepEqual(row, { engine: 'codex', model: 'gpt-5.4', effort: 'high' });
  const bad = await post({
    name: 'Wrong',
    repoPath: join(work, 'wrong'),
    engine: 'codex',
    effort: 'ultracode',
  });
  assert.equal(bad.status, 400);
  server.close();
  rmSync(work, { recursive: true, force: true });
});

test('a level the model lacks never reaches the CLI', () => {
  const agy = spec('antigravity');
  // agy refuses the whole run: "--effort is not supported for model ...".
  assert.ok(
    !engineArgs(agy, { model: 'claude-opus-4-6-thinking', effort: 'high' }).includes('--effort'),
  );
  assert.ok(!engineArgs(agy, { model: 'gemini-3.1-pro', effort: 'medium' }).includes('--effort'));
  assert.deepEqual(engineArgs(agy, { model: 'gemini-3.1-pro', effort: 'low' }).slice(-2), [
    '--effort',
    'low',
  ]);
  assert.deepEqual(engineArgs(agy, { effort: 'medium' }).slice(-2), ['--effort', 'medium']);
});
