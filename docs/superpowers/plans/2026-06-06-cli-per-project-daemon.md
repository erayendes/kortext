# Kortext v3.1 CLI Redesign — Per-Project Daemon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-project `init`/`serve` CLI with a 9-command surface that runs each project as its own daemon on its own port, tracked in a global registry, so the user can run multiple projects in parallel and return to them after a restart.

**Architecture (Eray's choice "A — per-project port", 2026-06-06):** Each project keeps the *current* single-project server unchanged — it just runs on its own port (acme→3200, saas→3201…). A global registry `~/.kortext/projects.json` maps a project slug → `{ name, path, port, pid, status }`. The CLI spawns a **detached** prod-mode daemon per project (the server already serves UI+API from `dist/web` on one port), tracks its PID, and manages lifecycle. **No frontend rewrite, no API re-prefixing, no per-project backend context** — the server stays exactly as-is; only the CLI + a registry + a daemon launcher are new.

**Tech Stack:** Node 26, TypeScript (tsx in dev, compiled `dist/` in prod), `node:child_process` (detached spawn), `better-sqlite3` (unchanged), vitest. No new dependencies.

**Why this is one plan, not five:** Per-project-port confines all change to the CLI/registry layer (`bin/`, `server/registry/`, `server/cli/`, `scripts/`). The server, engine, routes, and React app are untouched. This is a single, self-contained, testable subsystem.

---

## Design decisions (locked here so tasks stay consistent)

- **Slug:** `slugify(project.json.code)` lowercased (e.g. `TF`→`tf`); fall back to `slugify(name)`, then `basename(path)`. Collisions get a numeric suffix (`tf`, `tf-2`). The slug is the registry key and the user-facing handle for `start/pause/remove/purge`.
- **Port:** allocated once at registration, starting at `BASE_PORT = 3200`, first free port not already claimed in the registry; stored so it is **stable across restarts** (bookmarks keep working). Range cap `BASE_PORT..BASE_PORT+99`.
- **Registry file:** `~/.kortext/projects.json`, shape `{ "version": 1, "projects": { "<slug>": ProjectEntry } }`. Written atomically (temp file + rename). `~/.kortext/` is the GLOBAL config dir (distinct from a project's `.kortext/`).
- **Daemon:** prod-mode server (`node <pkg>/dist/server/index.js`, cwd=project path, `KORTEXT_PORT=<port>`), spawned `detached: true, stdio: ['ignore', logfd, logfd]`, `unref()`. Log → `<project>/.kortext/data/logs/daemon.log`. PID stored in the registry; liveness checked with `process.kill(pid, 0)`.
- **`start` with a path that has no `.kortext/`:** run the existing `initCommand` first (scaffold), then register + launch.
- **Old `start <workflow-id>`** (run a workflow with mock executor) is a dev/test command → **moved to `kortext dev:run <workflow-id>`** (keep it working for tests, off the main surface). `init`/`serve` stay for Kortext's own development; the 9-command surface is the user-facing set.
- **Dev vs prod:** `start` uses `buildServeCommands(..., mode:'auto')` and takes the single `server` command. In a published install `dist/` exists → prod (1 process serves UI+API). If only source exists (dev), auto falls back to dev which needs vite too — `start` then prints a hint to use `kortext serve` for source checkouts. (Daemon model targets installed/prod.)

## File structure

```
server/registry/projects.ts      # registry types + read/write + slug + port alloc (PURE core, heavily tested)
server/registry/daemon.ts        # spawn/kill/liveness for a project daemon (testable seams)
server/cli/cmd-start.ts          # `start` resolution + launch (testable resolution)
server/cli/cmd-lifecycle.ts      # stop / pause (kill daemons from registry)
server/cli/cmd-projects.ts       # list / remove / purge (registry mutations + formatters)
server/cli/cmd-update.ts         # update (npm -g) — thin
bin/kortext.ts                   # MODIFY: 9-command dispatch + new help text
scripts/postinstall.mjs          # friendly post-install message (low-risk)
server/index.ts                  # MODIFY: app.listen EADDRINUSE handler (v3.0.1 debt)
package.json                     # MODIFY: "postinstall" script + version 3.1.0
~/.kortext/projects.json         # runtime data (not committed)
```

Home-dir resolution uses `os.homedir()`; the registry dir is `join(homedir(), '.kortext')`. All registry functions take an injectable `registryDir` param (default the real one) so tests use a temp dir.

---

## Task 1: Registry core — types, slug, port allocation (pure)

**Files:**
- Create: `server/registry/projects.ts`
- Test: `tests/registry-projects.test.ts`

- [ ] **Step 1: Write failing tests for slug + port + entry shape**

```ts
// tests/registry-projects.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
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
```

(Add `import { afterEach } from 'vitest';` to the import line.)

- [ ] **Step 2: Run the test, expect failure**

Run: `npx vitest run tests/registry-projects.test.ts`
Expected: FAIL — module `server/registry/projects.ts` not found.

- [ ] **Step 3: Implement `server/registry/projects.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';

export const BASE_PORT = 3200;
export const MAX_PORT = BASE_PORT + 99;

export type ProjectStatus = 'running' | 'paused' | 'stopped';

export type ProjectEntry = {
  slug: string;
  name: string;
  path: string;
  port: number;
  pid: number | null;
  status: ProjectStatus;
  createdAt: number;
};

export type Registry = { version: 1; projects: Record<string, ProjectEntry> };

/** The global config dir (~/.kortext), NOT a project's local .kortext/. */
export function defaultRegistryDir(): string {
  return join(homedir(), '.kortext');
}

function registryPath(dir: string): string {
  return join(dir, 'projects.json');
}

export function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Derive a unique slug from code → name → basename, disambiguating collisions. */
export function slugFor(
  input: { code: string; name: string; path: string },
  taken: Set<string>,
): string {
  const base =
    slugify(input.code) || slugify(input.name) || slugify(basename(input.path)) || 'project';
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** First free port at/above BASE_PORT not present in `claimed`. */
export function allocatePort(claimed: number[]): number {
  const used = new Set(claimed);
  for (let p = BASE_PORT; p <= MAX_PORT; p++) {
    if (!used.has(p)) return p;
  }
  throw new Error(`no free port in ${BASE_PORT}..${MAX_PORT}`);
}

export function readRegistry(dir: string = defaultRegistryDir()): Registry {
  const path = registryPath(dir);
  if (!existsSync(path)) return { version: 1, projects: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Registry>;
    return { version: 1, projects: parsed.projects ?? {} };
  } catch {
    return { version: 1, projects: {} };
  }
}

export function writeRegistry(dir: string, reg: Registry): void {
  mkdirSync(dir, { recursive: true });
  const path = registryPath(dir);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(reg, null, 2));
  renameSync(tmp, path); // atomic on same fs
}

export function getProject(reg: Registry, slug: string): ProjectEntry | null {
  return reg.projects[slug] ?? null;
}

export function listProjects(reg: Registry): ProjectEntry[] {
  return Object.values(reg.projects).sort((a, b) => a.port - b.port);
}

export function upsertProject(reg: Registry, entry: ProjectEntry): Registry {
  return { ...reg, projects: { ...reg.projects, [entry.slug]: entry } };
}

export function removeProject(reg: Registry, slug: string): Registry {
  const next = { ...reg.projects };
  delete next[slug];
  return { ...reg, projects: next };
}

/** Register a new project root: derive slug, allocate a stable port. */
export function registerProject(
  reg: Registry,
  input: { code: string; name: string; path: string; now: number },
): { reg: Registry; entry: ProjectEntry } {
  const taken = new Set(Object.keys(reg.projects));
  const slug = slugFor(input, taken);
  const port = allocatePort(listProjects(reg).map((p) => p.port));
  const entry: ProjectEntry = {
    slug, name: input.name || slug, path: input.path, port,
    pid: null, status: 'stopped', createdAt: input.now,
  };
  return { reg: upsertProject(reg, entry), entry };
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `npx vitest run tests/registry-projects.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add server/registry/projects.ts tests/registry-projects.test.ts
git commit -m "feat(registry): global project registry (slug, port alloc, atomic read/write)"
```

---

## Task 2: Daemon launcher — spawn/liveness/kill

**Files:**
- Create: `server/registry/daemon.ts`
- Test: `tests/registry-daemon.test.ts`

The pure, testable seam is **command resolution** (what to spawn) and **liveness** (is a pid alive). The actual `spawn` is thin and injectable.

- [ ] **Step 1: Write failing tests**

```ts
// tests/registry-daemon.test.ts
import { describe, it, expect } from 'vitest';
import { resolveDaemonCommand, isPidAlive } from '../server/registry/daemon.ts';

describe('resolveDaemonCommand', () => {
  it('prod: runs the compiled server with KORTEXT_PORT + cwd=project', () => {
    const cmd = resolveDaemonCommand({
      packageRoot: '/pkg', projectPath: '/proj/tf', port: 3201,
      existsImpl: () => true, // dist present → prod
    });
    expect(cmd.mode).toBe('prod');
    expect(cmd.command).toContain('node'); // process.execPath
    expect(cmd.args[0]).toBe('/pkg/dist/server/index.js');
    expect(cmd.cwd).toBe('/proj/tf');
    expect(cmd.env.KORTEXT_PORT).toBe('3201');
  });
  it('dev: flags that source mode needs `kortext serve` (no single-process daemon)', () => {
    const cmd = resolveDaemonCommand({
      packageRoot: '/pkg', projectPath: '/proj/tf', port: 3201,
      existsImpl: () => false, // no dist → dev
    });
    expect(cmd.mode).toBe('dev');
  });
});

describe('isPidAlive', () => {
  it('true for the current process, false for an impossible pid', () => {
    expect(isPidAlive(process.pid)).toBe(true);
    expect(isPidAlive(2_147_483_646)).toBe(false);
  });
  it('treats null as not alive', () => {
    expect(isPidAlive(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run tests/registry-daemon.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/registry/daemon.ts`**

```ts
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { buildServeCommands } from '../cli/serve.ts';

export type DaemonCommand = {
  mode: 'dev' | 'prod';
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
};

/** Resolve what to spawn for a project's daemon (the single server command). */
export function resolveDaemonCommand(input: {
  packageRoot: string;
  projectPath: string;
  port: number;
  existsImpl?: (p: string) => boolean;
}): DaemonCommand {
  const plan = buildServeCommands({
    packageRoot: input.packageRoot,
    projectDir: input.projectPath,
    mode: 'auto',
    port: input.port,
    existsImpl: input.existsImpl,
  });
  const server = plan.commands.find((c) => c.name === 'server')!;
  return { mode: plan.mode, command: server.command, args: server.args, cwd: server.cwd, env: server.env };
}

/** Liveness via the 0-signal probe (no actual signal sent). */
export function isPidAlive(pid: number | null): boolean {
  if (pid === null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'; // exists but not ours
  }
}

/** Spawn the daemon detached, logging to <project>/.kortext/data/logs/daemon.log. Returns pid. */
export function spawnDaemon(cmd: DaemonCommand): number {
  const logDir = join(cmd.cwd, '.kortext', 'data', 'logs');
  mkdirSync(logDir, { recursive: true });
  const logFd = openSync(join(logDir, 'daemon.log'), 'a');
  const child = spawn(cmd.command, cmd.args, {
    cwd: cmd.cwd,
    env: { ...process.env, ...cmd.env },
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  if (child.pid === undefined) throw new Error('daemon failed to spawn (no pid)');
  return child.pid;
}

/** Best-effort terminate. Returns true if a signal was delivered. */
export function killDaemon(pid: number | null): boolean {
  if (!isPidAlive(pid)) return false;
  try {
    process.kill(pid as number, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run tests/registry-daemon.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add server/registry/daemon.ts tests/registry-daemon.test.ts
git commit -m "feat(registry): daemon launcher — detached spawn, pid liveness, kill"
```

---

## Task 3: `start` command (resolution + launch)

**Files:**
- Create: `server/cli/cmd-start.ts`
- Test: `tests/cmd-start.test.ts`

`startProject` is the orchestration: resolve the target (registered slug | path | cwd), register if new, launch the daemon, persist pid+status, return a result describing what to open. The fs/spawn are injected so the resolution is tested without real processes.

- [ ] **Step 1: Write failing tests**

```ts
// tests/cmd-start.test.ts
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
  it('no arg, populated registry, cwd not a project → list', () => {
    expect(resolveStartTarget(reg, undefined, '/cwd', () => false)).toEqual({ kind: 'list' });
  });
  it('unknown slug (no such path) → not-found', () => {
    expect(resolveStartTarget(reg, 'nope', '/cwd', () => false)).toEqual({ kind: 'not-found', arg: 'nope' });
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run tests/cmd-start.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/cli/cmd-start.ts`**

```ts
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import {
  readRegistry, writeRegistry, registerProject, getProject, upsertProject,
  listProjects, defaultRegistryDir, type Registry, type ProjectEntry,
} from '../registry/projects.ts';
import { resolveDaemonCommand, spawnDaemon, isPidAlive } from '../registry/daemon.ts';
import { readProjectMeta } from '../blueprint/io.ts';

export type StartTarget =
  | { kind: 'existing'; slug: string }
  | { kind: 'new-path'; path: string }
  | { kind: 'list' }
  | { kind: 'onboard' }
  | { kind: 'not-found'; arg: string };

/** Decide what `start [arg]` means. `exists` is injectable for tests. */
export function resolveStartTarget(
  reg: Registry,
  arg: string | undefined,
  cwd: string,
  exists: (p: string) => boolean = existsSync,
): StartTarget {
  if (arg) {
    const bySlug = getProject(reg, arg);
    if (bySlug) return { kind: 'existing', slug: bySlug.slug };
    const asPath = isAbsolute(arg) ? arg : resolve(cwd, arg);
    if (exists(asPath)) {
      const registered = listProjects(reg).find((p) => p.path === asPath);
      return registered ? { kind: 'existing', slug: registered.slug } : { kind: 'new-path', path: asPath };
    }
    return { kind: 'not-found', arg };
  }
  // No arg: prefer the cwd if it is a kortext project.
  if (exists(join(cwd, '.kortext'))) {
    const registered = listProjects(reg).find((p) => p.path === cwd);
    return registered ? { kind: 'existing', slug: registered.slug } : { kind: 'new-path', path: cwd };
  }
  return listProjects(reg).length > 0 ? { kind: 'list' } : { kind: 'onboard' };
}

export type StartResult =
  | { ok: true; slug: string; port: number; url: string; reused: boolean }
  | { ok: false; action: 'list' | 'onboard' | 'not-found' | 'dev-mode'; message: string };

export type StartDeps = {
  packageRoot: string;
  cwd: string;
  registryDir?: string;
  /** init a new project root (scaffold .kortext) — defaults to the real initCommand. */
  init?: (path: string) => { ok: boolean; errorMessage?: string };
  spawn?: (cmd: ReturnType<typeof resolveDaemonCommand>) => number;
  now?: () => number;
};

/** Launch (or relaunch) a project's daemon. */
export function startProject(arg: string | undefined, deps: StartDeps): StartResult {
  const registryDir = deps.registryDir ?? defaultRegistryDir();
  const now = deps.now ?? (() => Date.now());
  const spawnFn = deps.spawn ?? spawnDaemon;
  let reg = readRegistry(registryDir);
  const target = resolveStartTarget(reg, arg, deps.cwd);

  if (target.kind === 'list') return { ok: false, action: 'list', message: 'Pick a project to start.' };
  if (target.kind === 'onboard') return { ok: false, action: 'onboard', message: 'No project here yet — run onboarding.' };
  if (target.kind === 'not-found') return { ok: false, action: 'not-found', message: `No project '${target.arg}'.` };

  let entry: ProjectEntry;
  if (target.kind === 'existing') {
    entry = getProject(reg, target.slug)!;
  } else {
    // new-path: scaffold if needed, then register from project.json (or basename).
    if (!existsSync(join(target.path, '.kortext'))) {
      const initFn = deps.init;
      if (initFn) {
        const r = initFn(target.path);
        if (!r.ok) return { ok: false, action: 'not-found', message: r.errorMessage ?? 'init failed' };
      }
    }
    const meta = readProjectMeta(join(target.path, '.kortext', 'project.json'));
    const reg2 = registerProject(reg, {
      code: meta?.code ?? '', name: meta?.name ?? '', path: target.path, now: now(),
    });
    reg = reg2.reg;
    entry = reg2.entry;
  }

  // Already running? reuse.
  if (isPidAlive(entry.pid) && entry.status === 'running') {
    return { ok: true, slug: entry.slug, port: entry.port, url: `http://localhost:${entry.port}/`, reused: true };
  }

  const cmd = resolveDaemonCommand({ packageRoot: deps.packageRoot, projectPath: entry.path, port: entry.port });
  if (cmd.mode === 'dev') {
    return { ok: false, action: 'dev-mode', message: 'Source checkout (no dist/) — use `kortext serve` for development.' };
  }
  const pid = spawnFn(cmd);
  reg = upsertProject(reg, { ...entry, pid, status: 'running' });
  writeRegistry(registryDir, reg);
  return { ok: true, slug: entry.slug, port: entry.port, url: `http://localhost:${entry.port}/`, reused: false };
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run tests/cmd-start.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add server/cli/cmd-start.ts tests/cmd-start.test.ts
git commit -m "feat(cli): start command — resolve target + launch per-project daemon"
```

---

## Task 4: `stop` / `pause` lifecycle

**Files:**
- Create: `server/cli/cmd-lifecycle.ts`
- Test: `tests/cmd-lifecycle.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/cmd-lifecycle.test.ts
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
    expect(reg.projects.tf.status).toBe('stopped');
    expect(reg.projects.tf.pid).toBeNull();
  });
});

describe('pauseProject', () => {
  it('kills one daemon, marks it paused, leaves the other running', () => {
    const res = pauseProject('tf', { registryDir: dir, kill: () => true });
    expect(res.ok).toBe(true);
    const reg = readRegistry(dir);
    expect(reg.projects.tf.status).toBe('paused');
    expect(reg.projects.ac.status).toBe('running');
  });
  it('errors on unknown slug', () => {
    expect(pauseProject('nope', { registryDir: dir, kill: () => true })).toEqual({ ok: false, message: "No project 'nope'." });
  });
});
```

- [ ] **Step 2: Run, expect failure.** `npx vitest run tests/cmd-lifecycle.test.ts` → FAIL.

- [ ] **Step 3: Implement `server/cli/cmd-lifecycle.ts`**

```ts
import {
  readRegistry, writeRegistry, listProjects, getProject, upsertProject, defaultRegistryDir,
} from '../registry/projects.ts';
import { killDaemon } from '../registry/daemon.ts';

type LifecycleDeps = { registryDir?: string; kill?: (pid: number | null) => boolean };

export function stopAll(deps: LifecycleDeps = {}): { stopped: string[] } {
  const dir = deps.registryDir ?? defaultRegistryDir();
  const kill = deps.kill ?? killDaemon;
  let reg = readRegistry(dir);
  const stopped: string[] = [];
  for (const p of listProjects(reg)) {
    if (p.status !== 'stopped') {
      kill(p.pid);
      reg = upsertProject(reg, { ...p, pid: null, status: 'stopped' });
      stopped.push(p.slug);
    }
  }
  writeRegistry(dir, reg);
  return { stopped: stopped.sort() };
}

export function pauseProject(slug: string, deps: LifecycleDeps = {}): { ok: boolean; message?: string } {
  const dir = deps.registryDir ?? defaultRegistryDir();
  const kill = deps.kill ?? killDaemon;
  const reg = readRegistry(dir);
  const p = getProject(reg, slug);
  if (!p) return { ok: false, message: `No project '${slug}'.` };
  kill(p.pid);
  writeRegistry(dir, upsertProject(reg, { ...p, pid: null, status: 'paused' }));
  return { ok: true };
}
```

- [ ] **Step 4: Run, expect pass.** `npx vitest run tests/cmd-lifecycle.test.ts` → PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add server/cli/cmd-lifecycle.ts tests/cmd-lifecycle.test.ts
git commit -m "feat(cli): stop (all) + pause (one) daemon lifecycle"
```

---

## Task 5: `list` / `remove` / `purge`

**Files:**
- Create: `server/cli/cmd-projects.ts`
- Test: `tests/cmd-projects.test.ts`

`purge` deletes the project's local `.kortext/` — the fs delete is injected so the test never removes real files.

- [ ] **Step 1: Write failing tests**

```ts
// tests/cmd-projects.test.ts
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
    const res = purgeProject('tf', { registryDir: dir, rm: (p) => removed.push(p) });
    expect(res.ok).toBe(true);
    expect(removed).toEqual([join('/p/tf', '.kortext')]);
    expect(readRegistry(dir).projects.tf).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement `server/cli/cmd-projects.ts`**

```ts
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  readRegistry, writeRegistry, listProjects, getProject, removeProject,
  defaultRegistryDir, type Registry,
} from '../registry/projects.ts';
import { isPidAlive } from '../registry/daemon.ts';

export function formatList(reg: Registry, alive: (pid: number | null) => boolean = isPidAlive): string {
  const rows = listProjects(reg);
  if (rows.length === 0) return 'No projects registered. Run `kortext start <path>` to add one.';
  const lines = rows.map((p) => {
    const live = alive(p.pid) ? p.status : p.status === 'running' ? 'stale' : p.status;
    return `  ${p.slug.padEnd(16)} :${p.port}  ${String(live).padEnd(8)} ${p.path}`;
  });
  return ['  SLUG             PORT   STATUS   PATH', ...lines].join('\n');
}

type Deps = { registryDir?: string };

export function removeFromRegistry(slug: string, deps: Deps = {}): { ok: boolean; keptPath?: string; message?: string } {
  const dir = deps.registryDir ?? defaultRegistryDir();
  const reg = readRegistry(dir);
  const p = getProject(reg, slug);
  if (!p) return { ok: false, message: `No project '${slug}'.` };
  writeRegistry(dir, removeProject(reg, slug));
  return { ok: true, keptPath: join(p.path, '.kortext') };
}

export function purgeProject(
  slug: string,
  deps: Deps & { rm?: (path: string) => void } = {},
): { ok: boolean; message?: string } {
  const dir = deps.registryDir ?? defaultRegistryDir();
  const rm = deps.rm ?? ((p: string) => rmSync(p, { recursive: true, force: true }));
  const reg = readRegistry(dir);
  const p = getProject(reg, slug);
  if (!p) return { ok: false, message: `No project '${slug}'.` };
  rm(join(p.path, '.kortext'));
  writeRegistry(dir, removeProject(reg, slug));
  return { ok: true };
}
```

- [ ] **Step 4: Run, expect pass.**

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add server/cli/cmd-projects.ts tests/cmd-projects.test.ts
git commit -m "feat(cli): list / remove / purge project registry commands"
```

---

## Task 6: `update` command (thin)

**Files:**
- Create: `server/cli/cmd-update.ts`
- Test: `tests/cmd-update.test.ts`

- [ ] **Step 1: Failing test (resolution only)**

```ts
// tests/cmd-update.test.ts
import { describe, it, expect } from 'vitest';
import { updateCommandPlan } from '../server/cli/cmd-update.ts';

describe('updateCommandPlan', () => {
  it('runs npm update -g for the kortext package', () => {
    expect(updateCommandPlan()).toEqual({ command: 'npm', args: ['update', '-g', 'kortext'] });
  });
});
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement `server/cli/cmd-update.ts`**

```ts
export function updateCommandPlan(): { command: string; args: string[] } {
  return { command: 'npm', args: ['update', '-g', 'kortext'] };
}
```

- [ ] **Step 4: Run, expect pass.**

- [ ] **Step 5: Commit**

```bash
git add server/cli/cmd-update.ts tests/cmd-update.test.ts
git commit -m "feat(cli): update command plan (npm update -g kortext)"
```

---

## Task 7: Rewire `bin/kortext.ts` to the 9-command surface

**Files:**
- Modify: `bin/kortext.ts` (replace `HELP_TEXT` lines 151-173; restructure `main()` dispatch lines 175-493)

This is wiring (hard to unit-test the bin directly — the logic lives in the tested modules). Verify by running the CLI.

- [ ] **Step 1: Replace `HELP_TEXT`**

```ts
const HELP_TEXT = [
  'kortext v3.1 — autonomous AI agent runtime',
  '',
  '  start [project|path]   start the daemon for a project + open it;',
  '                         no arg = this folder, or pick from the list',
  '  stop                   stop all running project daemons',
  '  pause <project>        pause one project (others keep running)',
  '  list                   show registered projects + ports + status',
  '  remove <project>       drop from the registry (keeps .kortext/ on disk)',
  '  purge <project>        drop + delete the project .kortext/ (asks first)',
  '  update                 update kortext (npm update -g kortext)',
  '  doctor                 workflow / persona / lock consistency scan',
  '  help                   show this help (--help, -h)',
  '',
  '  (dev) serve [--mode] [--port]   single-project dev server (source checkout)',
  '  (dev) init [--force]            scaffold .kortext/ in this folder',
  '  (dev) dev:run <workflow-id>     run one workflow (was `start <id>`)',
  '  (dev) mcp                       MCP server over stdio',
  '',
  '  --help, -h             show this help',
  '  --version, -v          print version',
].join('\n');
```

- [ ] **Step 2: Add imports + a `confirm` helper near the top of `bin/kortext.ts`**

After the existing imports (line 41), add:
```ts
import { createInterface } from 'node:readline';
import { startProject } from '../server/cli/cmd-start.ts';
import { stopAll, pauseProject } from '../server/cli/cmd-lifecycle.ts';
import { formatList, removeFromRegistry, purgeProject } from '../server/cli/cmd-projects.ts';
import { updateCommandPlan } from '../server/cli/cmd-update.ts';
import { readRegistry } from '../server/registry/projects.ts';
import { initCommand } from '../server/cli/init.ts';

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise<string>((res) => rl.question(`${question} [y/N] `, res));
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
```

- [ ] **Step 3: Insert the new command branches in `main()` BEFORE the existing `serve` branch (after the `init` branch ends, ~line 229).** Each returns a number.

```ts
  if (cmd === 'start') {
    const result = startProject(args[1], {
      packageRoot: packageRoot(),
      cwd: process.cwd(),
      init: (path) => initCommand({ targetDir: path, force: false }),
    });
    if (result.ok) {
      console.log(`${result.reused ? 'already running' : 'started'} ${result.slug} → ${result.url}`);
      const shouldOpen = !hasFlag('no-open') && process.env.KORTEXT_NO_OPEN !== '1';
      if (shouldOpen) setTimeout(() => openBrowser(result.url), 1200);
      return 0;
    }
    if (result.action === 'list') {
      console.log('Registered projects:');
      console.log(formatList(readRegistry()));
      console.log('\nStart one with: kortext start <project>');
      return 0;
    }
    if (result.action === 'onboard') {
      console.log('No Kortext project in this folder.');
      console.log('Run `kortext start <path-to-project>` (it will scaffold + launch).');
      return 0;
    }
    console.error(result.message);
    return 1;
  }

  if (cmd === 'stop') {
    const { stopped } = stopAll();
    console.log(stopped.length ? `stopped: ${stopped.join(', ')}` : 'nothing was running');
    return 0;
  }

  if (cmd === 'pause') {
    const slug = args[1];
    if (!slug) { console.error('usage: kortext pause <project>'); return 2; }
    const res = pauseProject(slug);
    if (!res.ok) { console.error(res.message); return 1; }
    console.log(`paused ${slug}`);
    return 0;
  }

  if (cmd === 'list') {
    console.log(formatList(readRegistry()));
    return 0;
  }

  if (cmd === 'remove') {
    const slug = args[1];
    if (!slug) { console.error('usage: kortext remove <project>'); return 2; }
    const res = removeFromRegistry(slug);
    if (!res.ok) { console.error(res.message); return 1; }
    console.log(`removed ${slug} from the registry (kept ${res.keptPath})`);
    return 0;
  }

  if (cmd === 'purge') {
    const slug = args[1];
    if (!slug) { console.error('usage: kortext purge <project>'); return 2; }
    const ok = hasFlag('yes') || (await confirm(`Permanently delete ${slug}'s .kortext/ folder?`));
    if (!ok) { console.log('aborted'); return 0; }
    const res = purgeProject(slug);
    if (!res.ok) { console.error(res.message); return 1; }
    console.log(`purged ${slug} (registry + .kortext/ deleted)`);
    return 0;
  }

  if (cmd === 'update') {
    const plan = updateCommandPlan();
    const child = spawn(plan.command, plan.args, { stdio: 'inherit', shell: false });
    return await new Promise<number>((res) => child.on('close', (code) => res(code ?? 1)));
  }
```

- [ ] **Step 4: Rename the legacy workflow runner.** In the `switch (cmd)` block, change `case 'start':` (line 347) to `case 'dev:run':`. (The new top-level `start` branch above shadows it; this keeps the workflow runner for tests under a dev-only name.) Update its usage string to `usage: kortext dev:run <workflow-id> ...`.

- [ ] **Step 5: Verify the CLI end-to-end (manual)**

Run (from a built install or `npx tsx bin/kortext.ts`):
```bash
npx tsx bin/kortext.ts help            # shows the new 9-command help
npx tsx bin/kortext.ts list            # "No projects registered…"
npx tsx bin/kortext.ts doctor          # still works
```
Expected: help shows the 9 commands; list shows the empty-registry message; doctor unchanged.

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npm run typecheck && npx vitest run`
Expected: all green (existing `cli-serve` test untouched; new registry/cli tests pass).

- [ ] **Step 7: Commit**

```bash
git add bin/kortext.ts
git commit -m "feat(cli): wire 9-command surface (start/stop/pause/list/remove/purge/update)"
```

---

## Task 8: Postinstall message

**Files:**
- Create: `scripts/postinstall.mjs`
- Modify: `package.json` (add `"postinstall": "node scripts/postinstall.mjs"` to scripts)

Per-project-port has no central daemon to auto-start at install time, so postinstall is a friendly pointer (low-risk; never spawns). It must NEVER fail the install (wrap in try/catch, always exit 0).

- [ ] **Step 1: Implement `scripts/postinstall.mjs`**

```js
#!/usr/bin/env node
// Friendly post-install pointer. MUST NOT throw — a noisy postinstall breaks
// `npm i -g`. Skipped in CI to keep automated installs quiet.
try {
  if (process.env.CI || process.env.KORTEXT_NO_POSTINSTALL) process.exit(0);
  const msg = [
    '',
    '  Kortext installed.',
    '',
    '  Start a project:   cd <your-project> && kortext start',
    '  See your projects: kortext list',
    '  Help:              kortext help',
    '',
  ].join('\n');
  process.stdout.write(msg);
} catch {
  // never block the install
}
process.exit(0);
```

- [ ] **Step 2: Add to `package.json` scripts**

```json
"postinstall": "node scripts/postinstall.mjs",
```

- [ ] **Step 3: Verify it runs and exits 0**

Run: `node scripts/postinstall.mjs; echo "exit=$?"`
Expected: prints the message, `exit=0`. Then `CI=1 node scripts/postinstall.mjs; echo "exit=$?"` → no output, `exit=0`.

- [ ] **Step 4: Commit**

```bash
git add scripts/postinstall.mjs package.json
git commit -m "feat(cli): friendly postinstall pointer (never blocks install)"
```

---

## Task 9: EADDRINUSE handler (v3.0.1 debt)

**Files:**
- Modify: `server/index.ts` (the `app.listen(...)` call — find it near the bottom of the file)

Today an in-use port makes Express skip the listening callback and the user sees "Cannot GET /". With per-project ports a clash is more likely (two `start`s racing), so this matters.

- [ ] **Step 1: Find the listen call**

Run: `grep -n "app.listen" server/index.ts`
Expected: one match near the bottom.

- [ ] **Step 2: Add an `error` handler on the server**

Replace the `app.listen(PORT, ...)` call with (adapt the port variable name to what's there):
```ts
const server = app.listen(PORT, () => {
  console.log(`[kortext] listening on http://localhost:${PORT}`);
});
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[kortext] port ${PORT} is already in use. Another project (or a stale daemon) is on it.\n` +
        `          Pick another port (KORTEXT_PORT=...) or run \`kortext list\` / \`kortext stop\`.`,
    );
    process.exit(1);
  }
  console.error('[kortext] server error:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Verify**

Run two servers on the same port:
```bash
KORTEXT_PORT=3299 npx tsx server/index.ts &   # first one binds
sleep 2
KORTEXT_PORT=3299 npx tsx server/index.ts ; echo "exit=$?"   # second one
```
Expected: the second prints the EADDRINUSE message and `exit=1` (not a hang / "Cannot GET /"). Then `kill %1`.

- [ ] **Step 4: Commit**

```bash
git add server/index.ts
git commit -m "fix(server): explicit EADDRINUSE handler on app.listen (v3.0.1 debt)"
```

---

## Task 10: Release prep (version + CHANGELOG)

**Files:**
- Modify: `package.json` (`"version": "3.0.0"` → `"3.1.0"`)
- Modify: `CHANGELOG.md` (move `[Unreleased]` → `[3.1.0]`, add a fresh `[Unreleased]`)

- [ ] **Step 1: Bump version** in `package.json` to `3.1.0`.

- [ ] **Step 2: Update `CHANGELOG.md`** — rename the `## [Unreleased]` heading to `## [3.1.0] - 2026-06-06` and add a new empty `## [Unreleased]` above it. Summarize: UI UAT phases (board data wiring, create/comment/filters, agents panel, persona icons), per-project-port CLI redesign (9 commands, registry, daemon lifecycle), EADDRINUSE fix.

- [ ] **Step 3: Full green gate**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: typecheck clean, all tests pass, build succeeds (so the prod daemon path is real).

- [ ] **Step 4: Commit**

```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): v3.1.0 — per-project-port CLI + UI UAT phases"
```

---

## Task 11: Packaged smoke test (manual, pre-publish)

No code — a verification gate before `npm publish`. Run from a scratch dir.

- [ ] **Step 1: Pack + global install**

```bash
npm pack                                  # produces kortext-3.1.0.tgz
npm install -g ./kortext-3.1.0.tgz        # postinstall message should print
```

- [ ] **Step 2: Two projects in parallel**

```bash
mkdir -p /tmp/kx-a /tmp/kx-b
cd /tmp/kx-a && kortext start .           # scaffolds + launches on 3200, opens browser
cd /tmp/kx-b && kortext start .           # scaffolds + launches on 3201
kortext list                              # shows both, ports 3200/3201, running
```
Expected: two daemons, two ports, both reachable in the browser. `kortext stop` ends both; `kortext list` shows them stopped; `kortext start kx-a` relaunches on the SAME port (3200).

- [ ] **Step 3: remove / purge**

```bash
kortext remove kx-a     # gone from list, /tmp/kx-a/.kortext still exists
kortext purge kx-b      # asks y/N, then /tmp/kx-b/.kortext deleted
```

- [ ] **Step 4:** Document any defects found; fix in a follow-up task before publishing. Then `npm publish` (separate, deliberate step — not automated here).

---

## Self-Review (done by plan author)

**Spec coverage (DECISIONS Bölüm 0 → tasks):**
- 0.4 nine commands → Tasks 3-7 (start/stop/pause/list/remove/purge/update/doctor[existing]/help). ✅
- 0.5 remove vs purge as separate commands + purge confirm → Task 5 + Task 7 Step 3. ✅
- registry `~/.kortext/projects.json` → Task 1. ✅
- daemon lifecycle (start/stop/pause) → Tasks 2-4. ✅
- 0.2 postinstall → Task 8 (adapted to per-port: message, not auto-daemon — documented why). ✅
- 0.3 native folder picker → **intentionally out of scope for model A** (CLI takes a path arg; existing onboarding `pick-directory` still serves the web flow). Noted, not silently dropped.
- 0.1 multi-project URL routing → **replaced by per-project-port** (Eray's choice A) — the whole point of this plan. ✅
- v3.0.1 EADDRINUSE → Task 9. ✅
- release flow → Tasks 10-11. ✅

**Type consistency:** `ProjectEntry`/`Registry` shapes are defined in Task 1 and used unchanged in Tasks 3-5. `resolveDaemonCommand` return type (Task 2) is consumed by `startProject` (Task 3). `StartTarget`/`StartResult` defined and used within Task 3. Registry fns (`readRegistry`/`writeRegistry`/`upsertProject`/`getProject`/`listProjects`/`removeProject`/`registerProject`) defined in Task 1, consumed in 3-5. No signature drift.

**Parallelization (for subagent execution):** Tasks 1-2 are the foundation (sequential, 2 before 3). After Task 2, Tasks 3/4/5/6 are **independent** (each its own files + tests; all depend only on 1-2) → can run as parallel subagents. Task 7 (bin wiring) depends on 3-6. Tasks 8/9 are independent of everything → parallel anytime. Tasks 10-11 are last (gate + release). Suggested wave plan: **Wave 1:** T1→T2 (sequential). **Wave 2 (parallel):** T3, T4, T5, T6, T8, T9. **Wave 3:** T7. **Wave 4:** T10, T11.
