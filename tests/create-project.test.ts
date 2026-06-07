import { describe, it, expect, vi, type Mock } from 'vitest';
import { createProjectAndLaunch, type CreateProjectDeps } from '../server/blueprint/create-project.ts';
import type { ProjectMeta } from '../server/blueprint/io.ts';

const META: ProjectMeta = {
  name: 'Acme', code: 'ACME', type: 'new', platforms: ['web'],
  githubRepo: null, executor: 'claude', executorBinary: null, createdAt: 1,
};

// Each function dep becomes a Mock so tests can read `.mock.invocationCallOrder`
// while still satisfying CreateProjectDeps when passed to the module.
type MockedDeps = {
  [K in keyof CreateProjectDeps]: CreateProjectDeps[K] extends (...a: infer A) => infer R
    ? Mock<(...a: A) => R>
    : CreateProjectDeps[K];
};

function deps(over: Partial<MockedDeps> = {}): MockedDeps {
  const base: MockedDeps = {
    packageRoot: '/pkg',
    init: vi.fn<CreateProjectDeps['init']>(() => ({ ok: true })),
    bootstrapGit: vi.fn<CreateProjectDeps['bootstrapGit']>(() => ({ ok: true })),
    startProject: vi.fn<CreateProjectDeps['startProject']>(() => ({
      ok: true, url: 'http://localhost:3201/', slug: 'acme', port: 3201,
    })),
    writeBlueprint: vi.fn<CreateProjectDeps['writeBlueprint']>(),
    writeProjectMeta: vi.fn<CreateProjectDeps['writeProjectMeta']>(),
  };
  return { ...base, ...over };
}

describe('createProjectAndLaunch', () => {
  it('scaffolds, git-bootstraps, writes BRD+meta, spawns daemon, returns handoffUrl', () => {
    const d = deps();
    const res = createProjectAndLaunch({ projectDir: '/proj', meta: META, blueprintBody: '# BRD' }, d);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.handoffUrl).toBe('http://localhost:3201/');
    expect(d.init).toHaveBeenCalledWith('/proj');
    expect(d.bootstrapGit).toHaveBeenCalledWith('/proj');
    expect(d.writeBlueprint).toHaveBeenCalled();
    expect(d.writeProjectMeta).toHaveBeenCalled();
    const initOrder = d.init.mock.invocationCallOrder[0]!;
    const writeOrder = d.writeBlueprint.mock.invocationCallOrder[0]!;
    const spawnOrder = d.startProject.mock.invocationCallOrder[0]!;
    expect(initOrder).toBeLessThan(writeOrder);
    expect(writeOrder).toBeLessThan(spawnOrder);
  });

  it('fails when scaffold fails (no spawn attempted)', () => {
    const d = deps({ init: vi.fn<CreateProjectDeps['init']>(() => ({ ok: false, errorMessage: 'permission denied' })) });
    const res = createProjectAndLaunch({ projectDir: '/proj', meta: META, blueprintBody: '# BRD' }, d);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toMatch(/permission denied/);
    expect(d.startProject).not.toHaveBeenCalled();
  });

  it('passes git warning through but still launches', () => {
    const d = deps({ bootstrapGit: vi.fn<CreateProjectDeps['bootstrapGit']>(() => ({ ok: false, warning: 'git bootstrap failed: nope' })) });
    const res = createProjectAndLaunch({ projectDir: '/proj', meta: META, blueprintBody: '# BRD' }, d);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.gitWarning).toMatch(/git bootstrap failed/);
    expect(d.startProject).toHaveBeenCalled();
  });

  it('fails when daemon spawn fails', () => {
    const d = deps({ startProject: vi.fn<CreateProjectDeps['startProject']>(() => ({ ok: false, message: 'spawn failed' })) });
    const res = createProjectAndLaunch({ projectDir: '/proj', meta: META, blueprintBody: '# BRD' }, d);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toMatch(/spawn failed/);
  });
});
