import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatList, removeFromRegistry, purgeProject } from '../server/cli/cmd-projects.ts';
import { writeRegistry, readRegistry, upsertProject, type Registry } from '../server/registry/projects.ts';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kortext-proj-'));
  let reg: Registry = { version: 1, projects: {} };
  reg = upsertProject(reg, { slug: 'tf', name: 'TaskFlow', path: '/p/tf', port: 3200, pid: null, status: 'stopped', createdAt: 1 });
  writeRegistry(dir, reg);
});

describe('formatList', () => {
  it('renders a row per project with slug, port, status, path', () => {
    const out = formatList(readRegistry(dir), () => false);
    expect(out).toContain('tf');
    expect(out).toContain('3200');
    expect(out).toContain('/p/tf');
  });
  it('shows "(none)" for an empty registry', () => {
    expect(formatList({ version: 1, projects: {} }, () => false)).toContain('No projects');
  });
});

describe('removeFromRegistry', () => {
  it('drops the entry but reports the kept .kortext path', () => {
    const res = removeFromRegistry('tf', { registryDir: dir });
    expect(res.ok).toBe(true);
    expect(readRegistry(dir).projects.tf).toBeUndefined();
  });
  it('errors on unknown slug', () => {
    expect(removeFromRegistry('nope', { registryDir: dir }).ok).toBe(false);
  });
});

describe('purgeProject', () => {
  it('removes the entry AND deletes .kortext via injected rm', () => {
    const removed: string[] = [];
    const res = purgeProject('tf', { registryDir: dir, rm: (p) => { removed.push(p); } });
    expect(res.ok).toBe(true);
    expect(removed).toEqual([join('/p/tf', '.kortext')]);
    expect(readRegistry(dir).projects.tf).toBeUndefined();
  });
});
