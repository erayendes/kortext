import { describe, it, expect } from 'vitest';
import { resolveStartTarget } from '../server/cli/cmd-start.ts';
import type { Registry } from '../server/registry/projects.ts';

const reg: Registry = {
  version: 1,
  projects: { tf: { slug: 'tf', name: 'TaskFlow', path: '/p/tf', port: 3200, pid: null, status: 'stopped', createdAt: 1 } },
};

describe('resolveStartTarget', () => {
  it('matches a registered slug → existing', () => {
    expect(resolveStartTarget(reg, 'tf', '/cwd', () => true)).toEqual({ kind: 'existing', slug: 'tf' });
  });
  it('an existing path that is registered → existing', () => {
    expect(resolveStartTarget(reg, '/p/tf', '/cwd', () => true)).toEqual({ kind: 'existing', slug: 'tf' });
  });
  it('a new existing path → register', () => {
    expect(resolveStartTarget(reg, '/p/new', '/cwd', () => true)).toEqual({ kind: 'new-path', path: '/p/new' });
  });
  it('no arg, cwd has .kortext → register cwd', () => {
    expect(resolveStartTarget(reg, undefined, '/cwd', (p) => p.endsWith('.kortext'))).toEqual({ kind: 'new-path', path: '/cwd' });
  });
  it('no arg, empty registry, cwd has no .kortext → onboard hint', () => {
    expect(resolveStartTarget({ version: 1, projects: {} }, undefined, '/cwd', () => false)).toEqual({ kind: 'onboard' });
  });
  it('no arg, empty registry, cwd has no .kortext → onboard (wizard trigger)', () => {
    const reg = { version: 1, projects: {} } as any;
    const target = resolveStartTarget(reg, undefined, '/tmp/empty', () => false);
    expect(target.kind).toBe('onboard');
  });
  it('no arg, populated registry, cwd not a project → list', () => {
    expect(resolveStartTarget(reg, undefined, '/cwd', () => false)).toEqual({ kind: 'list' });
  });
  it('unknown slug (no such path) → not-found', () => {
    expect(resolveStartTarget(reg, 'nope', '/cwd', () => false)).toEqual({ kind: 'not-found', arg: 'nope' });
  });
  it('refuses to project-ify the kortext package dir when run there (bare start)', () => {
    expect(
      resolveStartTarget({ version: 1, projects: {} }, undefined, '/install/kortext', (p) => p.endsWith('.kortext'), () => true),
    ).toEqual({ kind: 'self' });
  });
  it('refuses an explicit path that is the kortext package dir', () => {
    expect(resolveStartTarget(reg, '/install/kortext', '/cwd', () => true, () => true)).toEqual({ kind: 'self' });
  });

  // The home dir's `.kortext` IS the global registry dir, not a project. Running
  // bare `kortext start` from home must NOT scaffold home as a project named
  // after the home folder (UAT 2026-06-08 #4). It should onboard / list instead.
  describe('home directory is never a project (its .kortext is the registry)', () => {
    const HOME = '/Users/x';
    const REGISTRY = '/Users/x/.kortext';
    // cwd=home and home/.kortext exists — but it's the registry, not a project.
    const existsHomeKortext = (p: string) => p === '/Users/x/.kortext';

    it('bare start from home, empty registry → onboard (wizard), not new-path', () => {
      const target = resolveStartTarget(
        { version: 1, projects: {} }, undefined, HOME, existsHomeKortext, undefined, REGISTRY,
      );
      expect(target).toEqual({ kind: 'onboard' });
    });

    it('bare start from home, populated registry → list, not new-path', () => {
      const target = resolveStartTarget(reg, undefined, HOME, existsHomeKortext, undefined, REGISTRY);
      expect(target).toEqual({ kind: 'list' });
    });

    it('explicit `kortext start <home>` is not a project either → onboard', () => {
      const target = resolveStartTarget(
        { version: 1, projects: {} }, HOME, '/anything', () => true, undefined, REGISTRY,
      );
      expect(target).toEqual({ kind: 'onboard' });
    });

    it('a real sibling project dir still registers (guard is scoped to home only)', () => {
      const target = resolveStartTarget(
        { version: 1, projects: {} }, undefined, '/Users/x/myproject', () => true, undefined, REGISTRY,
      );
      expect(target).toEqual({ kind: 'new-path', path: '/Users/x/myproject' });
    });
  });
});
