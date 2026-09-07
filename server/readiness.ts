import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnCli } from './cli-spawn.js';
import { logPathFor, type Project } from './db.js';
import { readFrontmatter, setFrontmatterStatus } from './docs.js';
import type { EngineSpec } from './engines.js';

// Gate analysis on project evidence. New projects need a local content check and a CLI
// judgment cached by brief version; existing projects require source files only.

export interface Readiness {
  ready: boolean;
  /**
   * Which stage produced the verdict. 'error' means the check itself failed;
   * 'no-engine' means there is no agent CLI to run anything with.
   */
  stage: 'floor' | 'judgment' | 'error' | 'no-engine';
  /** What the brief must answer before the analysis can start. */
  questions: string[];
  briefHash: string;
  checkedAt: string;
}

const CACHE_REL = join('.kortext', '.readiness.json');
const JUDGMENT_TIMEOUT_MS = 5 * 60 * 1000;

// Use the template questions in their original order when the local content check fails.
const BRIEF_SECTIONS: Array<{ heading: RegExp; ask: string }> = [
  {
    heading: /vision|goal/i,
    ask: 'Product Vision & Goals — what is this product, and why does it exist?',
  },
  { heading: /audience|persona/i, ask: 'Target Audience & Personas — who is it for?' },
  {
    heading: /language|locali[sz]|locale/i,
    ask: 'Interface Language — which language does the product speak to its users, and is more than one in scope?',
  },
  {
    heading: /kpi|performance indicator/i,
    ask: 'Key Performance Indicators — what does success look like?',
  },
  { heading: /scope/i, ask: 'Future Scope & Out of Scope — what is deliberately not in it?' },
];

// Minimum non-placeholder prose length for the brief.
const MIN_BODY_CHARS = 240;

function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content;
  const end = content.indexOf('\n---', 3);
  return end === -1 ? content : content.slice(end + 4);
}

// Skeleton lines are not content: headings announce a section, and a bracket
// line ("- [What is out of scope?]") is the template asking the question the
// brief was supposed to answer.
function isSkeletonLine(line: string): boolean {
  const t = line.trim();
  return t === '' || t.startsWith('#') || t.startsWith('>') || /^[-*]?\s*\[[^\]]*\]$/.test(t);
}

/**
 * Check prose length after excluding headings and template placeholders.
 * Require populated template sections only when most English template headings are present;
 * briefs using other headings are assessed by prose length and the later CLI judgment.
 */
export function assessBrief(content: string): { ok: boolean; questions: string[] } {
  const body = stripFrontmatter(content);
  const lines = body.split('\n');
  const prose = lines
    .filter((l) => !isSkeletonLine(l))
    .join(' ')
    .trim();
  const allAsks = BRIEF_SECTIONS.map((s) => s.ask);

  if (prose.length < MIN_BODY_CHARS) return { ok: false, questions: allAsks };

  // Which of the template's sections are present, and which carry content.
  const present = new Set<string>();
  const answered = new Set<string>();
  let current: string | null = null;
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      current = BRIEF_SECTIONS.find((s) => s.heading.test(heading[1]))?.ask ?? null;
      if (current) present.add(current);
      continue;
    }
    if (current && !isSkeletonLine(line)) answered.add(current);
  }

  // Require most template headings to match before reporting missing sections.
  // This avoids treating incidental heading matches in other languages as an incomplete template.
  const templateShaped = present.size >= BRIEF_SECTIONS.length - 1;
  if (!templateShaped) return { ok: true, questions: [] };

  const unanswered = BRIEF_SECTIONS.filter((s) => !answered.has(s.ask)).map((s) => s.ask);
  return unanswered.length === 0
    ? { ok: true, questions: [] }
    : { ok: false, questions: unanswered };
}

// Directories that are never the project's own work.
const IGNORED_DIRS = new Set([
  '.git',
  '.kortext',
  '.kopeng',
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  'coverage',
  'vendor',
  '.venv',
  '__pycache__',
  'Pods',
]);

// Stop counting source files once the minimum evidence threshold is reached.
export function countSourceFiles(root: string, limit: number): number {
  let seen = 0;
  const walk = (dir: string): void => {
    if (seen >= limit) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable directory is not evidence
    }
    for (const entry of entries) {
      if (seen >= limit) return;
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      if (entry.isDirectory()) walk(join(dir, entry.name));
      else if (entry.isFile() && entry.name !== 'AGENTS.md') seen++;
    }
  };
  walk(root);
  return seen;
}

const MIN_SOURCE_FILES = 3;

function briefPath(project: Project): string {
  return join(project.repo_path, '.kortext', 'BRIEF.md');
}

function cachePath(project: Project): string {
  return join(project.repo_path, CACHE_REL);
}

export function readReadiness(project: Project): Readiness | null {
  const p = cachePath(project);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Readiness;
  } catch {
    return null;
  }
}

function write(project: Project, verdict: Readiness): Readiness {
  writeFileSync(cachePath(project), `${JSON.stringify(verdict, null, 2)}\n`, 'utf8');
  return verdict;
}

function buildJudgmentPrompt(project: Project): string {
  return [
    'You are the readiness gate of a Kortext analysis flow, running headless inside the project folder.',
    `Project: ${project.name}.`,
    '',
    'Read ONLY this file: .kortext/BRIEF.md',
    '',
    'Decide ONE thing: does this brief say enough for an analysis team to write a product',
    'requirements document, a tech stack and a security model WITHOUT inventing the product?',
    'A brief that names the project but not what it does, who it is for, what problem it',
    'solves, or which language it speaks to its users is NOT enough. Neither is one whose',
    'sections restate the template questions.',
    '',
    'Err towards not-ready. Producing documents from an empty brief is the failure this gate exists to prevent;',
    'asking the human one more question is not a failure.',
    '',
    'Write EXACTLY this file and nothing else: .kortext/.readiness.json',
    'It must be valid JSON with this shape:',
    '  { "ready": true }',
    'or, when the brief is not enough:',
    '  { "ready": false, "questions": ["...", "..."] }',
    '',
    'Each question is one plain sentence naming what the brief must answer. Ask at most six.',
    'Ask only about what is genuinely missing — never restate something the brief already answers.',
    'Write the questions in the language of the brief.',
    'Do not write, edit or create any other file. Do not start the analysis.',
  ].join('\n');
}

// One judgment per brief version at a time; approvals fan into advance() from
// several routes and must not each spend an engine run.
const inFlight = new Map<number, Promise<Readiness>>();

/** True while the judgment run for this project is still out. */
export function isChecking(projectId: number): boolean {
  return inFlight.has(projectId);
}

/**
 * The gate. Returns the cached verdict when the brief has not changed since it
 * was made, otherwise re-runs: floor first, engine judgment only if the floor
 * holds and the project is a new one.
 */
export async function ensureReadiness(
  db: Database.Database,
  project: Project,
  engine: EngineSpec,
  signal: AbortSignal,
): Promise<Readiness> {
  const running = inFlight.get(project.id);
  if (running) return running;
  const p = check(db, project, engine, signal).finally(() => inFlight.delete(project.id));
  inFlight.set(project.id, p);
  return p;
}

async function check(
  db: Database.Database,
  project: Project,
  engine: EngineSpec,
  signal: AbortSignal,
): Promise<Readiness> {
  const path = briefPath(project);
  const content = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const briefHash = createHash('sha256').update(content).digest('hex').slice(0, 16);
  const checkedAt = new Date().toISOString();
  const verdict = (v: Omit<Readiness, 'briefHash' | 'checkedAt'>): Readiness =>
    write(project, { ...v, briefHash, checkedAt });

  // An existing project has no brief: the code is the evidence. Cheap enough to
  // recompute every time, so adding files opens the gate with no cache to clear.
  if ((project.kind ?? 'new') === 'existing') {
    if (countSourceFiles(project.repo_path, MIN_SOURCE_FILES) >= MIN_SOURCE_FILES) {
      return verdict({ ready: true, stage: 'floor', questions: [] });
    }
    return verdict({
      ready: false,
      stage: 'floor',
      questions: [
        'This folder holds almost no code, so there is nothing to analyse yet.',
        'Point the project at the repository you want documented — or add it as a new project and write a brief instead.',
      ],
    });
  }

  // Not approved yet — the human is still writing it. No engine call, no cache
  // entry to invalidate later.
  if (readFrontmatter(content).status !== 'approved') {
    return { ready: false, stage: 'floor', questions: [], briefHash, checkedAt };
  }

  // Demote a refused brief to draft so it requires human review before another judgment.
  const refuse = (v: Omit<Readiness, 'briefHash' | 'checkedAt'>): Readiness => {
    setFrontmatterStatus(path, 'draft');
    return verdict(v);
  };

  const floor = assessBrief(content);
  if (!floor.ok) return refuse({ ready: false, stage: 'floor', questions: floor.questions });

  const cached = readReadiness(project);
  if (cached && cached.briefHash === briefHash && cached.stage === 'judgment') return cached;

  const logPath = logPathFor(db, `p${project.id}-readiness.log`);
  // Delete the cached verdict before the CLI writes its replacement. Otherwise a failed run
  // could reuse an old ready=true result under the new brief hash.
  rmSync(cachePath(project), { force: true });
  try {
    const res = await spawnCli({
      binary: engine.binary,
      args: engine.args,
      cwd: project.repo_path,
      stdin: buildJudgmentPrompt(project),
      logPath,
      signal,
      timeoutMs: JUDGMENT_TIMEOUT_MS,
    });
    if (res.aborted) {
      return { ready: false, stage: 'error', questions: [], briefHash, checkedAt };
    }
    // A CLI that exits non-zero has not judged anything, whatever is on disk.
    if (res.exitCode !== 0) {
      return verdict({
        ready: false,
        stage: 'error',
        questions: [
          `The readiness check could not run (${engine.id} exited ${res.exitCode}).`,
          'Press Start to run it again.',
        ],
      });
    }
    // Re-read what this run wrote — the file was removed above, so anything
    // here came from the run that just finished.
    const written = readReadiness(project) as Partial<Readiness> | null;
    if (!written || typeof written.ready !== 'boolean') {
      return verdict({
        ready: false,
        stage: 'error',
        questions: ['The readiness check did not complete — press Start to run it again.'],
      });
    }
    if (written.ready) return verdict({ ready: true, stage: 'judgment', questions: [] });
    return refuse({
      ready: false,
      stage: 'judgment',
      questions: (written.questions ?? []).slice(0, 6),
    });
  } catch {
    return verdict({
      ready: false,
      stage: 'error',
      questions: ['The readiness check did not complete — press Start to run it again.'],
    });
  }
}
