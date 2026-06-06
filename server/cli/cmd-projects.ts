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
