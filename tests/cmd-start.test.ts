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
});
