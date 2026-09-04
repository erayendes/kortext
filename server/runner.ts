import type Database from 'better-sqlite3';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Project } from './db.js';
import { spawnCli } from './cli-spawn.js';
import type { EngineSpec } from './engines.js';
import {
  docPath,
  listDocs,
  loadDocMap,
  readFrontmatter,
  workflowNameFor,
  type DocStep,
} from './docs.js';
import { ensureReadiness } from './readiness.js';

export interface Job {
  id: number;
  project_id: number;
  doc_rel: string;
  kind: string;
  status: 'running' | 'done' | 'failed' | 'stopped';
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

/** Is this one document being written right now? */
export function runningDoc(db: Database.Database, projectId: number, rel: string): boolean {
  return (
    db
      .prepare("SELECT 1 FROM jobs WHERE project_id = ? AND doc_rel = ? AND status = 'running'")
      .get(projectId, rel) !== undefined
  );
}

// All currently producible docs: unwritten, inputs settled, not already
// being written. Dependency-depth order (listDocs is sorted).
export function producibleSteps(
  db: Database.Database,
  project: Project,
  pkgRoot: string,
): DocStep[] {
  const running = new Set(
    (
      db
        .prepare("SELECT doc_rel FROM jobs WHERE project_id = ? AND status = 'running'")
        .all(project.id) as { doc_rel: string }[]
    ).map((r) => r.doc_rel),
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
    'FIRST DECIDE SCOPE, THEN WRITE:',
    '- Read the step inputs first. They are the only evidence you have:',
    ...step.inputs.map((i) => `    .kortext/${i}`),
    "- Decide whether this document applies to THIS project, using the step's `n/a when` condition. If it is met, write the file with status: not-applicable and one line saying why, and stop. That is a complete, correct outcome — not a gap and not a failure.",
    '- If it applies, write only what the inputs support. Where they are silent, say so and leave the question to prime; never fill a section by assuming what the product is probably like.',
    "- Every question you leave for the human goes under the document's `## Open Questions for prime` heading, one `- ` item each, and nowhere else. Leave that section empty when there is nothing to ask — an empty section is the signal that the document stands on its own.",
    '- When an ALREADY-WRITTEN document must change because of what you found, that is not prose: put one line under `## Revision Requests`, starting with the target file in backticks — `` - `ENVIRONMENT.md` — the access-log lines must follow the no-logs decision `` — and say what must change and why. The panel turns each line into an action the human can take; a demand written anywhere else in the document is a demand nobody can act on. Leave the section empty when nothing upstream needs to change.',
    '',
    'HARD RULES:',
    `- Produce EXACTLY this file and nothing else: .kortext/${step.output}`,
    '- Fill the skeleton template already at that path: keep its section headings VERBATIM, replace the placeholder content under them.',
    `- Frontmatter must end up as: status: draft, author: ${step.author ?? '+agent'}${step.approver ? `, approver: ${step.approver}` : ''}.`,
    '- NEVER set status to approved — approval belongs to the human.',
    project.doc_lang
      ? `- Document language: write the PROSE in ${project.doc_lang}. This is prime's stated choice — it overrides the language of the inputs, the repository and the README.`
      : '- Document language: write the PROSE in the language of .kortext/foundation/BRD.md; if there is no BRD (existing project), match the language of the already-approved .kortext documents, else the language of the repo README; default to English.',
    "- ENGLISH ALWAYS, whatever the document language: the section headings (they are structure, and other documents cite them by name), code and code samples, identifiers, file and folder names, commands, environment-variable names, database table and column names, API paths and field names, branch and commit conventions, and every frontmatter key. Only the prose under the headings is written in the brief's language — never translate a name something is called by.",
    "- Product copy is the one exception: strings a user of the product will read (microcopy, error messages, page copy, email text) are written in the product's interface language from the brief — which may differ from the language of this document.",
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
      'Rewrite the document addressing EVERY note below (keep what was not objected to).',
      'A note is written in `[the line it was left on] the note`. When that line is one of your own',
      'open questions, the note IS the answer: fold it into the document as a settled fact, in the',
      'section where it belongs, and DELETE that question from `## Open Questions for prime`. An',
      'answered question is not restated, not moved, and not kept "for reference" — it is gone, and',
      'the fact it established is now part of the document. Keep only the questions still unanswered;',
      'if none remain, leave the section empty.',
      '',
      'NOTES:',
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
  return blocks.find((b) => b.includes(`\`.kortext/${outputRel}\``) && /- outputs:/.test(b)) ?? '';
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
  // The readiness gate. A project whose evidence says nothing must produce
  // nothing: no step starts until there is a brief worth analysing, or code to
  // read. For a new project the verdict is cached per brief version, so this
  // costs one engine run per edit of the brief, not one per approval.
  if (!(await ensureReadiness(project, engine)).ready) return;
  let wake = () => {};
  const arm = () => new Promise<void>((resolve) => (wake = resolve));
  advancing.set(project.id, () => wake());
  try {
    const inFlight = new Set<Promise<unknown>>();
    for (;;) {
      // Paused = don't start new steps; running ones finish and the loop exits.
      const paused = (
        db.prepare('SELECT paused FROM projects WHERE id = ?').get(project.id) as
          { paused: number } | undefined
      )?.paused;
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
// Callers fire this and forget it, so a refusal before `runStep` opens a job row
// is a refusal nobody can see. Leave the row ourselves: the panel shows a failed
// step, which is the truth, instead of a document that quietly never moved.
function refuse(db: Database.Database, project: Project, rel: string, error: string): RunOutcome {
  db.prepare(
    "INSERT INTO jobs (project_id, doc_rel, status, error, finished_at) VALUES (?, ?, 'failed', ?, datetime('now'))",
  ).run(project.id, rel, error);
  return { ok: false, error };
}

export async function reviseDoc(
  db: Database.Database,
  project: Project,
  rel: string,
  notes: string[],
  engine: EngineSpec,
  pkgRoot: string,
): Promise<RunOutcome> {
  const step = loadDocMap(pkgRoot, project.kind ?? 'new').get(rel);
  if (!step) return refuse(db, project, rel, `no producing step for ${rel}`);
  // Refusing while ANY step ran meant answering the second of two documents
  // did nothing: the first revision was still writing, so the second was
  // dropped and its questions stayed open. Only this document blocks itself.
  if (runningDoc(db, project.id, rel)) {
    return refuse(db, project, rel, `${rel} is already being rewritten — wait for it to land`);
  }
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
    throw new Error(
      `${engine.id} CLI failed: ${(res.stderrTail || res.stdoutTail).trim().slice(-300)}`,
    );
  }
  return { answer: res.stdoutTail.trim() };
}

// ---------------------------------------------------------------------------
// Re-reading a document against an input that moved
// ---------------------------------------------------------------------------

/** Appends one demand under the source's `## Revision Requests` heading. */
export function appendRevisionRequest(
  project: Project,
  sourceRel: string,
  targetRel: string,
  reason: string,
): void {
  const path = docPath(project, sourceRel);
  const lines = readFileSync(path, 'utf8').split('\n');
  const target = targetRel.replace(/^foundation\//, '');
  const line = `- \`${target}\` — ${reason.replace(/\s+/g, ' ').trim()}`;
  const head = lines.findIndex((l) => /^#{1,6}\s+Revision Requests\s*$/i.test(l));
  if (head === -1) {
    // No section to file it under: give the document one rather than dropping
    // a finding the panel would then never surface.
    lines.push('', '## Revision Requests', '', line);
  } else {
    let end = head + 1;
    while (end < lines.length && !/^#{1,6}\s/.test(lines[end])) end++;
    // Past the last item of the section, before the next heading.
    let at = end;
    while (at > head + 1 && lines[at - 1].trim() === '') at--;
    lines.splice(at, 0, line);
  }
  writeFileSync(path, lines.join('\n'), 'utf8');
}

/**
 * One reader, one moved input. The engine only judges — the server writes the
 * demand, so a verdict cannot arrive as prose nobody can act on.
 */
async function runRecheck(
  db: Database.Database,
  project: Project,
  readerRel: string,
  sourceRel: string,
  engine: EngineSpec,
): Promise<void> {
  const job = db
    .prepare("INSERT INTO jobs (project_id, doc_rel, kind) VALUES (?, ?, 'recheck') RETURNING *")
    .get(project.id, readerRel) as Job;
  const settle = (status: 'done' | 'failed', error?: string) =>
    db
      .prepare("UPDATE jobs SET status = ?, error = ?, finished_at = datetime('now') WHERE id = ?")
      .run(status, error ?? null, job.id);
  const verdictRel = `.kortext/.recheck-${readerRel.replace(/[^A-Za-z0-9]/g, '-')}.json`;
  const verdictPath = join(project.repo_path, verdictRel);
  rmSync(verdictPath, { force: true });
  const prompt = [
    `.kortext/${sourceRel} has just been rewritten and approved. .kortext/${readerRel} was written against the OLD text and is still approved.`,
    '',
    'Read both. Decide ONE thing: does the reader now say something the new source contradicts, or leave out something the new source requires?',
    '',
    'HARD RULES:',
    `- Write your verdict to ${verdictRel} and NOTHING else. Modify no document.`,
    '- Shape: { "needsChange": true|false, "reason": "one sentence naming what must change in the reader and why" }',
    '- `needsChange: false` is the normal answer. Say true only for a real contradiction or a real gap — not for wording you would have phrased differently.',
    '- The reason is read by the human as a demand on the reader, so write it in the language of the documents.',
  ].join('\n');
  try {
    const res = await spawnCli({
      binary: engine.binary,
      args: engine.args,
      cwd: project.repo_path,
      stdin: prompt,
      logPath: join(homedir(), '.kortext', 'logs', `p${project.id}-recheck.log`),
      signal: new AbortController().signal,
      timeoutMs: 5 * 60 * 1000,
    });
    if (res.exitCode !== 0 || !existsSync(verdictPath)) {
      settle('failed', `${engine.id} returned no verdict for ${readerRel}`);
      return;
    }
    const verdict = JSON.parse(readFileSync(verdictPath, 'utf8')) as {
      needsChange?: boolean;
      reason?: string;
    };
    rmSync(verdictPath, { force: true });
    if (verdict.needsChange && (verdict.reason ?? '').trim()) {
      appendRevisionRequest(project, sourceRel, readerRel, String(verdict.reason));
    }
    settle('done');
  } catch (err) {
    rmSync(verdictPath, { force: true });
    settle('failed', (err as Error).message);
  }
}

/**
 * A document was approved after being rewritten. Every approved document that
 * reads it was written against the old text, so each is judged against the new
 * one. On the first pass nothing downstream is approved yet, so this is silent
 * until a document is genuinely revised.
 */
export function recheckDependents(
  db: Database.Database,
  project: Project,
  sourceRel: string,
  engine: EngineSpec,
  pkgRoot: string,
): void {
  const readers = listDocs(db, project, pkgRoot).filter(
    (d) =>
      d.status === 'approved' && d.inputs.includes(sourceRel) && !runningDoc(db, project.id, d.rel),
  );
  for (const r of readers) void runRecheck(db, project, r.rel, sourceRel, engine);
}

// A revision the human applies. The document nobody's step produces — the brief
// — cannot be sent back to an author, but the change another document asked for
// is still concrete work. So the engine drafts it and writes NOTHING the human
// keeps: the proposal lands in a scratch file, is read once, and is deleted.
// Applying it is the ordinary save the human already performs by hand.
export async function proposeRevision(
  project: Project,
  rel: string,
  notes: string[],
  engine: EngineSpec,
  pkgRoot: string,
): Promise<{ proposal: string }> {
  const scratch = join(project.repo_path, '.kortext', '.proposal.txt');
  // ponytail: .txt, not .md — listDocs scans .kortext/*.md and would list it as a document
  rmSync(scratch, { force: true });
  const author = loadDocMap(pkgRoot, project.kind ?? 'new').get(rel)?.author ?? '+agent';
  const prompt = [
    `Another document has asked .kortext/${rel} to change. Draft that change.`,
    ...(author !== '+agent'
      ? [`Write as ${author}, but the document belongs to the human — you propose, they decide.`]
      : []),
    '',
    'HARD RULES:',
    `- Read .kortext/${rel}. Write the FULL revised document to .kortext/.proposal.txt — the whole file, frontmatter included, not a fragment and not a diff.`,
    '- Touch NO other file. Do not modify the document itself; the human applies your draft.',
    '- Keep the frontmatter exactly as it is, including the status line.',
    '- Keep every section heading verbatim, and keep the document in its own language.',
    '- Change ONLY what the requests below ask for. Everything they do not mention stays word for word.',
    '',
    'REQUESTS:',
    ...notes.map((n) => `- ${n}`),
  ].join('\n');
  const res = await spawnCli({
    binary: engine.binary,
    args: engine.args,
    cwd: project.repo_path,
    stdin: prompt,
    logPath: join(homedir(), '.kortext', 'logs', `p${project.id}-propose.log`),
    signal: new AbortController().signal,
    timeoutMs: 5 * 60 * 1000,
  });
  if (res.exitCode !== 0) {
    throw new Error(
      `${engine.id} CLI failed: ${(res.stderrTail || res.stdoutTail).trim().slice(-300)}`,
    );
  }
  if (!existsSync(scratch)) {
    throw new Error(`${engine.id} wrote no proposal — nothing was changed`);
  }
  const proposal = readFileSync(scratch, 'utf8');
  rmSync(scratch, { force: true });
  if (proposal.trim().length === 0) throw new Error('the proposal came back empty');
  return { proposal };
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
    .prepare(
      "INSERT INTO jobs (project_id, doc_rel, kind) VALUES (?, '.kopeng/', 'plan') RETURNING *",
    )
    .get(project.id) as Job;
  const workflow = readFileSync(join(pkgRoot, 'workflows', 'planning-pipeline.md'), 'utf8');
  const lines = [
    'You are executing the Kortext task-split flow, headless, inside the project folder.',
    `Project: ${project.name} — project code: ${project.code || 'PROJ'} (use it as the id prefix).`,
    '',
    'HARD RULES:',
    '- Write ONLY files under .kopeng/ (create the directory tree).',
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
  const settle = (status: 'done' | 'failed' | 'stopped', error?: string): RunOutcome => {
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
    if (res.aborted) return settle('stopped', 'stopped by pause/restart/cancel');
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

/**
 * Cancel promises to take back everything kortext wrote, and the logs are
 * kortext's writing too: without this they outlive the project they belong to,
 * in a directory nothing ever cleans.
 */
export function removeRunLogs(projectId: number, dir = join(homedir(), '.kortext', 'logs')): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // no logs directory yet
  }
  for (const f of entries.filter((f) => f.startsWith(`p${projectId}-`))) {
    rmSync(join(dir, f), { force: true });
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
  const logPath = join(
    homedir(),
    '.kortext',
    'logs',
    `p${project.id}-${step.output.replace(/\//g, '_')}.log`,
  );

  const settle = (status: 'done' | 'failed' | 'stopped', error?: string): RunOutcome => {
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
    if (res.aborted) return settle('stopped', 'stopped by pause/restart/cancel');
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
