import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnCli } from './cli-spawn.js';
import type { Project } from './db.js';
import { readFrontmatter } from './docs.js';
import type { EngineSpec } from './engines.js';

// One gate, at the head of the chain. A brief that names nothing produces
// documents that invent everything, so the whole flow — not each step — is
// what refuses to start. Two stages: a countable floor (cheap, deterministic,
// runs on every check) and, only if the floor passes, one engine judgment
// (cached per brief version, so approving a document does not re-spend it).

export interface Readiness {
  ready: boolean;
  /** Which stage produced the verdict; 'error' means the check itself failed. */
  stage: 'floor' | 'judgment' | 'error';
  /** What the brief must answer before the analysis can start. */
  questions: string[];
  briefHash: string;
  checkedAt: string;
}

const CACHE_REL = join('.kortext', '.readiness.json');
const JUDGMENT_TIMEOUT_MS = 5 * 60 * 1000;

// The skeleton's own four asks, kept in the order the template lists them.
// A floor failure quotes these rather than inventing new questions.
const BRIEF_SECTIONS: Array<{ heading: RegExp; ask: string }> = [
  { heading: /vision|goal/i, ask: 'Product Vision & Goals — what is this product, and why does it exist?' },
  { heading: /audience|persona/i, ask: 'Target Audience & Personas — who is it for?' },
  { heading: /kpi|performance indicator/i, ask: 'Key Performance Indicators — what does success look like?' },
  { heading: /scope/i, ask: 'Future Scope & Out of Scope — what is deliberately not in it?' },
];

// Below this many characters of real prose the brief is a name, not a brief.
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
 * Stage one. Counts what the brief actually says, ignoring the skeleton it
 * was poured into. Pure and un-gameable by an eager persona — a one-word
 * brief never reaches the judgment that would rationalize writing anyway.
 */
export function assessBrief(content: string): { ok: boolean; questions: string[] } {
  const body = stripFrontmatter(content);
  const lines = body.split('\n');
  const prose = lines.filter((l) => !isSkeletonLine(l)).join(' ').trim();

  // Which of the template's sections carry at least one line of real content.
  const answered = new Set<string>();
  let current: string | null = null;
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      current = BRIEF_SECTIONS.find((s) => s.heading.test(heading[1]))?.ask ?? null;
      continue;
    }
    if (current && !isSkeletonLine(line)) answered.add(current);
  }

  const unanswered = BRIEF_SECTIONS.filter((s) => !answered.has(s.ask)).map((s) => s.ask);
  if (prose.length >= MIN_BODY_CHARS && unanswered.length === 0) return { ok: true, questions: [] };
  return { ok: false, questions: unanswered.length > 0 ? unanswered : BRIEF_SECTIONS.map((s) => s.ask) };
}

function briefPath(project: Project): string {
  return join(project.repo_path, '.kortext', 'foundation', 'BRD.md');
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
    'Read ONLY this file: .kortext/foundation/BRD.md',
    '',
    'Decide ONE thing: does this brief say enough for an analysis team to write a product',
    'requirements document, a tech stack and a security model WITHOUT inventing the product?',
    'A brief that names the project but not what it does, who it is for, or what problem it',
    'solves is NOT enough. Neither is one whose sections restate the template questions.',
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
 * holds. `existing` projects have no brief and are never gated here.
 */
export async function ensureReadiness(
  project: Project,
  engine: EngineSpec,
  signal?: AbortSignal,
): Promise<Readiness> {
  const running = inFlight.get(project.id);
  if (running) return running;
  const p = check(project, engine, signal).finally(() => inFlight.delete(project.id));
  inFlight.set(project.id, p);
  return p;
}

async function check(
  project: Project,
  engine: EngineSpec,
  signal?: AbortSignal,
): Promise<Readiness> {
  const path = briefPath(project);
  const content = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const briefHash = createHash('sha256').update(content).digest('hex').slice(0, 16);
  const checkedAt = new Date().toISOString();
  const verdict = (v: Omit<Readiness, 'briefHash' | 'checkedAt'>): Readiness =>
    write(project, { ...v, briefHash, checkedAt });

  // Not approved yet — the human is still writing it. No engine call, no cache
  // entry to invalidate later.
  if (readFrontmatter(content).status !== 'approved') {
    return { ready: false, stage: 'floor', questions: [], briefHash, checkedAt };
  }

  const cached = readReadiness(project);
  if (cached && cached.briefHash === briefHash && cached.stage !== 'error') return cached;

  const floor = assessBrief(content);
  if (!floor.ok) return verdict({ ready: false, stage: 'floor', questions: floor.questions });

  const logPath = join(homedir(), '.kortext', 'logs', `p${project.id}-readiness.log`);
  try {
    const res = await spawnCli({
      binary: engine.binary,
      args: engine.args,
      cwd: project.repo_path,
      stdin: buildJudgmentPrompt(project),
      logPath,
      signal: signal ?? new AbortController().signal,
      timeoutMs: JUDGMENT_TIMEOUT_MS,
    });
    if (res.aborted) {
      return { ready: false, stage: 'error', questions: [], briefHash, checkedAt };
    }
    // The engine writes the verdict into the same file this module caches in,
    // so re-read it and keep only the two fields it owns.
    const written = readReadiness(project) as Partial<Readiness> | null;
    if (!written || typeof written.ready !== 'boolean') {
      return verdict({
        ready: false,
        stage: 'error',
        questions: ['The readiness check did not complete — press Start to run it again.'],
      });
    }
    return verdict({
      ready: written.ready,
      stage: 'judgment',
      questions: written.ready ? [] : (written.questions ?? []).slice(0, 6),
    });
  } catch {
    return verdict({
      ready: false,
      stage: 'error',
      questions: ['The readiness check did not complete — press Start to run it again.'],
    });
  }
}
