import type Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Project } from './db.js';
import { spawnCli } from './cli-spawn.js';
import type { EngineSpec } from './engines.js';
import { listDocs, loadDocMap, readFrontmatter, workflowNameFor, type DocStep } from './docs.js';

export interface Job {
  id: number;
  project_id: number;
  doc_rel: string;
  kind: string;
  status: 'running' | 'done' | 'failed';
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

const STEP_TIMEOUT_MS = 15 * 60 * 1000;

export function listJobs(db: Database.Database, projectId: number): Job[] {
  return db
    .prepare('SELECT * FROM jobs WHERE project_id = ? ORDER BY id DESC LIMIT 50')
    .all(projectId) as Job[];
}

export function runningJob(db: Database.Database, projectId: number): Job | undefined {
  return db
    .prepare("SELECT * FROM jobs WHERE project_id = ? AND status = 'running' LIMIT 1")
    .get(projectId) as Job | undefined;
}

// Next producible doc: unwritten, inputs all approved, nothing running.
// listDocs is dependency-depth sorted, so the first hit is the right one.
export function nextStep(db: Database.Database, project: Project, pkgRoot: string): DocStep | null {
  if (runningJob(db, project.id)) return null;
  const docs = listDocs(db, project, pkgRoot);
  const map = loadDocMap(pkgRoot, project.kind ?? 'new');
  for (const doc of docs) {
    if (doc.status !== 'uninitialized' || doc.blocked) continue;
    const step = map.get(doc.rel);
    if (step) return step;
  }
  return null;
}

// Builds the headless step prompt. The CLI runs inside the project folder, so
// the prompt points at files rather than inlining them.
export function buildStepPrompt(
  project: Project,
  step: DocStep,
  workflowStepText: string,
  personaBody: string | null,
  reviseNotes: string[] = [],
): string {
  const lines = [
    'You are executing ONE step of a Kortext analysis flow, headless, inside the project folder.',
    `Project: ${project.name} (kind: ${project.kind ?? 'new'}).`,
    '',
    'HARD RULES:',
    `- Produce EXACTLY this file and nothing else: .kortext/${step.output}`,
    '- Fill the skeleton template already at that path (keep its section spirit, replace placeholder content).',
    `- Frontmatter must end up as: status: draft, author: ${step.author ?? '+agent'}${step.approver ? `, approver: ${step.approver}` : ''}.`,
    '- NEVER set status to approved — approval belongs to the human.',
    '- Read the step inputs before writing; stay consistent with them:',
    ...step.inputs.map((i) => `    .kortext/${i}`),
    '- If this document clearly does not apply to the project, write it with status: not-applicable and one line saying why.',
    '- Record any significant decision you make in .kortext/DECISIONS.md (prepend, keep older entries).',
    '- Communication language inside the document: the language of the brief/BRD.',
    '',
    'STEP DEFINITION (from the workflow):',
    workflowStepText.trim(),
  ];
  if (personaBody) {
    lines.push('', 'AUTHOR PERSONA PERSPECTIVE:', personaBody.trim());
  }
  if (reviseNotes.length > 0) {
    lines.push(
      '',
      'REVISION REQUEST — the human reviewed the current draft and asks for changes.',
      'Rewrite the document addressing EVERY note below (keep what was not objected to):',
      ...reviseNotes.map((n) => `- ${n}`),
    );
  }
  return lines.join('\n');
}

// Extracts the numbered step block for an output from the workflow markdown —
// the same text a human reads, handed to the engine verbatim.
export function stepTextFor(pkgRoot: string, project: Project, outputRel: string): string {
  const wf = readFileSync(
    join(pkgRoot, 'workflows', `${workflowNameFor(project.kind ?? 'new')}.md`),
    'utf8',
  );
  const blocks = wf.split(/\n(?=\d+\. \*\*\+)/);
  return (
    blocks.find((b) => b.includes(`\`.kortext/${outputRel}\``) && /- outputs:/.test(b)) ?? ''
  );
}

export function personaBodyFor(pkgRoot: string, step: DocStep): string | null {
  if (!step.author) return null;
  const p = join(pkgRoot, 'agents', `${step.author.replace(/^\+/, '')}.md`);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

export interface RunOutcome {
  ok: boolean;
  error?: string;
}

// Runs one step to completion and settles the job row. Sequential by design:
// callers guard with runningJob() first.
export async function runStep(
  db: Database.Database,
  project: Project,
  step: DocStep,
  engine: EngineSpec,
  pkgRoot: string,
  reviseNotes: string[] = [],
): Promise<RunOutcome> {
  const job = db
    .prepare('INSERT INTO jobs (project_id, doc_rel) VALUES (?, ?) RETURNING *')
    .get(project.id, step.output) as Job;

  const prompt = buildStepPrompt(
    project,
    step,
    stepTextFor(pkgRoot, project, step.output),
    personaBodyFor(pkgRoot, step),
    reviseNotes,
  );
  const logPath = join(homedir(), '.kortext', 'logs', `p${project.id}-${step.output.replace(/\//g, '_')}.log`);

  const settle = (status: 'done' | 'failed', error?: string): RunOutcome => {
    db.prepare(
      "UPDATE jobs SET status = ?, error = ?, finished_at = datetime('now') WHERE id = ?",
    ).run(status, error ?? null, job.id);
    return status === 'done' ? { ok: true } : { ok: false, error };
  };

  try {
    const res = await spawnCli({
      binary: engine.binary,
      args: engine.args,
      cwd: project.repo_path,
      stdin: prompt,
      logPath,
      signal: new AbortController().signal,
      timeoutMs: STEP_TIMEOUT_MS,
    });
    const outPath = join(project.repo_path, '.kortext', step.output);
    if (res.exitCode !== 0) {
      return settle(
        'failed',
        `${engine.id} CLI failed (exit ${res.exitCode}): ${(res.stderrTail || res.stdoutTail).trim().slice(-400) || 'no output'}`,
      );
    }
    if (!existsSync(outPath)) {
      return settle('failed', `engine finished without producing ${step.output}`);
    }
    const status = readFrontmatter(readFileSync(outPath, 'utf8')).status;
    if (status !== 'draft' && status !== 'not-applicable') {
      return settle('failed', `${step.output} written but status is '${status}' (expected draft)`);
    }
    return settle('done');
  } catch (err) {
    return settle('failed', (err as Error).message);
  }
}
