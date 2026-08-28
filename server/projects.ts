import type Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Project } from './db.js';

// Live workspace layout inside a registered repo. The brief IS the BRD
// (v1 convention: .kortext/foundation/BRD.md with a status frontmatter).
export const WORKSPACE_DIRS = ['foundation', 'references', 'reports', 'memory', 'workflows', 'agents'] as const;
export const BRIEF_REL = join('.kortext', 'foundation', 'BRD.md');

// Copies the self-contained working set into the repo so the external agent
// needs nothing but the repo itself: contract at the root, process definitions
// and personas under .kortext/, doc skeletons with status: uninitialized.
// Idempotent — existing files are never overwritten.
export function scaffoldProject(repoPath: string, pkgRoot: string): void {
  const kx = join(repoPath, '.kortext');
  for (const dir of WORKSPACE_DIRS) mkdirSync(join(kx, dir), { recursive: true });

  const templates = join(pkgRoot, 'templates');
  copyIfMissing(join(templates, 'AGENTS.md'), join(repoPath, 'AGENTS.md'));
  copyDirIfMissing(join(pkgRoot, 'workflows'), join(kx, 'workflows'));
  copyDirIfMissing(join(pkgRoot, 'agents'), join(kx, 'agents'));
  copyDirIfMissing(join(templates, 'references'), join(kx, 'references'));
  copyDirIfMissing(join(templates, 'memory'), join(kx, 'memory'));
  mkdirSync(join(kx, 'templates', 'reports'), { recursive: true });
  copyDirIfMissing(join(templates, 'reports'), join(kx, 'templates', 'reports'));
  for (const doc of ['PRD.md', 'TRD.md', 'PFD.md']) {
    copyIfMissing(join(templates, 'foundation', doc), join(kx, 'foundation', doc));
  }

  const brief = join(repoPath, BRIEF_REL);
  if (!existsSync(brief)) {
    const template = join(templates, 'foundation', 'BRD.md');
    if (existsSync(template)) {
      copyFileSync(template, brief);
      forceStatus(brief, 'draft');
    } else {
      writeFileSync(brief, '---\nstatus: draft\n---\n\n# BRD\n', 'utf8');
    }
  }
}

function copyIfMissing(from: string, to: string): void {
  if (existsSync(from) && !existsSync(to)) copyFileSync(from, to);
}

function copyDirIfMissing(fromDir: string, toDir: string): void {
  if (!existsSync(fromDir)) return;
  for (const entry of readdirSync(fromDir, { withFileTypes: true })) {
    if (entry.isFile()) copyIfMissing(join(fromDir, entry.name), join(toDir, entry.name));
  }
}

// A freshly scaffolded brief always starts as draft, whatever the template says.
function forceStatus(path: string, status: string): void {
  const body = readFileSync(path, 'utf8');
  if (/^status:/m.test(body)) {
    writeFileSync(path, body.replace(/^status:.*$/m, `status: ${status}`), 'utf8');
  } else if (body.startsWith('---\n')) {
    writeFileSync(path, body.replace('---\n', `---\nstatus: ${status}\n`), 'utf8');
  } else {
    writeFileSync(path, `---\nstatus: ${status}\n---\n\n${body}`, 'utf8');
  }
}

export function listProjects(db: Database.Database): Project[] {
  return db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as Project[];
}

export function createProject(
  db: Database.Database,
  input: { name: string; repoPath: string; mode: 'new' | 'existing' },
  pkgRoot: string,
): Project {
  const name = input.name.trim();
  const repoPath = input.repoPath.trim();
  if (!name) throw new Error('name is required');
  if (!repoPath) throw new Error('repoPath is required');
  if (input.mode === 'existing' && !existsSync(repoPath)) {
    throw new Error(`repoPath does not exist: ${repoPath}`);
  }
  if (input.mode === 'new') mkdirSync(repoPath, { recursive: true });
  scaffoldProject(repoPath, pkgRoot);
  const row = db
    .prepare('INSERT INTO projects (name, repo_path) VALUES (?, ?) RETURNING *')
    .get(name, repoPath) as Project;
  return row;
}

// Unregister only — never touches files in the repo.
export function removeProject(db: Database.Database, id: number): boolean {
  return db.prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
}
