import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  executorChain,
  readProjectMeta,
  writeProjectMeta,
  type ProjectMeta,
} from '../server/blueprint/io.ts';

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kortext-exec-chain-'));
  path = join(dir, 'project.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeRaw(obj: Record<string, unknown>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2));
}

const baseMeta = {
  name: 'Demo',
  code: 'DMO',
  type: 'new',
  platforms: ['web'],
  createdAt: 1700000000000,
};

describe('readProjectMeta — executors priority list (UAT #10)', () => {
  it('parses an explicit executors list', () => {
    writeRaw({ ...baseMeta, executor: 'antigravity', executors: ['antigravity', 'claude', 'codex'] });
    const meta = readProjectMeta(path);
    expect(meta?.executors).toEqual(['antigravity', 'claude', 'codex']);
    expect(meta?.executor).toBe('antigravity');
  });

  it('drops invalid entries from the executors list', () => {
    writeRaw({ ...baseMeta, executor: 'claude', executors: ['claude', 'gemini', 'nope', 42] });
    const meta = readProjectMeta(path);
    // gemini is engine-supported but not an onboarding ExecutorChoice → dropped
    // by normalizeExecutor; non-strings/unknowns dropped too.
    expect(meta?.executors).toEqual(['claude']);
  });

  it('leaves executors undefined when absent (back-compat)', () => {
    writeRaw({ ...baseMeta, executor: 'codex' });
    const meta = readProjectMeta(path);
    expect(meta?.executors).toBeUndefined();
    expect(meta?.executor).toBe('codex');
  });

  it('round-trips an executors list through writeProjectMeta', () => {
    const meta: ProjectMeta = {
      name: 'Demo',
      code: 'DMO',
      type: 'new',
      platforms: ['web'],
      githubRepo: null,
      executor: 'antigravity',
      executors: ['antigravity', 'claude'],
      executorBinary: null,
      createdAt: 1700000000000,
    };
    writeProjectMeta(path, meta);
    const back = readProjectMeta(path);
    expect(back?.executors).toEqual(['antigravity', 'claude']);
  });
});

describe('executorChain', () => {
  it('returns the executors list when present', () => {
    const meta = readProjectMetaFrom({ ...baseMeta, executor: 'antigravity', executors: ['antigravity', 'claude'] });
    expect(executorChain(meta)).toEqual(['antigravity', 'claude']);
  });

  it('defaults to [executor] when the list is absent', () => {
    const meta = readProjectMetaFrom({ ...baseMeta, executor: 'codex' });
    expect(executorChain(meta)).toEqual(['codex']);
  });

  it('defaults to [executor] when the list is present but empty after validation', () => {
    const meta = readProjectMetaFrom({ ...baseMeta, executor: 'claude', executors: ['nope'] });
    expect(executorChain(meta)).toEqual(['claude']);
  });

  function readProjectMetaFrom(obj: Record<string, unknown>): ProjectMeta {
    writeRaw(obj);
    const meta = readProjectMeta(path);
    if (!meta) throw new Error('expected meta');
    return meta;
  }
});
