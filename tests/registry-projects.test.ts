import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  slugFor, allocatePort, readRegistry, writeRegistry,
  upsertProject, removeProject, getProject, listProjects, registerProject,
  type Registry,
} from '../server/registry/projects.ts';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'kortext-reg-')); });

describe('slugFor', () => {
  it('lowercases the code and slugifies', () => {
    expect(slugFor({ code: 'TF', name: 'TaskFlow', path: '/p' }, new Set())).toBe('tf');
  });
  it('falls back to name then basename', () => {
    expect(slugFor({ code: '', name: 'Acme CRM', path: '/p/acme' }, new Set())).toBe('acme-crm');
    expect(slugFor({ code: '', name: '', path: '/p/widget' }, new Set())).toBe('widget');
  });
  it('disambiguates collisions with a numeric suffix', () => {
    expect(slugFor({ code: 'TF', name: '', path: '/p' }, new Set(['tf']))).toBe('tf-2');
    expect(slugFor({ code: 'TF', name: '', path: '/p' }, new Set(['tf', 'tf-2']))).toBe('tf-3');
  });
});

describe('allocatePort', () => {
  it('returns BASE_PORT when nothing is claimed', () => {
    expect(allocatePort([])).toBe(3200);
  });
  it('returns the first free port above claimed ones', () => {
    expect(allocatePort([3200, 3201, 3203])).toBe(3202);
  });
  it('throws with actionable message when the entire port pool is exhausted', () => {
    // Claim all 100 ports (3200–3299).
    const allPorts = Array.from({ length: 100 }, (_, i) => 3200 + i);
    expect(() => allocatePort(allPorts)).toThrow(/kortext remove/);
    expect(() => allocatePort(allPorts)).toThrow(/kortext list/);
  });
});

describe('registry read/write round-trip', () => {
  it('reads an empty registry when the file is absent', () => {
    expect(readRegistry(dir)).toEqual({ version: 1, projects: {} });
  });
  it('writes then reads back an upserted project', () => {
    let reg = readRegistry(dir);
    reg = upsertProject(reg, { slug: 'tf', name: 'TaskFlow', path: '/p/tf', port: 3200, pid: null, status: 'stopped', createdAt: 1 });
    writeRegistry(dir, reg);
    const back = readRegistry(dir);
    expect(getProject(back, 'tf')?.port).toBe(3200);
    expect(listProjects(back).map((p) => p.slug)).toEqual(['tf']);
  });
  it('removeProject drops the entry', () => {
    let reg = upsertProject({ version: 1, projects: {} }, { slug: 'tf', name: 'T', path: '/p', port: 3200, pid: null, status: 'stopped', createdAt: 1 });
    reg = removeProject(reg, 'tf');
    expect(getProject(reg, 'tf')).toBeNull();
  });
});

describe('registerProject port selection', () => {
  it('honors an explicit, free port instead of auto-allocating', () => {
    const { entry } = registerProject(
      { version: 1, projects: {} },
      { code: 'TF', name: 'TaskFlow', path: '/p', now: 1, port: 3207 },
    );
    expect(entry.port).toBe(3207);
  });

  it('falls back to auto-allocation when the explicit port is already claimed', () => {
    let reg: Registry = { version: 1, projects: {} };
    reg = upsertProject(reg, { slug: 'a', name: 'A', path: '/a', port: 3200, pid: null, status: 'stopped', createdAt: 1 });
    const { entry } = registerProject(reg, { code: 'TF', name: 'TaskFlow', path: '/p', now: 1, port: 3200 });
    expect(entry.port).toBe(3201);
  });

  it('auto-allocates when no explicit port is given (existing behavior)', () => {
    const { entry } = registerProject({ version: 1, projects: {} }, { code: 'TF', name: 'TaskFlow', path: '/p', now: 1 });
    expect(entry.port).toBe(3200);
  });
});

afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });
