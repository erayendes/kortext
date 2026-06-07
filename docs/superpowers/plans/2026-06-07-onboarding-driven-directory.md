# Onboarding-Driven Directory + Auto-Git Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user run bare `kortext start` anywhere, pick the project directory inside the onboarding wizard, and have Kortext scaffold + git-bootstrap that folder, spawn the real per-project daemon there, hand the browser off, and auto-start analysis — with zero manual `cd`/`git` steps.

**Architecture:** A `kortext start` with no project launches an ephemeral **bootstrap wizard daemon** (the normal daemon, cwd = `~/.kortext/bootstrap/`, env `KORTEXT_BOOTSTRAP=1`, never registered). On onboarding submit it scaffolds the chosen dir, bootstraps git, writes BRD+meta there, spawns the **real** project daemon via `startProject`, and returns a `handoffUrl`. The browser redirects to the real daemon, which on boot runs `autoStartPendingAnalysis` (approved blueprint + no prior run → trigger analysis).

**Tech Stack:** TypeScript (ESM, `.ts` imports), Node `child_process`/`fs`, Express routes, React (Vite) frontend, Vitest. Git via `execFileSync` mirroring `GitMerger`.

**Spec:** `docs/superpowers/specs/2026-06-07-onboarding-driven-directory-design.md`

---

## File Structure

| File | Responsibility | New/Modify |
|------|----------------|------------|
| `server/cli/bootstrap-git.ts` | `bootstrapGit(dir)` — init+commit+`development` for new repos; ensure `development` for existing; soft-fail when git missing | Create |
| `server/blueprint/create-project.ts` | `createProjectAndLaunch()` — scaffold + git + write BRD/meta + `startProject` → `handoffUrl` | Create |
| `server/cli/cmd-bootstrap.ts` | `launchBootstrapWizard()` — init scratch home + spawn ephemeral wizard daemon (unregistered) | Create |
| `server/orchestrator/auto-start-analysis.ts` | `autoStartPendingAnalysis()` — trigger analysis once on boot if approved + no prior run | Create |
| `server/routes/blueprint.ts` | bootstrap branch: delegate to `createProjectAndLaunch`, return `handoffUrl` | Modify |
| `server/index.ts` | extract `triggerAnalysis(workflowId)`; call `autoStartPendingAnalysis` at boot; pass `bootstrap` + `createProject` deps to `blueprintRouter` | Modify |
| `src/lib/api-types.ts` | add `handoffUrl?: string` to `BlueprintSubmitResponse` | Modify |
| `src/components/OnboardingScreen.tsx` | on `handoffUrl` → "Projen hazırlanıyor…" + `window.location.href` redirect | Modify |
| `bin/kortext.ts` | `start`: `onboard` action → `launchBootstrapWizard`; `--new` flag forces wizard | Modify |

---

## Task 1: `bootstrapGit` helper

**Files:**
- Create: `server/cli/bootstrap-git.ts`
- Test: `tests/bootstrap-git.test.ts`

**Contract:**
```ts
export type GitRunner = (args: string[], cwd: string) => string;
export type BootstrapGitResult = {
  ok: boolean;          // false only when git is unusable
  created: boolean;     // true when we created a fresh repo
  developmentEnsured: boolean; // true when `development` now exists
  warning?: string;     // human-readable soft-fail reason
};
export function bootstrapGit(dir: string, runner?: GitRunner): BootstrapGitResult;
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/bootstrap-git.test.ts
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
    expect(flat.some((c) => c.startsWith('commit'))).toBe(true);
    expect(flat).toContain('branch development');
  });

  it('existing repo without development: only creates the branch, never commits', () => {
    const { runner, calls } = fakeGit({ isRepo: true, hasDevelopment: false });
    const res = bootstrapGit('/tmp/proj', runner);
    expect(res.created).toBe(false);
    expect(res.developmentEnsured).toBe(true);
    const flat = calls.map((c) => c.join(' '));
    expect(flat).toContain('branch development');
    expect(flat.some((c) => c.startsWith('commit'))).toBe(false);
    expect(flat.some((c) => c.startsWith('init'))).toBe(false);
  });

  it('existing repo with development: no-op (no commit, no branch create)', () => {
    const { runner, calls } = fakeGit({ isRepo: true, hasDevelopment: true });
    const res = bootstrapGit('/tmp/proj', runner);
    expect(res.created).toBe(false);
    expect(res.developmentEnsured).toBe(true);
    const flat = calls.map((c) => c.join(' '));
    expect(flat.some((c) => c.startsWith('branch'))).toBe(false);
    expect(flat.some((c) => c.startsWith('commit'))).toBe(false);
  });

  it('git missing / throws everywhere: soft-fails with a warning', () => {
    const runner: GitRunner = () => { throw new Error('command not found: git'); };
    const res = bootstrapGit('/tmp/proj', runner);
    expect(res.ok).toBe(false);
    expect(res.warning).toMatch(/git/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/bootstrap-git.test.ts`
Expected: FAIL — "Cannot find module '../server/cli/bootstrap-git.ts'".

- [ ] **Step 3: Implement `bootstrap-git.ts`**

```ts
// server/cli/bootstrap-git.ts
import { execFileSync } from 'node:child_process';

export type GitRunner = (args: string[], cwd: string) => string;

export type BootstrapGitResult = {
  ok: boolean;
  created: boolean;
  developmentEnsured: boolean;
  warning?: string;
};

const defaultRunner: GitRunner = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function isInsideRepo(run: GitRunner, dir: string): boolean {
  try {
    return run(['rev-parse', '--is-inside-work-tree'], dir).trim() === 'true';
  } catch {
    return false;
  }
}

function hasBranch(run: GitRunner, dir: string, name: string): boolean {
  try {
    run(['rev-parse', '--verify', name], dir);
    return true;
  } catch {
    return false;
  }
}

/**
 * Make `dir` build-ready: a git repo with a `development` branch.
 * - Fresh dir → `git init -b main` + add + commit + `development`.
 * - Existing repo → only ensure `development` exists; never touch the working tree.
 * - git unusable → soft-fail (project creation continues without git).
 */
export function bootstrapGit(dir: string, runner: GitRunner = defaultRunner): BootstrapGitResult {
  try {
    const existed = isInsideRepo(runner, dir);
    if (!existed) {
      runner(['init', '-b', 'main'], dir);
      runner(['add', '-A'], dir);
      // -c flags avoid failing on machines without a configured git identity.
      runner(
        ['-c', 'user.email=kortext@localhost', '-c', 'user.name=Kortext',
         'commit', '-m', 'kortext scaffold', '--allow-empty'],
        dir,
      );
    }
    let developmentEnsured = hasBranch(runner, dir, 'development');
    if (!developmentEnsured) {
      runner(['branch', 'development'], dir);
      developmentEnsured = true;
    }
    return { ok: true, created: !existed, developmentEnsured };
  } catch (err) {
    return {
      ok: false,
      created: false,
      developmentEnsured: false,
      warning: `git bootstrap failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/bootstrap-git.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/cli/bootstrap-git.ts tests/bootstrap-git.test.ts
git commit -m "feat(cli): bootstrapGit — init+development for new repos, ensure-only for existing"
```

---

## Task 2: `createProjectAndLaunch` module

**Files:**
- Create: `server/blueprint/create-project.ts`
- Test: `tests/create-project.test.ts`

**Contract:**
```ts
export type CreateProjectInput = {
  projectDir: string;
  meta: ProjectMeta;       // from server/blueprint/io.ts
  blueprintBody: string;
};
export type CreateProjectDeps = {
  packageRoot: string;
  init: (dir: string) => { ok: boolean; errorMessage?: string };
  bootstrapGit: (dir: string) => { ok: boolean; warning?: string };
  startProject: (dir: string, deps: { packageRoot: string; cwd: string }) =>
    | { ok: true; url: string; slug: string; port: number }
    | { ok: false; message: string };
  writeBlueprint: (path: string, input: { blueprintBody: string }) => void;
  writeProjectMeta: (path: string, meta: ProjectMeta) => void;
};
export type CreateProjectResult =
  | { ok: true; handoffUrl: string; projectDir: string; gitWarning?: string }
  | { ok: false; message: string };
export function createProjectAndLaunch(
  input: CreateProjectInput, deps: CreateProjectDeps,
): CreateProjectResult;
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/create-project.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createProjectAndLaunch } from '../server/blueprint/create-project.ts';
import type { ProjectMeta } from '../server/blueprint/io.ts';

const META: ProjectMeta = {
  name: 'Acme', code: 'ACME', type: 'new', platforms: ['web'],
  githubRepo: null, executor: 'claude', executorBinary: null, createdAt: 1,
};

function deps(over: Partial<Parameters<typeof createProjectAndLaunch>[1]> = {}) {
  return {
    packageRoot: '/pkg',
    init: vi.fn(() => ({ ok: true })),
    bootstrapGit: vi.fn(() => ({ ok: true })),
    startProject: vi.fn(() => ({ ok: true, url: 'http://localhost:3201/', slug: 'acme', port: 3201 })),
    writeBlueprint: vi.fn(),
    writeProjectMeta: vi.fn(),
    ...over,
  };
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
    // ordering: scaffold before write before spawn
    const initOrder = d.init.mock.invocationCallOrder[0];
    const writeOrder = d.writeBlueprint.mock.invocationCallOrder[0];
    const spawnOrder = d.startProject.mock.invocationCallOrder[0];
    expect(initOrder).toBeLessThan(writeOrder);
    expect(writeOrder).toBeLessThan(spawnOrder);
  });

  it('fails when scaffold fails (no spawn attempted)', () => {
    const d = deps({ init: vi.fn(() => ({ ok: false, errorMessage: 'permission denied' })) });
    const res = createProjectAndLaunch({ projectDir: '/proj', meta: META, blueprintBody: '# BRD' }, d);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toMatch(/permission denied/);
    expect(d.startProject).not.toHaveBeenCalled();
  });

  it('passes git warning through but still launches', () => {
    const d = deps({ bootstrapGit: vi.fn(() => ({ ok: false, warning: 'git bootstrap failed: nope' })) });
    const res = createProjectAndLaunch({ projectDir: '/proj', meta: META, blueprintBody: '# BRD' }, d);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.gitWarning).toMatch(/git bootstrap failed/);
    expect(d.startProject).toHaveBeenCalled();
  });

  it('fails when daemon spawn fails', () => {
    const d = deps({ startProject: vi.fn(() => ({ ok: false, message: 'spawn failed' })) });
    const res = createProjectAndLaunch({ projectDir: '/proj', meta: META, blueprintBody: '# BRD' }, d);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toMatch(/spawn failed/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/create-project.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `create-project.ts`**

```ts
// server/blueprint/create-project.ts
import { resolveBlueprintPaths, type ProjectMeta } from './io.ts';

export type CreateProjectInput = {
  projectDir: string;
  meta: ProjectMeta;
  blueprintBody: string;
};

export type CreateProjectDeps = {
  packageRoot: string;
  init: (dir: string) => { ok: boolean; errorMessage?: string };
  bootstrapGit: (dir: string) => { ok: boolean; warning?: string };
  startProject: (
    dir: string,
    deps: { packageRoot: string; cwd: string },
  ) =>
    | { ok: true; url: string; slug: string; port: number }
    | { ok: false; message: string };
  writeBlueprint: (path: string, input: { blueprintBody: string }) => void;
  writeProjectMeta: (path: string, meta: ProjectMeta) => void;
};

export type CreateProjectResult =
  | { ok: true; handoffUrl: string; projectDir: string; gitWarning?: string }
  | { ok: false; message: string };

/**
 * Materialize a brand-new project in `projectDir` and launch its own daemon.
 * Order matters: scaffold (.kortext must exist) → git → write BRD+meta →
 * spawn daemon. The spawned daemon auto-starts analysis on boot
 * (see autoStartPendingAnalysis), so no trigger happens here.
 */
export function createProjectAndLaunch(
  input: CreateProjectInput,
  deps: CreateProjectDeps,
): CreateProjectResult {
  const { projectDir, meta, blueprintBody } = input;

  const scaffold = deps.init(projectDir);
  if (!scaffold.ok) {
    return { ok: false, message: scaffold.errorMessage ?? 'scaffold failed' };
  }

  const git = deps.bootstrapGit(projectDir);
  const gitWarning = git.ok ? undefined : git.warning;

  const paths = resolveBlueprintPaths(projectDir);
  deps.writeBlueprint(paths.blueprintPath, { blueprintBody });
  deps.writeProjectMeta(paths.projectJsonPath, meta);

  const launched = deps.startProject(projectDir, {
    packageRoot: deps.packageRoot,
    cwd: projectDir,
  });
  if (!launched.ok) {
    return { ok: false, message: launched.message };
  }

  return { ok: true, handoffUrl: launched.url, projectDir, gitWarning };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/create-project.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/blueprint/create-project.ts tests/create-project.test.ts
git commit -m "feat(blueprint): createProjectAndLaunch — scaffold+git+write+spawn → handoffUrl"
```

---

## Task 3: Blueprint route bootstrap branch + `handoffUrl`

**Files:**
- Modify: `server/routes/blueprint.ts`
- Test: `tests/blueprint-route.test.ts` (add cases)

**Dep additions to `blueprintRouter`:**
```ts
export type BlueprintRouterDeps = {
  workspaceRoot: string;
  onApproved?: (workflowId: string) => void;
  bootstrap?: boolean;  // NEW: this daemon is the ephemeral wizard
  createProject?: (input: {       // NEW: injected create-and-launch
    projectDir: string; meta: ProjectMeta; blueprintBody: string;
  }) => { ok: true; handoffUrl: string; projectDir: string; gitWarning?: string }
     | { ok: false; message: string };
};
```

- [ ] **Step 1: Write the failing test (bootstrap branch returns handoffUrl)**

```ts
// tests/blueprint-route.test.ts — ADD inside the existing describe
import express from 'express';
import request from 'supertest';
import { blueprintRouter } from '../server/routes/blueprint.ts';
// (reuse existing imports/tmpdir helpers in this file)

it('bootstrap mode: delegates to createProject and returns handoffUrl', async () => {
  const calls: any[] = [];
  const app = express();
  app.use(express.json());
  app.use('/api', blueprintRouter({
    workspaceRoot: '/tmp/bootstrap-home',
    bootstrap: true,
    createProject: (input) => {
      calls.push(input);
      return { ok: true, handoffUrl: 'http://localhost:3201/', projectDir: input.projectDir };
    },
  }));

  const res = await request(app).post('/api/blueprint').send({
    projectName: 'Acme', projectCode: 'ACME', projectType: 'new',
    platforms: ['web'], blueprintBody: '# BRD\n'.padEnd(60, 'x'),
    executor: 'claude', executorBinary: null, projectDir: '/tmp/acme',
  });

  expect(res.status).toBe(201);
  expect(res.body.handoffUrl).toBe('http://localhost:3201/');
  expect(calls).toHaveLength(1);
  expect(calls[0].projectDir).toBe('/tmp/acme');
  expect(calls[0].meta.code).toBe('ACME');
});

it('bootstrap mode: 422 when projectDir is missing', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', blueprintRouter({
    workspaceRoot: '/tmp/bootstrap-home', bootstrap: true,
    createProject: () => ({ ok: true, handoffUrl: 'x', projectDir: 'x' }),
  }));
  const res = await request(app).post('/api/blueprint').send({
    projectName: 'Acme', projectCode: 'ACME', projectType: 'new',
    platforms: ['web'], blueprintBody: '# BRD\n'.padEnd(60, 'x'),
    executor: 'claude', executorBinary: null, projectDir: null,
  });
  expect(res.status).toBe(422);
  expect(JSON.stringify(res.body)).toMatch(/director/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/blueprint-route.test.ts`
Expected: FAIL — `bootstrap`/`createProject` not honored (handoffUrl undefined).

- [ ] **Step 3: Implement the bootstrap branch**

In `server/routes/blueprint.ts`, extend `BlueprintRouterDeps` (add `bootstrap?`, `createProject?`) and insert the branch **after validation passes** (after the `if (errors.length > 0 ...) return;` block at line ~116), BEFORE the existing in-place `writeBlueprint`/`writeProjectMeta`:

```ts
    // Bootstrap (wizard) mode: the directory chosen in the GUI becomes a brand
    // new project with its own daemon. Delegate the whole create-and-launch and
    // return a handoffUrl the frontend redirects to.
    if (deps.bootstrap && deps.createProject) {
      const chosen = typeof body.projectDir === 'string' ? body.projectDir.trim() : '';
      if (chosen.length === 0) {
        res.status(422).json({
          error: 'validation_failed',
          details: ['projectDir (project directory) is required'],
        });
        return;
      }
      const meta: ProjectMeta = {
        name: projectName, code: projectCode, type: projectType, platforms,
        githubRepo, executor, executorBinary, createdAt: Date.now(),
      };
      const created = deps.createProject({ projectDir: chosen, meta, blueprintBody });
      if (!created.ok) {
        res.status(500).json({ error: 'create_failed', message: created.message });
        return;
      }
      res.status(201).json({
        ok: true,
        triggerWorkflowId: triggerWorkflowIdFor(projectType),
        project: meta,
        projectDir: created.projectDir,
        initializedElsewhere: false,
        handoffUrl: created.handoffUrl,
        ...(created.gitWarning ? { gitWarning: created.gitWarning } : {}),
      });
      return;
    }
```

(The existing non-bootstrap path below is unchanged.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/blueprint-route.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add server/routes/blueprint.ts tests/blueprint-route.test.ts
git commit -m "feat(blueprint): bootstrap branch delegates to createProject, returns handoffUrl"
```

---

## Task 4: `handoffUrl` in API types

**Files:**
- Modify: `src/lib/api-types.ts:295-301`

- [ ] **Step 1: Add the optional field**

```ts
export type BlueprintSubmitResponse = {
  ok: true;
  triggerWorkflowId: string;
  project: ProjectMeta;
  projectDir: string;
  initializedElsewhere: boolean;
  handoffUrl?: string;   // bootstrap-wizard handoff target (real daemon URL)
  gitWarning?: string;   // soft git-bootstrap warning, if any
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/api-types.ts
git commit -m "feat(types): BlueprintSubmitResponse.handoffUrl + gitWarning"
```

---

## Task 5: OnboardingScreen browser handoff

**Files:**
- Modify: `src/components/OnboardingScreen.tsx:253-272` (inside `submit`)

- [ ] **Step 1: Add the handoff redirect**

Replace the success block (the part after `const res = await apiPost(...)` and `setSubmitting(false);`) so the `handoffUrl` case wins first:

```ts
      const res = await apiPost<BlueprintSubmitResponse>('/api/blueprint', payload);
      // Bootstrap-wizard handoff: the real project daemon now lives at handoffUrl.
      // Keep the spinner ("preparing") and hard-navigate the browser to it.
      if (res.handoffUrl) {
        setSubmitError(null);
        window.location.href = res.handoffUrl;
        return;
      }
      setSubmitting(false);
      if (res.initializedElsewhere) {
        setInitializedAt(res.projectDir);
        return;
      }
      if (onDone) {
        onDone();
      } else {
        window.location.hash = '/';
        window.location.reload();
      }
```

> Note: in the `handoffUrl` branch we intentionally do NOT call `setSubmitting(false)` — the "Initializing…/Projen hazırlanıyor…" state should persist through the navigation.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/OnboardingScreen.tsx
git commit -m "feat(onboarding): redirect browser to handoffUrl after bootstrap create"
```

---

## Task 6: `autoStartPendingAnalysis` + boot wiring

**Files:**
- Create: `server/orchestrator/auto-start-analysis.ts`
- Test: `tests/auto-start-analysis.test.ts`
- Modify: `server/index.ts` (extract `triggerAnalysis`, call at boot)

**Contract:**
```ts
export type AutoStartDeps = {
  repos: Repositories;
  blueprintPath: string;
  projectJsonPath: string;
  trigger: (workflowId: string) => void;
  // injectable readers for tests; default to the real io.ts fns
  readStatus?: (p: string) => BlueprintStatus;
  readMeta?: (p: string) => ProjectMeta | null;
};
export type AutoStartResult = { started: boolean; reason?: string; workflowId?: string };
export function autoStartPendingAnalysis(deps: AutoStartDeps): AutoStartResult;
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/auto-start-analysis.test.ts
import { describe, it, expect, vi } from 'vitest';
import { autoStartPendingAnalysis } from '../server/orchestrator/auto-start-analysis.ts';
import type { ProjectMeta } from '../server/blueprint/io.ts';

const META: ProjectMeta = {
  name: 'Acme', code: 'ACME', type: 'new', platforms: ['web'],
  githubRepo: null, executor: 'claude', executorBinary: null, createdAt: 1,
};
function repos(runs: Array<{ workflow_id: string }>) {
  return { runs: { listRuns: vi.fn(() => runs) } } as any;
}

describe('autoStartPendingAnalysis', () => {
  it('triggers analysis when approved and no prior run exists', () => {
    const trigger = vi.fn();
    const res = autoStartPendingAnalysis({
      repos: repos([]), blueprintPath: '/bp', projectJsonPath: '/pj', trigger,
      readStatus: () => 'approved', readMeta: () => META,
    });
    expect(res.started).toBe(true);
    expect(res.workflowId).toBe('new-project-analysis');
    expect(trigger).toHaveBeenCalledWith('new-project-analysis');
  });

  it('does NOT trigger when blueprint not approved', () => {
    const trigger = vi.fn();
    const res = autoStartPendingAnalysis({
      repos: repos([]), blueprintPath: '/bp', projectJsonPath: '/pj', trigger,
      readStatus: () => 'draft', readMeta: () => META,
    });
    expect(res.started).toBe(false);
    expect(trigger).not.toHaveBeenCalled();
  });

  it('does NOT trigger when an analysis run already exists (idempotent)', () => {
    const trigger = vi.fn();
    const res = autoStartPendingAnalysis({
      repos: repos([{ workflow_id: 'new-project-analysis' }]),
      blueprintPath: '/bp', projectJsonPath: '/pj', trigger,
      readStatus: () => 'approved', readMeta: () => META,
    });
    expect(res.started).toBe(false);
    expect(res.reason).toMatch(/already/i);
    expect(trigger).not.toHaveBeenCalled();
  });

  it('does NOT trigger when meta is missing', () => {
    const trigger = vi.fn();
    const res = autoStartPendingAnalysis({
      repos: repos([]), blueprintPath: '/bp', projectJsonPath: '/pj', trigger,
      readStatus: () => 'approved', readMeta: () => null,
    });
    expect(res.started).toBe(false);
    expect(trigger).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/auto-start-analysis.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `auto-start-analysis.ts`**

```ts
// server/orchestrator/auto-start-analysis.ts
import type { Repositories } from '../db/repositories/index.ts';
import {
  readBlueprintStatus, readProjectMeta, triggerWorkflowIdFor,
  type BlueprintStatus, type ProjectMeta,
} from '../blueprint/io.ts';

export type AutoStartDeps = {
  repos: Repositories;
  blueprintPath: string;
  projectJsonPath: string;
  trigger: (workflowId: string) => void;
  readStatus?: (p: string) => BlueprintStatus;
  readMeta?: (p: string) => ProjectMeta | null;
};

export type AutoStartResult = { started: boolean; reason?: string; workflowId?: string };

/**
 * On daemon boot: if this project's blueprint is approved and no analysis run
 * has ever started, kick the analysis pipeline once. Lets a project spawned by
 * the bootstrap wizard begin work without a human clicking anything. Idempotent
 * across restarts (guards on an existing run for the workflow).
 */
export function autoStartPendingAnalysis(deps: AutoStartDeps): AutoStartResult {
  const readStatus = deps.readStatus ?? readBlueprintStatus;
  const readMeta = deps.readMeta ?? readProjectMeta;

  if (readStatus(deps.blueprintPath) !== 'approved') {
    return { started: false, reason: 'not-approved' };
  }
  const meta = readMeta(deps.projectJsonPath);
  if (!meta) return { started: false, reason: 'no-meta' };

  const workflowId = triggerWorkflowIdFor(meta.type);
  const existing = deps.repos.runs.listRuns({ limit: 1000 });
  if (existing.some((r) => r.workflow_id === workflowId)) {
    return { started: false, reason: 'already-ran', workflowId };
  }
  deps.trigger(workflowId);
  return { started: true, workflowId };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/auto-start-analysis.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire into `server/index.ts`**

(a) Extract the existing inline `onApproved` closure (lines ~213-256) into a named `const triggerAnalysis = (workflowId: string) => { ... }` defined BEFORE the `app.use('/api', blueprintRouter(...))` call. Body is the existing closure verbatim (the `readProjectMeta` + `console.log` + `void startCommand({...}).then(...)`).

(b) Pass it to the router:
```ts
app.use('/api', blueprintRouter({
  workspaceRoot: process.cwd(),
  bootstrap: process.env.KORTEXT_BOOTSTRAP === '1',
  createProject: (input) => createProjectAndLaunch(input, {
    packageRoot: process.env.KORTEXT_PACKAGE_ROOT ?? process.cwd(),
    init: (dir) => initCommand({ targetDir: dir, force: false }),
    bootstrapGit: (dir) => bootstrapGit(dir),
    startProject: (dir, d) => startProject(dir, { packageRoot: d.packageRoot, cwd: d.cwd }),
    writeBlueprint,
    writeProjectMeta,
  }),
  onApproved: triggerAnalysis,
}));
```

(c) After `const resumed = resumeOrphanedRuns(repos);` (line ~106), add — but NOT in bootstrap mode (the scratch home is intentionally inert):
```ts
if (process.env.KORTEXT_BOOTSTRAP !== '1') {
  const bpPaths = resolveBlueprintPaths(process.cwd());
  const auto = autoStartPendingAnalysis({
    repos,
    blueprintPath: bpPaths.blueprintPath,
    projectJsonPath: bpPaths.projectJsonPath,
    trigger: triggerAnalysis,
  });
  if (auto.started) {
    console.log(`[kortext] auto-start: analysis ${auto.workflowId} triggered on boot`);
  }
}
```

(d) Add imports at the top of `server/index.ts`:
```ts
import { autoStartPendingAnalysis } from './orchestrator/auto-start-analysis.ts';
import { createProjectAndLaunch } from './blueprint/create-project.ts';
import { bootstrapGit } from './cli/bootstrap-git.ts';
import { startProject } from './cli/cmd-start.ts';
import { initCommand } from './cli/init.ts';
import { writeBlueprint, writeProjectMeta } from './blueprint/io.ts';
```
(`resolveBlueprintPaths` / `readProjectMeta` are already imported — do not duplicate.)

> ⚠️ Ordering: `triggerAnalysis` must be declared before BOTH the boot-time `autoStartPendingAnalysis` call (step c) and the `blueprintRouter` registration (step b). Place the `const triggerAnalysis = …` definition just after `queueGateController` is created (~line 117) and move the boot-time auto-start block to AFTER that definition.

- [ ] **Step 6: Typecheck + full test sweep**

Run: `npm run typecheck && npx vitest run`
Expected: PASS (existing suite + new tests green).

- [ ] **Step 7: Commit**

```bash
git add server/orchestrator/auto-start-analysis.ts tests/auto-start-analysis.test.ts server/index.ts
git commit -m "feat(boot): autoStartPendingAnalysis + bootstrap-aware blueprint wiring"
```

---

## Task 7: Bootstrap wizard launcher

**Files:**
- Create: `server/cli/cmd-bootstrap.ts`
- Test: `tests/cmd-bootstrap.test.ts`

**Contract:**
```ts
export type LaunchBootstrapDeps = {
  packageRoot: string;
  homeDir?: string;        // default: ~/.kortext/bootstrap
  port?: number;           // default: BOOTSTRAP_PORT
  init?: (dir: string) => { ok: boolean; errorMessage?: string };
  resolveCmd?: typeof resolveDaemonCommand;
  spawn?: (cmd: DaemonCommand) => number;
};
export type LaunchBootstrapResult =
  | { ok: true; url: string; pid: number; port: number }
  | { ok: false; message: string };
export const BOOTSTRAP_PORT = 3199;
export function launchBootstrapWizard(deps: LaunchBootstrapDeps): LaunchBootstrapResult;
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/cmd-bootstrap.test.ts
import { describe, it, expect, vi } from 'vitest';
import { launchBootstrapWizard, BOOTSTRAP_PORT } from '../server/cli/cmd-bootstrap.ts';

function deps(over = {}) {
  return {
    packageRoot: '/pkg',
    homeDir: '/tmp/kx-bootstrap',
    init: vi.fn(() => ({ ok: true })),
    resolveCmd: vi.fn((i: any) => ({
      mode: 'prod', command: 'node', args: ['server.js'],
      cwd: i.projectPath, env: { PORT: String(i.port) },
    })),
    spawn: vi.fn(() => 4321),
    ...over,
  };
}

describe('launchBootstrapWizard', () => {
  it('inits the scratch home, spawns daemon with KORTEXT_BOOTSTRAP=1, returns url', () => {
    const d = deps();
    const res = launchBootstrapWizard(d as any);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.url).toBe(`http://localhost:${BOOTSTRAP_PORT}/`);
    expect(res.pid).toBe(4321);
    expect(d.init).toHaveBeenCalledWith('/tmp/kx-bootstrap');
    const spawnedCmd = (d.spawn as any).mock.calls[0][0];
    expect(spawnedCmd.env.KORTEXT_BOOTSTRAP).toBe('1');
  });

  it('fails when scratch-home init fails (no spawn)', () => {
    const d = deps({ init: vi.fn(() => ({ ok: false, errorMessage: 'no perm' })) });
    const res = launchBootstrapWizard(d as any);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toMatch(/no perm/);
    expect(d.spawn).not.toHaveBeenCalled();
  });

  it('reports dev-mode (no dist) as a friendly failure', () => {
    const d = deps({
      resolveCmd: vi.fn(() => ({ mode: 'dev', command: 'x', args: [], cwd: '/', env: {} })),
    });
    const res = launchBootstrapWizard(d as any);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toMatch(/serve/i);
    expect(d.spawn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/cmd-bootstrap.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `cmd-bootstrap.ts`**

```ts
// server/cli/cmd-bootstrap.ts
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  resolveDaemonCommand, spawnDaemon, type DaemonCommand,
} from '../registry/daemon.ts';
import { initCommand } from './init.ts';

export const BOOTSTRAP_PORT = 3199;

export type LaunchBootstrapDeps = {
  packageRoot: string;
  homeDir?: string;
  port?: number;
  init?: (dir: string) => { ok: boolean; errorMessage?: string };
  resolveCmd?: typeof resolveDaemonCommand;
  spawn?: (cmd: DaemonCommand) => number;
};

export type LaunchBootstrapResult =
  | { ok: true; url: string; pid: number; port: number }
  | { ok: false; message: string };

/**
 * Launch the ephemeral onboarding wizard daemon. It runs in a scratch home,
 * is NOT registered in projects.json, and exists only to host onboarding until
 * the user picks a directory (then the blueprint route spawns the real daemon).
 */
export function launchBootstrapWizard(deps: LaunchBootstrapDeps): LaunchBootstrapResult {
  const homeDir = deps.homeDir ?? join(homedir(), '.kortext', 'bootstrap');
  const port = deps.port ?? BOOTSTRAP_PORT;
  const init = deps.init ?? ((dir: string) => initCommand({ targetDir: dir, force: false }));
  const resolveCmd = deps.resolveCmd ?? resolveDaemonCommand;
  const spawnFn = deps.spawn ?? spawnDaemon;

  const scaffold = init(homeDir);
  if (!scaffold.ok) {
    return { ok: false, message: scaffold.errorMessage ?? 'bootstrap scaffold failed' };
  }

  const cmd = resolveCmd({ packageRoot: deps.packageRoot, projectPath: homeDir, port });
  if (cmd.mode === 'dev') {
    return { ok: false, message: 'Source checkout (no dist/) — use `kortext serve` for development.' };
  }
  const launchCmd: DaemonCommand = { ...cmd, env: { ...cmd.env, KORTEXT_BOOTSTRAP: '1' } };
  const pid = spawnFn(launchCmd);
  return { ok: true, url: `http://localhost:${port}/`, pid, port };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/cmd-bootstrap.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/cli/cmd-bootstrap.ts tests/cmd-bootstrap.test.ts
git commit -m "feat(cli): launchBootstrapWizard — ephemeral unregistered onboarding daemon"
```

---

## Task 8: CLI `start` handler wiring (`onboard` → wizard, `--new`)

**Files:**
- Modify: `bin/kortext.ts` (start command block, ~lines 251-282)
- Test: `tests/cmd-start.test.ts` (add a unit case on `resolveStartTarget` + a small dispatch guard)

> `bin/kortext.ts` is the CLI entry; its `main()` is not unit-tested directly. We
> test the decision (`resolveStartTarget` already returns `onboard`) and add one
> assertion that the `--new` flag is recognized via the existing `hasFlag` shape.
> The wizard-launch wiring itself is verified by `launchBootstrapWizard` tests
> (Task 7) + manual smoke (below).

- [ ] **Step 1: Write the failing test (resolveStartTarget onboard contract)**

```ts
// tests/cmd-start.test.ts — ADD
import { resolveStartTarget } from '../server/cli/cmd-start.ts';

it('no arg, empty registry, cwd has no .kortext → onboard (wizard trigger)', () => {
  const reg = { version: 1, projects: {} } as any;
  const target = resolveStartTarget(reg, undefined, '/tmp/empty', () => false);
  expect(target.kind).toBe('onboard');
});
```

- [ ] **Step 2: Run to verify it passes already (contract guard) or fails**

Run: `npx vitest run tests/cmd-start.test.ts`
Expected: PASS (this pins existing behavior the wiring relies on). If it fails, the `resolveStartTarget` contract changed — stop and reconcile.

- [ ] **Step 3: Wire the wizard launch in `bin/kortext.ts`**

Add the import near the other cmd imports (~line 48):
```ts
import { launchBootstrapWizard } from '../server/cli/cmd-bootstrap.ts';
```

In the `if (cmd === 'start') {` block, BEFORE `const result = startProject(...)`, add the `--new` short-circuit; and change the `result.action === 'onboard'` case to launch the wizard:

```ts
  if (cmd === 'start') {
    // `kortext start --new` always opens the wizard, even when projects exist.
    if (hasFlag('new')) {
      return launchWizardAndOpen();
    }
    const result = startProject(args[1], {
      packageRoot: packageRoot(),
      cwd: process.cwd(),
      init: (path) => initCommand({ targetDir: path, force: false }),
    });
    if (result.ok) {
      console.log(`${result.reused ? 'already running' : 'started'} ${result.slug} → ${result.url}`);
      const shouldOpen = !hasFlag('no-open') && process.env.KORTEXT_NO_OPEN !== '1';
      if (shouldOpen) {
        await new Promise((r) => setTimeout(r, 1200));
        openBrowser(result.url);
      }
      return 0;
    }
    if (result.action === 'list') {
      console.log('Registered projects:');
      console.log(formatList(readRegistry()));
      console.log('\nStart one with: kortext start <project>');
      console.log('Create a new one with: kortext start --new');
      return 0;
    }
    if (result.action === 'onboard') {
      return launchWizardAndOpen();
    }
    console.error(result.message);
    return 1;
  }
```

Add this helper near `openBrowser` (~line 108):
```ts
async function launchWizardAndOpen(): Promise<number> {
  const res = launchBootstrapWizard({ packageRoot: packageRoot() });
  if (!res.ok) {
    console.error(res.message);
    return 1;
  }
  console.log(`onboarding wizard → ${res.url}`);
  const shouldOpen = !hasFlag('no-open') && process.env.KORTEXT_NO_OPEN !== '1';
  if (shouldOpen) {
    await new Promise((r) => setTimeout(r, 1200));
    openBrowser(res.url);
  }
  return 0;
}
```

- [ ] **Step 4: Typecheck + full sweep**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bin/kortext.ts tests/cmd-start.test.ts
git commit -m "feat(cli): start → onboarding wizard when no project; --new forces it"
```

---

## Task 9: Manual smoke test (packaged) + docs

**Files:**
- Modify: `scripts/postinstall.mjs` (hint wording)
- Modify: `development/UAT-GUIDE.md` (new flow note)

- [ ] **Step 1: Build, pack, install, run the new flow**

```bash
npm run build
npm pack
npm install -g ./kortext-3.1.0.tgz
cd /tmp
mkdir kx-smoke
KORTEXT_CLAUDE_BIN=$(which claude) kortext start
```
Expected: browser opens to `http://localhost:3199/` (wizard). Fill onboarding, pick `/tmp/kx-smoke` as directory, submit. Expected: browser redirects to `http://localhost:3200/` (or next free), `/tmp/kx-smoke/.git` exists with a `development` branch, `kortext list` shows ONE project (`kx-smoke`, NOT the bootstrap), and analysis is running on the dashboard.

- [ ] **Step 2: Update the postinstall hint**

```js
// scripts/postinstall.mjs — replace the msg array
  const msg = [
    '',
    '  Kortext installed.',
    '',
    '  Start (opens the setup wizard): kortext start',
    '  Your projects:                  kortext list',
    '  Help:                           kortext help',
    '',
  ].join('\n');
```

- [ ] **Step 3: Add a flow note to UAT-GUIDE.md**

Under the "⭐ TAM & GERÇEK UAT" section, replace the manual `git init … && git branch development` block with:
> Build fazı git ister; artık sihirbaz projeyi oluştururken git'i otomatik kurar (init + commit + `development`). Mevcut git repo'su olan klasörlerde sadece `development` dalı garanti edilir — elle git komutu gerekmez.

And change the start step to: `kortext start` (no path) → wizard → pick directory in the GUI.

- [ ] **Step 4: Commit**

```bash
git add scripts/postinstall.mjs development/UAT-GUIDE.md
git commit -m "docs: postinstall hint + UAT guide for wizard-driven start (auto-git)"
```

---

## Self-Review

**Spec coverage:**
- Entry `kortext start` no-project to wizard → Task 8. `--new` → Task 8.
- Bootstrap wizard daemon (scratch home, `KORTEXT_BOOTSTRAP=1`, unregistered) → Task 7.
- `bootstrapGit` (new/existing/missing) → Task 1.
- Blueprint route bootstrap branch + scaffold+git+write+spawn → Tasks 2,3.
- Browser handoff → Tasks 4,5.
- `autoStartPendingAnalysis` on boot, idempotent, owning daemon → Task 6.
- Error handling (invalid dir 422, git soft-fail, spawn fail, no double-trigger) → Tasks 1,2,3,6.
- Docs/postinstall/UAT → Task 9.

**Placeholder scan:** none — every code step has full code.

**Type consistency:** `bootstrapGit(dir, runner?)` returns `{ok,created,developmentEnsured,warning?}` (Task 1) and is consumed in Task 2 (`{ok,warning?}`) and Task 6 wiring — compatible (consumers read a subset). `createProjectAndLaunch(input, deps)` signature identical in Tasks 2,3,6. `startProject(dir, {packageRoot,cwd})` matches `server/cli/cmd-start.ts:58`. `BlueprintSubmitResponse.handoffUrl?` defined Task 4, consumed Task 5. `triggerWorkflowIdFor` / `readBlueprintStatus` / `readProjectMeta` match `server/blueprint/io.ts`. `resolveDaemonCommand`/`spawnDaemon`/`DaemonCommand` match `server/registry/daemon.ts`.

**Out of scope (tracked elsewhere):** npm publish, prod-push/CI, hung-claude resilience, dashboard step-transparency, EpicDrawer full child list.
