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
