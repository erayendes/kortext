import { describe, it, expect } from 'vitest';
import { bootstrapGit, type GitRunner } from '../server/cli/bootstrap-git.ts';

/** Fake git: records calls, simulates branch state. */
function fakeGit(opts: { isRepo: boolean; hasDevelopment?: boolean }) {
  const calls: string[][] = [];
  let isRepo = opts.isRepo;
  let hasDev = opts.hasDevelopment ?? false;
  const runner: GitRunner = (args) => {
    calls.push(args);
    if (args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') {
      if (!isRepo) throw new Error('not a git repository');
      return 'true';
    }
    if (args[0] === 'rev-parse' && args[1] === '--verify') {
      if (!hasDev) throw new Error('unknown revision');
      return 'abc123';
    }
    if (args[0] === 'init') { isRepo = true; return ''; }
    if (args[0] === 'branch') { hasDev = true; return ''; }
    return '';
  };
  return { runner, calls };
}

describe('bootstrapGit', () => {
  it('initializes a fresh repo: init -b main, add, commit, development branch', () => {
    const { runner, calls } = fakeGit({ isRepo: false });
    const res = bootstrapGit('/tmp/proj', runner);
    expect(res.ok).toBe(true);
    expect(res.created).toBe(true);
    expect(res.developmentEnsured).toBe(true);
    const flat = calls.map((c) => c.join(' '));
    expect(flat).toContain('init -b main');
    expect(flat.some((c) => c.startsWith('add'))).toBe(true);
    expect(flat.some((c) => c.startsWith('commit') || c.includes(' commit '))).toBe(true);
    expect(flat).toContain('branch development');
  });

  it('existing repo without development: only creates the branch, never commits', () => {
    const { runner, calls } = fakeGit({ isRepo: true, hasDevelopment: false });
    const res = bootstrapGit('/tmp/proj', runner);
    expect(res.created).toBe(false);
    expect(res.developmentEnsured).toBe(true);
    const flat = calls.map((c) => c.join(' '));
    expect(flat).toContain('branch development');
    expect(flat.some((c) => c.includes('commit'))).toBe(false);
    expect(flat.some((c) => c.startsWith('init'))).toBe(false);
  });

  it('existing repo with development: no-op (no commit, no branch create)', () => {
    const { runner, calls } = fakeGit({ isRepo: true, hasDevelopment: true });
    const res = bootstrapGit('/tmp/proj', runner);
    expect(res.created).toBe(false);
    expect(res.developmentEnsured).toBe(true);
    const flat = calls.map((c) => c.join(' '));
    expect(flat.some((c) => c.startsWith('branch'))).toBe(false);
    expect(flat.some((c) => c.includes('commit'))).toBe(false);
  });

  it('treats untrimmed --is-inside-work-tree output as a real repo', () => {
    const runner: GitRunner = (args) => {
      if (args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') return 'true\n';
      if (args[0] === 'rev-parse' && args[1] === '--verify') return 'refs/heads/development\n';
      return '';
    };
    const res = bootstrapGit('/tmp/proj', runner);
    expect(res.created).toBe(false);
    expect(res.developmentEnsured).toBe(true);
  });

  it('git missing / throws everywhere: soft-fails with a warning', () => {
    const runner: GitRunner = () => { throw new Error('command not found: git'); };
    const res = bootstrapGit('/tmp/proj', runner);
    expect(res.ok).toBe(false);
    expect(res.warning).toMatch(/git/i);
  });
});
