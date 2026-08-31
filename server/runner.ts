import type Database from 'better-sqlite3';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

// All currently producible docs: unwritten, inputs settled, not already
// being written. Dependency-depth order (listDocs is sorted).
export function producibleSteps(db: Database.Database, project: Project, pkgRoot: string): DocStep[] {
  const running = new Set(
    (db
      .prepare("SELECT doc_rel FROM jobs WHERE project_id = ? AND status = 'running'")
      .all(project.id) as { doc_rel: string }[]).map((r) => r.doc_rel),
  );
  const docs = listDocs(db, project, pkgRoot);
  const map = loadDocMap(pkgRoot, project.kind ?? 'new');
  const steps: DocStep[] = [];
  for (const doc of docs) {
    if (doc.status !== 'uninitialized' || doc.blocked || running.has(doc.rel)) continue;
    const step = map.get(doc.rel);
    if (step) steps.push(step);
  }
  return steps;
}

export function nextStep(db: Database.Database, project: Project, pkgRoot: string): DocStep | null {
  if (runningJob(db, project.id)) return null;
  return producibleSteps(db, project, pkgRoot)[0] ?? null;
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
    '- Language: write the document in the language of .kortext/foundation/BRD.md; if there is no BRD (existing project), match the language of the already-approved .kortext documents, else the language of the repo README; default to English.',
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

// The chain: keep every currently-unblocked step running IN PARALLEL (capped)
// until nothing is producible (waiting on approvals) or everything in flight
// settles. Approval routes call this again, so the flow self-advances gate by
// gate. One loop per project at a time; failed steps stay visible for Retry.
// projectId → wake(): an approval that lands while the loop is parked in
// Promise.race nudges it to re-scan immediately (a mid-run unlock must not
// wait for a completion when the pool has room).
const advancing = new Map<number, () => void>();
const MAX_PARALLEL = 3;

// Live spawn registry — pause/restart/cancel abort every running CLI for the
// project (SIGTERM→SIGKILL via cli-spawn) instead of letting it finish and
// rewrite files that were just wiped.
const liveRuns = new Map<number, Set<AbortController>>();
function trackRun(projectId: number): { ctrl: AbortController; done: () => void } {
  const ctrl = new AbortController();
  let set = liveRuns.get(projectId);
  if (!set) liveRuns.set(projectId, (set = new Set()));
  set.add(ctrl);
  return {
    ctrl,
    done: () => {
      set.delete(ctrl);
      if (set.size === 0) liveRuns.delete(projectId);
    },
  };
}
export function abortRuns(projectId: number): void {
  for (const c of liveRuns.get(projectId) ?? []) c.abort();
}

export async function advance(
  db: Database.Database,
  project: Project,
  engine: EngineSpec,
  pkgRoot: string,
): Promise<void> {
  const active = advancing.get(project.id);
  if (active) {
    active(); // already looping — just wake it to re-scan
    return;
  }
  let wake = () => {};
  const arm = () => new Promise<void>((resolve) => (wake = resolve));
  advancing.set(project.id, () => wake());
  try {
    const inFlight = new Set<Promise<unknown>>();
    for (;;) {
      // Paused = don't start new steps; running ones finish and the loop exits.
      const paused = (db.prepare('SELECT paused FROM projects WHERE id = ?').get(project.id) as
        | { paused: number }
        | undefined)?.paused;
      const room = paused ? 0 : MAX_PARALLEL - inFlight.size;
      if (room > 0) {
        for (const step of producibleSteps(db, project, pkgRoot).slice(0, room)) {
          const p = runStep(db, project, step, engine, pkgRoot).finally(() => inFlight.delete(p));
          inFlight.add(p);
        }
      }
      if (inFlight.size === 0) return; // nothing running, nothing producible
      await Promise.race([...inFlight, arm()]); // completion OR an approval nudge
    }
  } finally {
    advancing.delete(project.id);
  }
}

// Human asked for changes on a written doc: re-run its producing step with
// the notes attached. The engine rewrites the file back to draft.
export async function reviseDoc(
  db: Database.Database,
  project: Project,
  rel: string,
  notes: string[],
  engine: EngineSpec,
  pkgRoot: string,
): Promise<RunOutcome> {
  const step = loadDocMap(pkgRoot, project.kind ?? 'new').get(rel);
  if (!step) return { ok: false, error: `no producing step for ${rel}` };
  if (runningJob(db, project.id)) return { ok: false, error: 'a step is already running' };
  const out = await runStep(db, project, step, engine, pkgRoot, notes);
  if (out.ok) await advance(db, project, engine, pkgRoot);
  return out;
}

// Line-anchored Q&A: the author persona answers about its own document.
// Nothing is written anywhere — the answer lives only in the panel.
export async function explainDoc(
  project: Project,
  rel: string,
  excerpt: string,
  question: string,
  history: Array<{ q: string; a: string }>,
  engine: EngineSpec,
  pkgRoot: string,
): Promise<{ answer: string }> {
  const map = loadDocMap(pkgRoot, project.kind ?? 'new');
  const author = map.get(rel)?.author ?? '+agent';
  const prompt = [
    `You are ${author}, the author of the document .kortext/${rel} in this project.`,
    'The human reviewer selected a passage and is having an inline conversation about it.',
    'Answer briefly and concretely in the language of the question.',
    'DO NOT modify, create or write any file — reply with the answer text only.',
    '',
    `SELECTED PASSAGE:\n${excerpt || '(whole document)'}`,
    ...(history.length > 0
      ? ['', 'CONVERSATION SO FAR:', ...history.flatMap((h) => [`Q: ${h.q}`, `A: ${h.a}`])]
      : []),
    '',
    `QUESTION:\n${question}`,
  ].join('\n');
  const res = await spawnCli({
    binary: engine.binary,
    args: engine.args,
    cwd: project.repo_path,
    stdin: prompt,
    logPath: join(homedir(), '.kortext', 'logs', `p${project.id}-explain.log`),
    signal: new AbortController().signal,
    timeoutMs: 3 * 60 * 1000,
  });
  if (res.exitCode !== 0) {
    throw new Error(`${engine.id} CLI failed: ${(res.stderrTail || res.stdoutTail).trim().slice(-300)}`);
  }
  return { answer: res.stdoutTail.trim() };
}

// "Kopeng'e aktar" = split the work into Version → Epic → Task files under
// .kopeng/ (the draft export contract kopeng will consume). One big engine
// run, tracked as a 'plan' job; revise notes re-run it.
export async function runPlanning(
  db: Database.Database,
  project: Project,
  engine: EngineSpec,
  pkgRoot: string,
  reviseNotes: string[] = [],
): Promise<RunOutcome> {
  const job = db
    .prepare("INSERT INTO jobs (project_id, doc_rel, kind) VALUES (?, '.kopeng/', 'plan') RETURNING *")
    .get(project.id) as Job;
  const workflow = readFileSync(join(pkgRoot, 'workflows', 'planning-pipeline.md'), 'utf8');
  const lines = [
    'You are executing the Kortext task-split flow, headless, inside the project folder.',
    `Project: ${project.name} — project code: ${project.code || 'PROJ'} (use it as the id prefix).`,
    '',
    'HARD RULES:',
    '- Write ONLY files under .kopeng/ (create the directory tree) and append to .kortext/DECISIONS.md.',
    '- Follow the workflow below EXACTLY — file layout, task body sections, id convention.',
    '- Read the approved .kortext/ documents listed as inputs before splitting.',
    '- project.yaml must end with status: draft — the human approves it in the panel.',
    '- Language: write task/epic/version prose in the same language as the .kortext documents.',
    '',
    'WORKFLOW:',
    workflow.trim(),
  ];
  if (reviseNotes.length > 0) {
    lines.push(
      '',
      'REVISION REQUEST — the human reviewed the current plan and asks for changes.',
      'Rewrite the .kopeng/ files addressing EVERY note (keep what was not objected to):',
      ...reviseNotes.map((n) => `- ${n}`),
    );
  }
  const settle = (status: 'done' | 'failed', error?: string): RunOutcome => {
    db.prepare(
      "UPDATE jobs SET status = ?, error = ?, finished_at = datetime('now') WHERE id = ?",
    ).run(status, error ?? null, job.id);
    return status === 'done' ? { ok: true } : { ok: false, error };
  };
  const run = trackRun(project.id);
  try {
    const res = await spawnCli({
      binary: engine.binary,
      args: engine.args,
      cwd: project.repo_path,
      stdin: lines.join('\n'),
      logPath: join(homedir(), '.kortext', 'logs', `p${project.id}-plan.log`),
      signal: run.ctrl.signal,
      timeoutMs: 30 * 60 * 1000,
    });
    if (res.aborted) return settle('failed', 'stopped (pause/restart/cancel)');
    if (res.exitCode !== 0) {
      return settle(
        'failed',
        `${engine.id} CLI failed (exit ${res.exitCode}): ${(res.stderrTail || res.stdoutTail).trim().slice(-400) || 'no output'}`,
      );
    }
    const kopeng = join(project.repo_path, '.kopeng');
    if (!existsSync(join(kopeng, 'project.yaml'))) {
      return settle('failed', 'engine finished without producing .kopeng/project.yaml');
    }
    let taskCount = 0;
    try {
      taskCount = readdirSync(join(kopeng, 'tasks')).filter((f) => f.endsWith('.md')).length;
    } catch {
      /* no tasks dir */
    }
    if (taskCount === 0) return settle('failed', '.kopeng/tasks/ is empty — no tasks produced');
    return settle('done');
  } catch (err) {
    return settle('failed', (err as Error).message);
  } finally {
    run.done();
  }
}

// A server restart orphans 'running' rows — settle them so Retry works.
export function failStaleJobs(db: Database.Database): void {
  db.prepare(
    "UPDATE jobs SET status = 'failed', error = 'kortext restarted mid-step — retry', finished_at = datetime('now') WHERE status = 'running'",
  ).run();
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

  const run = trackRun(project.id);
  try {
    const res = await spawnCli({
      binary: engine.binary,
      args: engine.args,
      cwd: project.repo_path,
      stdin: prompt,
      logPath,
      signal: run.ctrl.signal,
      timeoutMs: STEP_TIMEOUT_MS,
    });
    if (res.aborted) return settle('failed', 'stopped (pause/restart/cancel)');
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
  } finally {
    run.done();
  }
}
