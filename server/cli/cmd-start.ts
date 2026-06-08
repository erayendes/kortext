import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import {
  readRegistry, writeRegistry, registerProject, getProject, upsertProject,
  listProjects, defaultRegistryDir, type Registry, type ProjectEntry,
} from '../registry/projects.ts';
import { withRegistryLock } from '../registry/lock.ts';
import { resolveDaemonCommand, spawnDaemon, isPidAlive } from '../registry/daemon.ts';
import { readProjectMeta } from '../blueprint/io.ts';
import { isKortextPackageDir } from '../registry/self-guard.ts';

export type StartTarget =
  | { kind: 'existing'; slug: string }
  | { kind: 'new-path'; path: string }
  | { kind: 'list' }
  | { kind: 'onboard' }
  | { kind: 'self' }
  | { kind: 'not-found'; arg: string };

/**
 * Decide what `start [arg]` means. `exists`, `isSelf`, and `registryDir` are
 * injectable for tests.
 *   - `isSelf` guards against binding Kortext's OWN package dir as a project —
 *     its dev/demo `.kortext/` would otherwise be mistaken for a user project.
 *   - `registryDir` (default `~/.kortext`) lets us reject the HOME directory:
 *     its `.kortext` IS the global registry, not a project. Without this, a bare
 *     `kortext start` from home scaffolds home as a project named after the home
 *     folder and pollutes the registry dir (UAT 2026-06-08 #4).
 */
export function resolveStartTarget(
  reg: Registry,
  arg: string | undefined,
  cwd: string,
  exists: (p: string) => boolean = existsSync,
  isSelf: (dir: string) => boolean = (dir) => isKortextPackageDir(dir),
  registryDir: string = defaultRegistryDir(),
): StartTarget {
  // A directory whose `.kortext` resolves to the global registry dir is the
  // user's home — never a project root.
  const isRegistryHome = (dir: string) =>
    resolve(join(dir, '.kortext')) === resolve(registryDir);
  const listOrOnboard = (): StartTarget =>
    listProjects(reg).length > 0 ? { kind: 'list' } : { kind: 'onboard' };

  if (arg) {
    const bySlug = getProject(reg, arg);
    if (bySlug) return { kind: 'existing', slug: bySlug.slug };
    const asPath = isAbsolute(arg) ? arg : resolve(cwd, arg);
    if (isSelf(asPath)) return { kind: 'self' };
    if (isRegistryHome(asPath)) return listOrOnboard();
    if (exists(asPath)) {
      const registered = listProjects(reg).find((p) => p.path === asPath);
      return registered ? { kind: 'existing', slug: registered.slug } : { kind: 'new-path', path: asPath };
    }
    return { kind: 'not-found', arg };
  }
  // No arg: prefer the cwd if it is a kortext project — but the home dir's
  // .kortext is the GLOBAL REGISTRY, not a project, so never bind it.
  if (exists(join(cwd, '.kortext')) && !isRegistryHome(cwd)) {
    if (isSelf(cwd)) return { kind: 'self' };
    const registered = listProjects(reg).find((p) => p.path === cwd);
    return registered ? { kind: 'existing', slug: registered.slug } : { kind: 'new-path', path: cwd };
  }
  return listOrOnboard();
}

export type StartResult =
  | { ok: true; slug: string; port: number; url: string; reused: boolean }
  | { ok: false; action: 'list' | 'onboard' | 'not-found' | 'dev-mode' | 'self'; message: string };

export type StartDeps = {
  packageRoot: string;
  cwd: string;
  registryDir?: string;
  /** init a new project root (scaffold .kortext) — defaults to the real initCommand. */
  init?: (path: string) => { ok: boolean; errorMessage?: string };
  spawn?: (cmd: ReturnType<typeof resolveDaemonCommand>) => number;
  now?: () => number;
  /** Preferred port for a NEW project (e.g. one already probed OS-free). */
  port?: number;
};

/** Launch (or relaunch) a project's daemon. */
export function startProject(arg: string | undefined, deps: StartDeps): StartResult {
  const registryDir = deps.registryDir ?? defaultRegistryDir();
  const now = deps.now ?? (() => Date.now());
  const spawnFn = deps.spawn ?? spawnDaemon;

  // Read + resolve outside the lock for cheap early-exit (list/onboard/not-found).
  const regPre = readRegistry(registryDir);
  const target = resolveStartTarget(regPre, arg, deps.cwd, existsSync, undefined, registryDir);

  if (target.kind === 'list') return { ok: false, action: 'list', message: 'Pick a project to start.' };
  if (target.kind === 'onboard') return { ok: false, action: 'onboard', message: 'No project here yet — run onboarding.' };
  if (target.kind === 'not-found') return { ok: false, action: 'not-found', message: `No project '${target.arg}'.` };
  if (target.kind === 'self')
    return {
      ok: false,
      action: 'self',
      message:
        "That folder is Kortext's own program directory — it can't be a project. cd into (or pick) a separate, empty folder for your project.",
    };

  // new-path scaffold step (pure FS, no registry mutation) can run before the lock.
  if (target.kind === 'new-path' && !existsSync(join(target.path, '.kortext'))) {
    const initFn = deps.init;
    if (initFn) {
      const r = initFn(target.path);
      if (!r.ok) return { ok: false, action: 'not-found', message: r.errorMessage ?? 'init failed' };
    }
  }

  return withRegistryLock(registryDir, () => {
    // Re-read inside the lock to get the authoritative state.
    let reg = readRegistry(registryDir);
    let entry: ProjectEntry;

    if (target.kind === 'existing') {
      entry = getProject(reg, target.slug)!;
    } else {
      // new-path: register (allocate port) and immediately persist.
      const meta = readProjectMeta(join(target.path, '.kortext', 'project.json'));
      const reg2 = registerProject(reg, {
        code: meta?.code ?? '', name: meta?.name ?? '', path: target.path, now: now(), port: deps.port,
      });
      reg = reg2.reg;
      entry = reg2.entry;
      // Persist registration before spawn so a spawn failure doesn't lose it.
      writeRegistry(registryDir, reg);
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
  });
}
