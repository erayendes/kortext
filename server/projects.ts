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
//   .kortext/*.md        (the living core: STACK, SECURITY, …, TODO)
//   .kortext/foundation/ (frozen starting docs: BRD, PRD, TRD, PFD)
// Workflows and personas are NOT copied — kortext itself drives the engine
// with them during Phase A; after the handshake the docs are the contract.
export const BRIEF_REL = join('.kortext', 'foundation', 'BRD.md');

export function scaffoldProject(repoPath: string, pkgRoot: string, opts: { skipBrief?: boolean } = {}): void {
  const kx = join(repoPath, '.kortext');
  migrateLegacyLayout(kx);
  mkdirSync(join(kx, 'foundation'), { recursive: true });

  const templates = join(pkgRoot, 'templates');
  installContract(repoPath, templates);
  copyDirIfMissing(join(templates, 'core'), kx);
  for (const doc of ['PRD.md', 'TRD.md', 'PFD.md']) {
    copyIfMissing(join(templates, 'foundation', doc), join(kx, 'foundation', doc));
  }

  if (opts.skipBrief) return;
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

// ---------------------------------------------------------------------------
// The handover contract
// ---------------------------------------------------------------------------
// A repo may already carry an AGENTS.md the user wrote themselves, so the
// contract goes in as a MARKED BLOCK rather than a file: their text survives,
// re-scaffolding refreshes only the block, and cancel takes back exactly what
// kortext wrote. Claude Code reads CLAUDE.md rather than AGENTS.md, so when that
// file exists it gets a one-line pointer — the contract itself stays in one
// place, and two copies can never drift apart.
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
    writeFileSync(path, current.slice(0, start) + block + current.slice(end + BLOCK_END.length), 'utf8');
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

/** Cancel: give the repo back exactly as it was, minus kortext's own writing. */
export function uninstallContract(repoPath: string): void {
  removeContractBlock(join(repoPath, 'AGENTS.md'));
  removePointer(join(repoPath, 'CLAUDE.md'));
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
    // DECISIONS.md is no longer a kortext artifact, but a legacy project may
    // carry one — move it up rather than deleting it with the folder.
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
// Derives ACME-style code from the name when none is given.
export function deriveCode(name: string): string {
  const cleaned = name
    .toUpperCase()
    .replace(/[ÇĞİIÖŞÜ]/g, (c) => 'CGIIOSU'['ÇĞİIÖŞÜ'.indexOf(c)] ?? c)
    .replace(/[^A-Z0-9]/g, '');
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
  const repoPath = input.repoPath.trim();
  const kind = input.kind === 'existing' ? 'existing' : 'new';
  const code = (input.code ?? '').trim().toUpperCase() || deriveCode(name);
  if (!name) throw new Error('name is required');
  if (!repoPath) throw new Error('repoPath is required');
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(code)) {
    throw new Error(`code must be 2-8 chars, A-Z then A-Z0-9 (got: ${code})`);
  }
  const codeTaken = db
    .prepare('SELECT name FROM projects WHERE code = ?')
    .get(code) as { name: string } | undefined;
  if (codeTaken) {
    throw new Error(
      `The code ${code} already belongs to "${codeTaken.name}" — task ids carry it, so two projects cannot share one. Pick another, or remove that project first.`,
    );
  }
  const taken = db
    .prepare('SELECT name, archived FROM projects WHERE repo_path = ?')
    .get(repoPath) as { name: string; archived: number } | undefined;
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
    // The prime wrote (or uploaded) this, so submitting it IS the approval —
    // nothing is judged at Initialize. The gate reads it when the chain is
    // first entered, and demotes it back to a draft if it cannot start.
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
    .get(name, repoPath, kind, code, (input.docLang ?? '').trim(), (input.engine ?? '').trim()) as Project;
  return row;
}

// Out of the way, not gone: the row stays, the repo is untouched, and the
// panel folds it into its own group.
export function setArchived(db: Database.Database, id: number, archived: boolean): boolean {
  return db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id)
    .changes > 0;
}

// Unregister only — never touches files in the repo.
export function removeProject(db: Database.Database, id: number): boolean {
  return db.prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
}
