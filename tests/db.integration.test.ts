import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';
import type Database from 'better-sqlite3';
import { MarkdownSyncService } from '../server/services/markdown-sync.ts';

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;
let schemaVersion: number;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-test-'));
  const bundle = openDb({ path: join(tmpRoot, 'test.db') });
  db = bundle.db;
  repos = bundle.repositories;
  schemaVersion = bundle.schemaVersion;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('migrations', () => {
  it('applies the initial schema and records its version', () => {
    expect(schemaVersion).toBeGreaterThan(0);
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'audit_log',
        'backlog_items',
        'contexts',
        'decisions_index',
        'handovers',
        'locks',
        'notifications_sent',
        'pending_questions',
        'personas',
        'reports_index',
        'run_steps',
        'runs',
        'runtime_artifacts',
        'schema_migrations',
        'secrets_scan_results',
        'sessions',
        'workflow_steps',
      ]),
    );
  });

  it('records migration 004 (workflow / persona index) in schema_migrations', () => {
    const row = db
      .prepare('SELECT id, name FROM schema_migrations WHERE id = 4')
      .get() as { id: number; name: string } | undefined;
    expect(row).toBeDefined();
    expect(row?.name).toMatch(/workflow_persona_index/);
    expect(schemaVersion).toBeGreaterThanOrEqual(4);
  });

  it('is idempotent when re-opened', () => {
    db.close();
    const reopened = openDb({ path: join(tmpRoot, 'test.db') });
    expect(reopened.schemaVersion).toBe(schemaVersion);
    reopened.db.close();
  });
});

describe('backlog repository', () => {
  it('inserts, lists, transitions, and filters items', () => {
    repos.backlog.create({
      id: 'E01',
      type: 'epic',
      title: 'Dashboard',
      status: 'in_progress',
      owner: '+frontend-engineer',
      parent_id: null,
      version: 'v3.0.0',
      frontmatter: { priority: 'P1' },
      body_md: '# epic',
    });
    repos.backlog.create({
      id: 'T01',
      type: 'task',
      title: 'Build login',
      status: 'to_do',
      owner: '+backend-engineer',
      parent_id: 'E01',
      version: null,
      frontmatter: {},
      body_md: '# task',
    });

    const tasks = repos.backlog.list({ type: 'task' });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.parent_id).toBe('E01');

    const t01 = repos.backlog.transitionStatus('T01', 'in_progress');
    expect(t01.status).toBe('in_progress');
    expect(t01.updated_at).toBeGreaterThanOrEqual(t01.created_at);

    const epic = repos.backlog.get('E01');
    expect(epic?.frontmatter).toEqual({ priority: 'P1' });
  });

  it('rejects invalid status via CHECK constraint', () => {
    expect(() =>
      db.prepare(
        "INSERT INTO backlog_items (id,type,title,status,frontmatter,body_md,created_at,updated_at) VALUES ('X1','task','t','bogus','{}','',1,1)",
      ).run(),
    ).toThrow(/CHECK constraint failed/);
  });
});

describe('locks repository', () => {
  it('returns null on duplicate acquire and re-acquires after release', () => {
    const first = repos.locks.acquire({
      resource: '/path/to/file',
      holder: '+a',
      reason: null,
      expires_at: null,
    });
    expect(first).not.toBeNull();

    const second = repos.locks.acquire({
      resource: '/path/to/file',
      holder: '+b',
      reason: null,
      expires_at: null,
    });
    expect(second).toBeNull();

    expect(repos.locks.release('/path/to/file', '+a')).toBe(true);

    const third = repos.locks.acquire({
      resource: '/path/to/file',
      holder: '+b',
      reason: null,
      expires_at: null,
    });
    expect(third).not.toBeNull();
  });

  it('cleans up expired locks', () => {
    const now = Date.now();
    repos.locks.acquire({
      resource: 'x',
      holder: '+a',
      reason: null,
      expires_at: now - 1_000,
    });
    repos.locks.acquire({
      resource: 'y',
      holder: '+a',
      reason: null,
      expires_at: now + 60_000,
    });
    const removed = repos.locks.cleanExpired(now);
    expect(removed).toBe(1);
    expect(repos.locks.list().map((l) => l.resource)).toEqual(['y']);
  });
});

describe('runs + run_steps + pending_questions', () => {
  it('tracks lifecycle and answers questions', () => {
    const run = repos.runs.createRun({
      workflow_id: 'new-project-analysis',
      item_id: null,
      status: 'queued',
      worktree_path: null,
      triggered_by: 'user',
    });
    expect(run.status).toBe('queued');

    const running = repos.runs.transitionRun(run.id, 'running');
    expect(running.started_at).not.toBeNull();
    expect(running.ended_at).toBeNull();

    const step = repos.runs.addStep({
      run_id: run.id,
      step_index: 0,
      step_name: 'analyze',
      persona: '+analyst',
      status: 'pending',
    });
    repos.runs.transitionStep(step.id, 'running');
    repos.runs.transitionStep(step.id, 'succeeded', { output_summary: 'ok' });

    const q = repos.pendingQuestions.create({
      run_id: run.id,
      step_id: step.id,
      question: 'Approve to proceed?',
      choices: ['yes', 'no'],
    });
    const answered = repos.pendingQuestions.answer(q.id, 'yes', '+operation-manager');
    expect(answered.status).toBe('answered');
    expect(answered.answer).toBe('yes');
    expect(() => repos.pendingQuestions.answer(q.id, 'yes', 'x')).toThrow();
  });

  it('cascades step deletion when run is deleted', () => {
    const run = repos.runs.createRun({
      workflow_id: 'wf',
      item_id: null,
      status: 'queued',
      worktree_path: null,
      triggered_by: 'system',
    });
    repos.runs.addStep({
      run_id: run.id,
      step_index: 0,
      step_name: 'a',
      persona: null,
      status: 'pending',
    });
    db.prepare('DELETE FROM runs WHERE id = ?').run(run.id);
    expect(repos.runs.listSteps(run.id)).toEqual([]);
  });
});

describe('notifications dedup', () => {
  it('returns null on duplicate (channel, event_key)', () => {
    const first = repos.notifications.record({
      channel: 'slack',
      event_key: 'run:42:started',
      payload: { run_id: 42 },
      status: 'sent',
      error_message: null,
    });
    expect(first).not.toBeNull();
    const dup = repos.notifications.record({
      channel: 'slack',
      event_key: 'run:42:started',
      payload: { run_id: 42 },
      status: 'sent',
      error_message: null,
    });
    expect(dup).toBeNull();
  });
});

describe('audit log filtering', () => {
  it('filters by actor, action, and since', () => {
    const t0 = Date.now();
    repos.auditLog.append({
      actor: '+a',
      action: 'x.created',
      resource_type: 'thing',
      resource_id: '1',
      payload: {},
    });
    repos.auditLog.append({
      actor: '+b',
      action: 'x.updated',
      resource_type: 'thing',
      resource_id: '1',
      payload: {},
    });
    expect(repos.auditLog.list({ actor: '+a' })).toHaveLength(1);
    expect(repos.auditLog.list({ action: 'x.updated' })).toHaveLength(1);
    expect(repos.auditLog.list({ since: t0 - 1 })).toHaveLength(2);
  });
});

describe('markdown sync', () => {
  it('writes ADR markdown and indexes it', () => {
    const sync = new MarkdownSyncService(repos, { root: tmpRoot });
    const written = sync.writeDecision({
      decision_id: 'ADR-001',
      title: 'Use SQLite',
      status: 'accepted',
      body_md: '## Context\nSome context.\n',
      tags: ['storage'],
    });
    expect(written.markdown_path).toContain('.kortext/memory/decisions');
    const indexed = repos.decisions.get('ADR-001');
    expect(indexed?.status).toBe('accepted');
    expect(indexed?.tags).toEqual(['storage']);

    const content = sync.readArtifact(written.markdown_path);
    expect(content).toContain('decision_id: ADR-001');
    expect(content).toContain('## Context');
  });

  it('writes handover markdown and links the row', () => {
    const sync = new MarkdownSyncService(repos, { root: tmpRoot });
    repos.backlog.create({
      id: 'T99',
      type: 'task',
      title: 'x',
      status: 'in_progress',
      owner: '+a',
      parent_id: null,
      version: null,
      frontmatter: {},
      body_md: '',
    });
    const { handoverId, markdown_path } = sync.writeHandover({
      item_id: 'T99',
      from_persona: '+a',
      to_persona: '+b',
      reason: 'shift',
      context: { progress: 0.4 },
      body_md: '# handover\nnotes',
    });
    const row = repos.handovers.get(handoverId);
    expect(row?.markdown_path).toBe(markdown_path);
    expect(row?.context_payload).toEqual({ progress: 0.4 });
    expect(sync.readArtifact(markdown_path)).toContain('from: +a');
  });
});
