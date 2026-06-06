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
