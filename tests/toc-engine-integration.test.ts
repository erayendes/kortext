import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import { loadPersonasFromDir } from '../server/engine/persona-registry.ts';
import { HandoverEngine } from '../server/engine/handover.ts';
import { MarkdownSyncService } from '../server/services/markdown-sync.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

const personaMd = (handle: string) =>
  `# ${handle}\n\n- description: ${handle}.\n\n## identity\nbody\n`;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-engine-integration-'));
  mkdirSync(join(tmpRoot, 'agents'), { recursive: true });
  writeFileSync(join(tmpRoot, 'agents', 'a.md'), personaMd('a'));
  writeFileSync(join(tmpRoot, 'agents', 'b.md'), personaMd('b'));
  const bundle = openDb({ path: join(tmpRoot, 'engine.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('HandoverEngine auto-rotation', () => {
  it('rotates the live handover.md once the 5th entry lands', async () => {
    repos.backlog.create({ id: 'T01', type: 'task', title: 'a' });
    repos.backlog.create({ id: 'T02', type: 'task', title: 'b' });
    repos.backlog.create({ id: 'T03', type: 'task', title: 'c' });
    repos.backlog.create({ id: 'T04', type: 'task', title: 'd' });
    repos.backlog.create({ id: 'T05', type: 'task', title: 'e' });

    const engine = new HandoverEngine({
      repos,
      personas: loadPersonasFromDir(join(tmpRoot, 'agents')),
      workspaceRoot: tmpRoot,
      now: () => new Date('2026-05-22T10:30:00Z'),
    });

    for (const id of ['T01', 'T02', 'T03', 'T04', 'T05']) {
      engine.record({
        itemId: id,
        title: id,
        fromPersona: '+a',
        toPersona: '+b',
        status: 'completed',
        completed: 'x',
        context: 'x',
        nextStep: 'x',
      });
    }

    // Archive path uses the local-TZ rendering of the handover engine
    // (DD.MM.YY-HH:MM) re-parsed by the rotation service. Match the
    // pattern rather than a TZ-specific exact value.
    const { readdirSync } = await import('node:fs');
    const memoryDir = join(tmpRoot, '.kortext', 'memory');
    const archived = readdirSync(memoryDir).filter((f) =>
      /^handover-2026-05-22-\d{4}\.md$/.test(f),
    );
    expect(archived.length).toBe(1);
    const live = readFileSync(join(memoryDir, 'handover.md'), 'utf8');
    expect(live).not.toContain('## Handover:');
  });

  it('opt-out: rotation.disabled=true keeps all entries in the live file', () => {
    for (const id of ['T01', 'T02', 'T03', 'T04', 'T05', 'T06']) {
      repos.backlog.create({ id, type: 'task', title: id });
    }
    const engine = new HandoverEngine({
      repos,
      personas: loadPersonasFromDir(join(tmpRoot, 'agents')),
      workspaceRoot: tmpRoot,
      rotation: { disabled: true },
    });
    for (const id of ['T01', 'T02', 'T03', 'T04', 'T05', 'T06']) {
      engine.record({
        itemId: id,
        title: id,
        fromPersona: '+a',
        toPersona: '+b',
        status: 'completed',
        completed: 'x',
        context: 'x',
        nextStep: 'x',
      });
    }
    const live = readFileSync(
      join(tmpRoot, '.kortext', 'memory', 'handover.md'),
      'utf8',
    );
    // All 6 still there, no archive file.
    const headings = live.match(/^## Handover:/gm) ?? [];
    expect(headings.length).toBe(6);
  });
});

describe('MarkdownSyncService writeDecision auto-TOC', () => {
  it('updates the single-file decisions.md TOC when it exists and opts in', () => {
    // Seed the single-file decisions doc with a TOC heading.
    const singleFile = join(tmpRoot, '.kortext', 'memory', 'decisions.md');
    mkdirSync(join(tmpRoot, '.kortext', 'memory'), { recursive: true });
    writeFileSync(
      singleFile,
      '# ADR\n\n## İçindekiler\n\n---\n\n## ADR-001: Auth Stack: Auth0\nbody\n',
      'utf8',
    );

    const sync = new MarkdownSyncService(repos, { root: tmpRoot });
    sync.writeDecision({
      decision_id: 'ADR-001',
      title: 'Auth Stack: Auth0',
      body_md: '## Context\n',
    });

    const md = readFileSync(singleFile, 'utf8');
    expect(md).toContain('1. [ADR-001: Auth Stack: Auth0](#adr-001-auth-stack-auth0)');
  });

  it('is a no-op when the single-file decisions.md does not exist', () => {
    const sync = new MarkdownSyncService(repos, { root: tmpRoot });
    // Should not throw — just writes the per-file ADR.
    const res = sync.writeDecision({
      decision_id: 'ADR-002',
      title: 'X',
      body_md: '## Context\n',
    });
    expect(res.markdown_path).toContain('decisions/adr-002.md');
  });
});

describe('MarkdownSyncService writeLearned', () => {
  it('seeds learned.md with TOC + appends entry + updates TOC', () => {
    const sync = new MarkdownSyncService(repos, { root: tmpRoot });
    sync.writeLearned({
      title: 'auth refresh storm',
      body_md: '### Problem\nstuff\n',
      author: '+a',
      timestamp: new Date('2026-05-22T10:30:00Z'),
    });
    const learnedPath = join(tmpRoot, '.kortext', 'memory', 'learned.md');
    const md = readFileSync(learnedPath, 'utf8');
    expect(md).toContain('## İçindekiler');
    expect(md).toContain('## Öğrenim: auth refresh storm');
    expect(md).toContain('1. [Öğrenim: auth refresh storm]');
  });

  it('appends a second entry without losing the first', () => {
    const sync = new MarkdownSyncService(repos, { root: tmpRoot });
    sync.writeLearned({ title: 'first', body_md: 'a\n' });
    sync.writeLearned({ title: 'second', body_md: 'b\n' });
    const md = readFileSync(
      join(tmpRoot, '.kortext', 'memory', 'learned.md'),
      'utf8',
    );
    expect(md).toContain('## Öğrenim: first');
    expect(md).toContain('## Öğrenim: second');
    expect(md).toMatch(/1\. \[Öğrenim: first\]/);
    expect(md).toMatch(/2\. \[Öğrenim: second\]/);
  });
});
