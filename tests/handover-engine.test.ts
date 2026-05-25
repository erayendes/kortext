import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as cp from 'node:child_process';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { HandoverEngine } from '../server/engine/handover.ts';

const runFile = cp.execFileSync;

let tmpRoot: string;
let workspaceRoot: string;
let agentsDir: string;
let db: Database.Database;
let repos: Repositories;

const personaMd = (handle: string) =>
  `# ${handle}\n\n- description: ${handle} role.\n\n## identity\nbody\n`;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-handover-'));
  workspaceRoot = join(tmpRoot, 'workspace');
  agentsDir = join(tmpRoot, 'agents');
  mkdirSync(workspaceRoot, { recursive: true });
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(join(agentsDir, 'backend-developer.md'), personaMd('backend-developer'));
  writeFileSync(join(agentsDir, 'qa-engineer.md'), personaMd('qa-engineer'));
  const bundle = openDb({ path: join(tmpRoot, 'handover.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

function makeEngine() {
  return new HandoverEngine({
    repos,
    personas: loadPersonasFromDir(agentsDir),
    workspaceRoot,
    // deterministic clock for date assertions
    now: () => new Date('2026-05-22T10:30:00Z'),
  });
}

function seedItem(id: string): void {
  repos.backlog.create({ id, type: 'task', title: `seed ${id}` });
}

describe('HandoverEngine.record', () => {
  it('creates the handover markdown file and inserts a SQLite row', () => {
    seedItem('T01-login-form');
    const engine = makeEngine();

    const res = engine.record({
      itemId: 'T01-login-form',
      title: 'Login Form',
      fromPersona: '+backend-developer',
      toPersona: '+qa-engineer',
      status: 'completed',
      completed: 'Implemented POST /auth/login',
      context: 'JWT cookie expiry hardcoded to 1h — confirm with security.',
      changedFiles: ['server/routes/auth.ts', 'tests/auth.test.ts'],
      watchOuts: ['Rate limiter not yet applied'],
      lastCommit: 'abc1234',
      nextStep: 'Run end-to-end login smoke tests',
    });

    expect(res.handoverId).toBeGreaterThan(0);
    expect(res.markdownPath).toMatch(/memory\/handover\.md$/);

    // markdown file exists and contains the block
    const md = readFileSync(join(workspaceRoot, '.kortext', 'memory', 'handover.md'), 'utf8');
    expect(md).toContain('# Handover Reports');
    expect(md).toContain('## Handover: T01-login-form — Login Form');
    expect(md).toContain('**Author:** +backend-developer');
    expect(md).toContain('**To:** +qa-engineer');
    expect(md).toContain('**Status:** Tamamlandı');
    expect(md).toContain('- server/routes/auth.ts');
    expect(md).toContain('- Rate limiter not yet applied');
    expect(md).toContain('- abc1234');
    expect(md).toContain('- Run end-to-end login smoke tests');

    // SQLite row mirrors the structured fields
    const row = repos.handovers.get(res.handoverId);
    expect(row).not.toBeNull();
    expect(row?.from_persona).toBe('+backend-developer');
    expect(row?.to_persona).toBe('+qa-engineer');
    expect(row?.context_payload).toMatchObject({
      status: 'completed',
      title: 'Login Form',
      completed: 'Implemented POST /auth/login',
      changed_files: ['server/routes/auth.ts', 'tests/auth.test.ts'],
      watch_outs: ['Rate limiter not yet applied'],
      last_commit: 'abc1234',
      next_step: 'Run end-to-end login smoke tests',
    });
    expect(row?.markdown_path).toMatch(/memory\/handover\.md$/);
  });

  it('renders correct Turkish status labels for blocked and partial', () => {
    seedItem('T02');
    seedItem('T03');
    const engine = makeEngine();
    engine.record({
      itemId: 'T02',
      title: 'X',
      fromPersona: '+backend-developer',
      toPersona: '+qa-engineer',
      status: 'blocked',
      completed: 'partial impl',
      context: 'ctx',
      nextStep: 'unblock me',
    });
    engine.record({
      itemId: 'T03',
      title: 'Y',
      fromPersona: '+backend-developer',
      toPersona: '+qa-engineer',
      status: 'partial',
      completed: 'half impl',
      context: 'ctx',
      nextStep: 'continue',
    });

    const md = readFileSync(join(workspaceRoot, '.kortext', 'memory', 'handover.md'), 'utf8');
    expect(md).toContain('**Status:** Bloklandı');
    expect(md).toContain('**Status:** Kısmen tamamlandı');
  });

  it('prepends new entries so the newest handover is at the top', () => {
    seedItem('T-FIRST');
    seedItem('T-SECOND');
    const engine = makeEngine();
    engine.record({
      itemId: 'T-FIRST',
      title: 'First',
      fromPersona: '+backend-developer',
      toPersona: '+qa-engineer',
      status: 'completed',
      completed: 'first',
      context: 'first-ctx',
      nextStep: 'next-first',
    });
    engine.record({
      itemId: 'T-SECOND',
      title: 'Second',
      fromPersona: '+backend-developer',
      toPersona: '+qa-engineer',
      status: 'completed',
      completed: 'second',
      context: 'second-ctx',
      nextStep: 'next-second',
    });

    const md = readFileSync(join(workspaceRoot, '.kortext', 'memory', 'handover.md'), 'utf8');
    const firstIdx = md.indexOf('T-FIRST');
    const secondIdx = md.indexOf('T-SECOND');
    expect(secondIdx).toBeGreaterThan(-1);
    expect(firstIdx).toBeGreaterThan(secondIdx); // second comes BEFORE first in the file
  });

  it('uses "- Yok" when changedFiles or watchOuts are empty', () => {
    seedItem('T-EMPTY');
    const engine = makeEngine();
    engine.record({
      itemId: 'T-EMPTY',
      title: 'Empty',
      fromPersona: '+backend-developer',
      toPersona: '+qa-engineer',
      status: 'completed',
      completed: 'done',
      context: 'ctx',
      nextStep: 'next',
    });
    const md = readFileSync(join(workspaceRoot, '.kortext', 'memory', 'handover.md'), 'utf8');
    // Both lists fall back to single "- Yok" bullet
    const yokCount = (md.match(/^- Yok$/gm) || []).length;
    expect(yokCount).toBeGreaterThanOrEqual(2); // changed files + watch-outs (+ lastCommit maybe)
  });

  it('throws when the from or to persona is unknown to the registry', () => {
    seedItem('T');
    const engine = makeEngine();
    expect(() =>
      engine.record({
        itemId: 'T',
        title: 't',
        fromPersona: '+ghost',
        toPersona: '+qa-engineer',
        status: 'completed',
        completed: 'x',
        context: 'x',
        nextStep: 'x',
      }),
    ).toThrow(/from.*ghost|unknown persona/i);

    expect(() =>
      engine.record({
        itemId: 'T',
        title: 't',
        fromPersona: '+backend-developer',
        toPersona: '+ghost',
        status: 'completed',
        completed: 'x',
        context: 'x',
        nextStep: 'x',
      }),
    ).toThrow(/to.*ghost|unknown persona/i);
  });

  it('makes an auto git commit when the git option is set', () => {
    seedItem('T-COMMIT');
    // Initialize repoRoot pointing at workspaceRoot — handover.md lives there.
    runFile('git', ['init', '--initial-branch=main', '--quiet'], { cwd: workspaceRoot });
    runFile('git', ['config', 'user.email', 't@kortext.local'], { cwd: workspaceRoot });
    runFile('git', ['config', 'user.name', 'Kortext Test'], { cwd: workspaceRoot });
    runFile('git', ['config', 'commit.gpgsign', 'false'], { cwd: workspaceRoot });
    writeFileSync(join(workspaceRoot, 'README.md'), '# init\n');
    runFile('git', ['add', 'README.md'], { cwd: workspaceRoot });
    runFile('git', ['commit', '-m', 'init', '--quiet'], { cwd: workspaceRoot });

    const engine = new HandoverEngine({
      repos,
      personas: loadPersonasFromDir(agentsDir),
      workspaceRoot,
      git: { repoRoot: workspaceRoot },
      now: () => new Date('2026-05-22T10:30:00Z'),
    });

    const res = engine.record({
      itemId: 'T-COMMIT',
      title: 'committed item',
      fromPersona: '+backend-developer',
      toPersona: '+qa-engineer',
      status: 'completed',
      completed: 'done',
      context: 'ctx',
      nextStep: 'next',
    });

    expect(res.commitSha).toBeTruthy();
    expect(res.commitSha).toMatch(/^[0-9a-f]{40}$/);
    const headMsg = runFile('git', ['log', '-1', '--pretty=%s'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    }).toString().trim();
    expect(headMsg).toBe('chore(kortext): handover T-COMMIT');
  });

  it('leaves commitSha null when the git option is not set', () => {
    seedItem('T-NOGIT');
    const engine = makeEngine();
    const res = engine.record({
      itemId: 'T-NOGIT',
      title: 't',
      fromPersona: '+backend-developer',
      toPersona: '+qa-engineer',
      status: 'completed',
      completed: 'done',
      context: 'ctx',
      nextStep: 'next',
    });
    expect(res.commitSha).toBeNull();
  });

  it('creates the parent memory/ directory if it does not exist', () => {
    // workspaceRoot exists but memory/ does not
    expect(existsSync(join(workspaceRoot, '.kortext', 'memory'))).toBe(false);

    seedItem('T');
    const engine = makeEngine();
    engine.record({
      itemId: 'T',
      title: 't',
      fromPersona: '+backend-developer',
      toPersona: '+qa-engineer',
      status: 'completed',
      completed: 'x',
      context: 'x',
      nextStep: 'x',
    });

    expect(existsSync(join(workspaceRoot, '.kortext', 'memory', 'handover.md'))).toBe(true);
  });
});
