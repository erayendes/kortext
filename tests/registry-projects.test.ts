import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  slugFor, allocatePort, readRegistry, writeRegistry,
  upsertProject, removeProject, getProject, listProjects,
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

afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });
