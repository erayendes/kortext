import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../server/db/client.ts';
import type { Repositories } from '../server/db/repositories/index.ts';

/**
 * `personas` table — projection of `agents/*.md`. Tests pin the upsert
 * contract used at engine boot (idempotency, JSON column round-trip,
 * `updated_at` refresh).
 */

let tmpRoot: string;
let db: Database.Database;
let repos: Repositories;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kortext-personas-repo-'));
  const bundle = openDb({ path: join(tmpRoot, 'test.db') });
  db = bundle.db;
  repos = bundle.repositories;
});

afterEach(() => {
  db.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('PersonasRepository', () => {
  it('upserts a new persona and round-trips JSON capabilities', () => {
    const row = repos.personas.upsert({
      handle: '+backend-developer',
      purpose: 'Builds the API.',
      capabilities: ['api', 'db', 'auth'],
      when_to_use: 'When backend work lands.',
      model_default: 'claude',
      source_path: 'agents/backend-developer.md',
    });
    expect(row.handle).toBe('+backend-developer');
    expect(row.purpose).toBe('Builds the API.');
    expect(row.capabilities).toEqual(['api', 'db', 'auth']);
    expect(row.when_to_use).toBe('When backend work lands.');
    expect(row.model_default).toBe('claude');
    expect(row.source_path).toBe('agents/backend-developer.md');
    expect(row.updated_at).toBeGreaterThan(0);
  });

  it('list() returns rows sorted by handle', () => {
    repos.personas.upsert({
      handle: '+zeta',
      source_path: 'agents/zeta.md',
    });
    repos.personas.upsert({
      handle: '+alpha',
      source_path: 'agents/alpha.md',
    });
    const handles = repos.personas.list().map((p) => p.handle);
    expect(handles).toEqual(['+alpha', '+zeta']);
  });

  it('upsert is idempotent — second call updates in place', () => {
    repos.personas.upsert({
      handle: '+designer',
      purpose: 'old',
      source_path: 'agents/designer.md',
    });
    const after = repos.personas.upsert({
      handle: '+designer',
      purpose: 'new',
      capabilities: ['ui', 'ux'],
      source_path: 'agents/designer.md',
    });
    expect(after.purpose).toBe('new');
    expect(after.capabilities).toEqual(['ui', 'ux']);
    expect(repos.personas.list()).toHaveLength(1);
  });

  it('get() returns null for unknown handle', () => {
    expect(repos.personas.get('+nobody')).toBeNull();
  });

  it('defaults nullable fields to null and capabilities to []', () => {
    const row = repos.personas.upsert({
      handle: '+minimal',
      source_path: 'agents/minimal.md',
    });
    expect(row.purpose).toBeNull();
    expect(row.when_to_use).toBeNull();
    expect(row.model_default).toBeNull();
    expect(row.capabilities).toEqual([]);
  });

  it('deleteAll() wipes the table', () => {
    repos.personas.upsert({ handle: '+a', source_path: 'agents/a.md' });
    repos.personas.upsert({ handle: '+b', source_path: 'agents/b.md' });
    repos.personas.deleteAll();
    expect(repos.personas.list()).toEqual([]);
  });
});
