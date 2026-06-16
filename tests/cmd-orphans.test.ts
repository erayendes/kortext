import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sweepOrphans } from '../server/cli/cmd-orphans.ts';
import { writeRegistry, upsertProject, type Registry } from '../server/registry/projects.ts';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kortext-orphan-'));
  // One registered, running daemon on pid 100. Its pid is "owned".
  let reg: Registry = { version: 1, projects: {} };
  reg = upsertProject(reg, { slug: 'live', name: 'Live', path: '/p/live', port: 3200, pid: 100, status: 'running', createdAt: 1 });
  writeRegistry(dir, reg);
});

describe('sweepOrphans (TODO #10)', () => {
  it('kills listeners that no registered live daemon owns, spares the owned one', () => {
    // Ports report pids: 100 (registered/alive) + 777, 888 (orphans).
    const killed: number[] = [];
    const res = sweepOrphans({
      registryDir: dir,
      scan: () => [100, 777, 888],
      alive: () => true, // pid 100 is alive → owned
      kill: (pid) => { killed.push(pid); return true; },
    });
    expect(killed.sort()).toEqual([777, 888]);
    expect(res.killed.sort()).toEqual([777, 888]);
    expect(res.listeners).toBe(3);
  });

  it('treats a registered pid as orphan when it is no longer alive', () => {
    // pid 100 registered but dead → not owned → swept like any orphan.
    const killed: number[] = [];
    sweepOrphans({
      registryDir: dir,
      scan: () => [100, 200],
      alive: () => false,
      kill: (pid) => { killed.push(pid); return true; },
    });
    expect(killed.sort()).toEqual([100, 200]);
  });

  it('reports zero kills when the range is clear', () => {
    const res = sweepOrphans({ registryDir: dir, scan: () => [], kill: () => true });
    expect(res.killed).toEqual([]);
    expect(res.listeners).toBe(0);
  });
});
