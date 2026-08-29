import type Database from 'better-sqlite3';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { Project } from './db.js';

// Live workspace inside a registered repo — sealed layout (DECISIONS §19):
//   AGENTS.md            (repo root — the agent's entry contract)
//   .kortext/*.md        (the living core: STACK, SECURITY, …, DECISIONS, TODO)
//   .kortext/foundation/ (frozen starting docs: BRD, PRD, TRD, PFD, backlog.yaml)
//   .kortext/reports/    (human-facing outputs)
// Workflows, personas and report templates are NOT copied — the agent gets
// them from the kortext package over MCP.
export const BRIEF_REL = join('.kortext', 'foundation', 'BRD.md');

export function scaffoldProject(repoPath: string, pkgRoot: string): void {
  const kx = join(repoPath, '.kortext');
  migrateLegacyLayout(kx);
  mkdirSync(join(kx, 'foundation'), { recursive: true });
  mkdirSync(join(kx, 'reports'), { recursive: true });

  const templates = join(pkgRoot, 'templates');
  copyIfMissing(join(templates, 'AGENTS.md'), join(repoPath, 'AGENTS.md'));
  copyDirIfMissing(join(templates, 'core'), kx);
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

// One-time sweep for projects scaffolded before the flat layout: reference
// docs move up to the root, memory/TODO + decisions survive, package-content
// copies (workflows, agents, templates) disappear.
function migrateLegacyLayout(kx: string): void {
  const refs = join(kx, 'references');
  if (existsSync(refs)) {
    for (const f of readdirSync(refs).filter((f) => f.endsWith('.md'))) {
      if (!existsSync(join(kx, f))) renameSync(join(refs, f), join(kx, f));
    }
    rmSync(refs, { recursive: true, force: true });
  }
  const memory = join(kx, 'memory');
  if (existsSync(memory)) {
    const moves: Array<[string, string]> = [
      ['TODO.md', 'TODO.md'],
      ['decisions.md', 'DECISIONS.md'],
    ];
    for (const [from, to] of moves) {
      if (existsSync(join(memory, from)) && !existsSync(join(kx, to))) {
        renameSync(join(memory, from), join(kx, to));
      }
    }
    rmSync(memory, { recursive: true, force: true });
  }
  for (const dir of ['workflows', 'agents', 'templates']) {
    rmSync(join(kx, dir), { recursive: true, force: true });
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

// The user picks the project folder themselves (Browse or typed path) —
// kortext scaffolds INTO it, never invents a subfolder. mkdir is a no-op on
// an existing folder and forgives a not-yet-created typed path.
// kind decides which analysis workflow the project follows:
// 'new' → new-project-analysis, 'existing' → existing-project-analysis.
export function createProject(
  db: Database.Database,
  input: { name: string; repoPath: string; kind?: 'new' | 'existing'; brief?: string },
  pkgRoot: string,
): Project {
  const name = input.name.trim();
  const repoPath = input.repoPath.trim();
  const kind = input.kind === 'existing' ? 'existing' : 'new';
  if (!name) throw new Error('name is required');
  if (!repoPath) throw new Error('repoPath is required');
  mkdirSync(repoPath, { recursive: true });
  scaffoldProject(repoPath, pkgRoot);
  const brief = input.brief?.trim();
  if (brief) {
    // The prime wrote (or uploaded) the brief in the add form — their own
    // content needs no separate approval round, it lands approved.
    writeFileSync(
      join(repoPath, BRIEF_REL),
      `---\nstatus: approved\nauthor: +prime\napprover: +prime\n---\n\n${brief}\n`,
      'utf8',
    );
  }
  const row = db
    .prepare('INSERT INTO projects (name, repo_path, kind) VALUES (?, ?, ?) RETURNING *')
    .get(name, repoPath, kind) as Project;
  return row;
}

// Unregister only — never touches files in the repo.
export function removeProject(db: Database.Database, id: number): boolean {
  return db.prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
}
