import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stopAll, pauseProject } from '../server/cli/cmd-lifecycle.ts';
import { writeRegistry, readRegistry, upsertProject } from '../server/registry/projects.ts';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kortext-life-'));
  let reg = { version: 1 as const, projects: {} };
  reg = upsertProject(reg, { slug: 'tf', name: 'T', path: '/p/tf', port: 3200, pid: 111, status: 'running', createdAt: 1 });
  reg = upsertProject(reg, { slug: 'ac', name: 'A', path: '/p/ac', port: 3201, pid: 222, status: 'running', createdAt: 1 });
  writeRegistry(dir, reg);
});

describe('stopAll', () => {
  it('kills every running daemon and marks them stopped', () => {
    const killed: number[] = [];
    const res = stopAll({ registryDir: dir, kill: (pid) => { killed.push(pid!); return true; } });
    expect(killed.sort()).toEqual([111, 222]);
    expect(res.stopped).toEqual(['ac', 'tf']);
    const reg = readRegistry(dir);
    expect(reg.projects.tf!.status).toBe('stopped');
    expect(reg.projects.tf!.pid).toBeNull();
  });
});

describe('pauseProject', () => {
  it('kills one daemon, marks it paused, leaves the other running', () => {
    const res = pauseProject('tf', { registryDir: dir, kill: () => true });
    expect(res.ok).toBe(true);
    const reg = readRegistry(dir);
    expect(reg.projects.tf!.status).toBe('paused');
    expect(reg.projects.ac!.status).toBe('running');
  });
  it('errors on unknown slug', () => {
    expect(pauseProject('nope', { registryDir: dir, kill: () => true })).toEqual({ ok: false, message: "No project 'nope'." });
  });
});
