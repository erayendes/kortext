import type Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Project } from './db.js';

// Live workspace layout inside a registered repo. The brief IS the BRD
// (v1 convention: .kortext/foundation/BRD.md with a status frontmatter).
export const WORKSPACE_DIRS = ['foundation', 'references', 'reports'] as const;
export const BRIEF_REL = join('.kortext', 'foundation', 'BRD.md');

export function scaffoldProject(repoPath: string, templatesDir: string): void {
  for (const dir of WORKSPACE_DIRS) mkdirSync(join(repoPath, '.kortext', dir), { recursive: true });
  const brief = join(repoPath, BRIEF_REL);
  if (!existsSync(brief)) {
    const template = join(templatesDir, 'foundation', 'BRD.md');
    if (existsSync(template)) {
      copyFileSync(template, brief);
      forceStatus(brief, 'draft');
    } else {
      writeFileSync(brief, '---\nstatus: draft\n---\n\n# BRD\n', 'utf8');
    }
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
  templatesDir: string,
): Project {
  const name = input.name.trim();
  const repoPath = input.repoPath.trim();
  if (!name) throw new Error('name is required');
  if (!repoPath) throw new Error('repoPath is required');
  if (input.mode === 'existing' && !existsSync(repoPath)) {
    throw new Error(`repoPath does not exist: ${repoPath}`);
  }
  if (input.mode === 'new') mkdirSync(repoPath, { recursive: true });
  scaffoldProject(repoPath, templatesDir);
  const row = db
    .prepare('INSERT INTO projects (name, repo_path) VALUES (?, ?) RETURNING *')
    .get(name, repoPath) as Project;
  return row;
}

// Unregister only — never touches files in the repo.
export function removeProject(db: Database.Database, id: number): boolean {
  return db.prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
}
