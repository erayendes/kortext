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
