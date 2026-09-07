import type Database from 'better-sqlite3';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { Project } from './db.js';

// Live workspace inside a registered repo:
//   AGENTS.md      (repo root — the agent's entry contract)
//   .kortext/*.md  (every document, one flat shelf, in the order they are written)
// Workflows and personas are NOT copied — kortext itself drives the engine
// with them during the analysis; after the handshake the docs are the contract.
export const BRIEF_REL = join('.kortext', 'BRIEF.md');

// Resolve existing ancestors too, so a new folder below a symlink has one identity.
function canonicalRepo(path: string): string {
  const absolute = resolve(path);
  return existsSync(absolute)
    ? realpathSync.native(absolute)
    : join(canonicalRepo(dirname(absolute)), basename(absolute));
}

export function scaffoldProject(
  repoPath: string,
  pkgRoot: string,
  opts: { skipBrief?: boolean } = {},
): void {
  const kx = join(repoPath, '.kortext');
  mkdirSync(kx, { recursive: true });

  const templates = join(pkgRoot, 'templates');
  installContract(repoPath, templates);
  // Initialize the brief separately so an empty template always starts as draft.
  copyDirIfMissing(join(templates, 'docs'), kx, new Set(['BRIEF.md']));

  if (opts.skipBrief) return;
  const brief = join(repoPath, BRIEF_REL);
  if (!existsSync(brief)) {
    const template = join(templates, 'docs', 'BRIEF.md');
    if (existsSync(template)) {
      copyFileSync(template, brief);
      forceStatus(brief, 'draft');
    } else {
      writeFileSync(brief, '---\nstatus: draft\n---\n\n# Brief\n', 'utf8');
    }
  }
}

// ---------------------------------------------------------------------------
// The handover contract
// ---------------------------------------------------------------------------
// Keep the contract in a marked AGENTS.md block to preserve user content.
// Add a pointer to an existing CLAUDE.md rather than duplicating the contract.
const BLOCK_START = '<!-- kortext:start -->';
const BLOCK_END = '<!-- kortext:end -->';
const POINTER = '<!-- kortext --> Read AGENTS.md and the .kortext/ docs before any work.';

export function writeContractBlock(path: string, body: string): void {
  const block = `${BLOCK_START}\n${body.trim()}\n${BLOCK_END}`;
  if (!existsSync(path)) {
    writeFileSync(path, `${block}\n`, 'utf8');
    return;
  }
  const current = readFileSync(path, 'utf8');
  // The panel re-scaffolds on every poll; an unchanged block is not rewritten.
  if (current.includes(block)) return;
  const start = current.indexOf(BLOCK_START);
  const end = current.indexOf(BLOCK_END);
  if (start !== -1 && end > start) {
    writeFileSync(
      path,
      current.slice(0, start) + block + current.slice(end + BLOCK_END.length),
      'utf8',
    );
    return;
  }
  writeFileSync(path, `${current.replace(/\s*$/, '')}\n\n${block}\n`, 'utf8');
}

/** Takes back only kortext's block. A file that held anything else stays. */
export function removeContractBlock(path: string): void {
  if (!existsSync(path)) return;
  const current = readFileSync(path, 'utf8');
  const start = current.indexOf(BLOCK_START);
  const end = current.indexOf(BLOCK_END);
  if (start === -1 || end < start) return; // not ours — never written by kortext
  const rest = (current.slice(0, start) + current.slice(end + BLOCK_END.length)).trim();
  if (rest === '') rmSync(path, { force: true });
  else writeFileSync(path, `${rest}\n`, 'utf8');
}

function writePointer(path: string): void {
  if (!existsSync(path)) return; // kortext never invents another tool's memory file
  const current = readFileSync(path, 'utf8');
  if (current.includes('<!-- kortext -->')) return;
  writeFileSync(path, `${current.replace(/\s*$/, '')}\n\n${POINTER}\n`, 'utf8');
}

function removePointer(path: string): void {
  if (!existsSync(path)) return;
  const kept = readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => !l.includes('<!-- kortext -->'));
  writeFileSync(path, `${kept.join('\n').replace(/\s*$/, '')}\n`, 'utf8');
}

function installContract(repoPath: string, templates: string): void {
  const template = join(templates, 'AGENTS.md');
  if (!existsSync(template)) return;
  writeContractBlock(join(repoPath, 'AGENTS.md'), readFileSync(template, 'utf8'));
  writePointer(join(repoPath, 'CLAUDE.md'));
}

/** Remove the Kortext contract block and CLAUDE.md pointer, preserving user content. */
export function uninstallContract(repoPath: string): void {
  removeContractBlock(join(repoPath, 'AGENTS.md'));
  removePointer(join(repoPath, 'CLAUDE.md'));
}

function copyIfMissing(from: string, to: string): void {
  if (existsSync(from) && !existsSync(to)) copyFileSync(from, to);
}

function copyDirIfMissing(fromDir: string, toDir: string, skip = new Set<string>()): void {
  if (!existsSync(fromDir)) return;
  for (const entry of readdirSync(fromDir, { withFileTypes: true })) {
    if (entry.isFile() && !skip.has(entry.name)) {
      copyIfMissing(join(fromDir, entry.name), join(toDir, entry.name));
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

// Derive an uppercase project code from the name when no code is supplied.
export function deriveCode(name: string): string {
  // Strip digits so derived codes pass the same validation as user-supplied codes.
  const cleaned = name
    .toUpperCase()
    .replace(/[ÇĞİIÖŞÜ]/g, (c) => 'CGIIOSU'['ÇĞİIÖŞÜ'.indexOf(c)] ?? c)
    .replace(/[^A-Z]/g, '');
  return (cleaned.slice(0, 5) || 'PROJ').padEnd(2, 'X');
}

export function createProject(
  db: Database.Database,
  input: {
    name: string;
    repoPath: string;
    kind?: 'new' | 'existing';
    code?: string;
    brief?: string;
    docLang?: string;
    engine?: string;
  },
  pkgRoot: string,
): Project {
  const name = input.name.trim();
  // Compare real filesystem identities, including older registry entries that
  // stored an alias, before another project can own and reset these documents.
  const repoPath = input.repoPath.trim() ? canonicalRepo(input.repoPath.trim()) : '';
  const kind = input.kind === 'existing' ? 'existing' : 'new';
  const code = (input.code ?? '').trim().toUpperCase() || deriveCode(name);
  if (!name) throw new Error('name is required');
  if (!repoPath) throw new Error('repoPath is required');
  if (!/^[A-Z]{2,8}$/.test(code)) {
    throw new Error(`code must be 2-8 letters, A-Z (got: ${code})`);
  }
  const codeTaken = db.prepare('SELECT name FROM projects WHERE code = ?').get(code) as
    { name: string } | undefined;
  if (codeTaken) {
    throw new Error(
      `The code ${code} already belongs to "${codeTaken.name}" — task ids carry it, so two projects cannot share one. Pick another, or remove that project first.`,
    );
  }
  const taken = listProjects(db).find((p) => canonicalRepo(p.repo_path) === repoPath);
  if (taken) {
    throw new Error(
      taken.archived
        ? `This folder is already the archived project "${taken.name}" — unarchive it instead of adding it again.`
        : `This folder is already the project "${taken.name}".`,
    );
  }
  mkdirSync(repoPath, { recursive: true });
  // existing projects take no brief — the ground truth is the code itself
  scaffoldProject(repoPath, pkgRoot, { skipBrief: kind === 'existing' });
  const brief = input.brief?.trim();
  if (brief) {
    // Treat a submitted brief as approved; readiness is checked on Start and may demote it to draft.
    writeFileSync(
      join(repoPath, BRIEF_REL),
      `---\nstatus: approved\nauthor: +prime\napprover: +prime\n---\n\n${brief}\n`,
      'utf8',
    );
  }
  const row = db
    .prepare(
      'INSERT INTO projects (name, repo_path, kind, code, doc_lang, engine) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
    )
    .get(
      name,
      repoPath,
      kind,
      code,
      (input.docLang ?? '').trim(),
      (input.engine ?? '').trim(),
    ) as Project;
  return row;
}

// Archive without deleting the registry row or project files.
export function setArchived(db: Database.Database, id: number, archived: boolean): boolean {
  return (
    db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id).changes >
    0
  );
}

// Unregister only — never touches files in the repo.
export function removeProject(db: Database.Database, id: number): boolean {
  return db.prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
}
