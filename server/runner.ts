import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logPathFor, type Project } from './db.js';
import { spawnCli } from './cli-spawn.js';
import { detectEngines, engineArgs, engineEnv, type EngineSpec } from './engines.js';
import { writeDesignPreview } from './design-preview.js';
import {
  appendIncomingRequest,
  docPath,
  listDocs,
  loadDocMap,
  readFrontmatter,
  removeRequest,
  recordVersion,
  restoreRequests,
  setFrontmatterStatus,
  templateFor,
  unfilledPlaceholders,
  workflowNameFor,
  type DocStep,
} from './docs.js';
import { scaffoldProject } from './projects.js';
import { ensureReadiness } from './readiness.js';

export interface Job {
  id: number;
  project_id: number;
  doc_rel: string;
  kind: string;
  status: 'running' | 'done' | 'failed' | 'stopped';
  error: string | null;
  notes: string;
  started_at: string;
  finished_at: string | null;
}

const STEP_TIMEOUT_MS = 15 * 60 * 1000;
const PLAN_TIMEOUT_MS = 30 * 60 * 1000;

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
// The row as it stands now — engine and model can change while a chain runs,
// and each spawn should carry what the panel shows.
function liveProject(db: Database.Database, project: Project): Project {
  return (
    (db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id) as Project | undefined) ??
    project
  );
}

// A run that will write the document. A recheck only reads it, so prime may
// still edit while one runs — the verdict lands against whatever prime saved.
export function writingDoc(db: Database.Database, projectId: number, rel: string): boolean {
  return (
    db
      .prepare(
        "SELECT 1 FROM jobs WHERE project_id = ? AND doc_rel = ? AND status = 'running' AND kind != 'recheck'",
      )
      .get(projectId, rel) !== undefined
  );
}

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
  /** Change requests other documents made about this one before it existed. */
  waiting: Array<{ from: string; reason: string }> = [],
): string {
  const lines = [
    'You are executing ONE step of a Kortext analysis flow, headless, inside the project folder.',
    `Project: ${project.name} (kind: ${project.kind ?? 'new'}).`,
    '',
    'FIRST DECIDE SCOPE, THEN WRITE:',
    // An existing project's first step has no document inputs at all. Telling it
    // the inputs are the only evidence told it it had none, and it wrote the
    // document without opening the repository it was standing in.
    ...(step.inputs.length === 0
      ? [
          '- This step has NO document inputs. THE CODEBASE IN THIS FOLDER IS YOUR EVIDENCE. Read it before you write a line: source files, configuration, CI workflow files, migrations, the strings a user reads, package manifests. Record what is there. Absence of evidence is a finding, not a blank to fill.',
        ]
      : [
          '- Read the step inputs first:',
          ...step.inputs.map((i) => `    .kortext/${i}`),
          project.kind === 'existing'
            ? '- The codebase in this folder is evidence too, and it outranks the inputs where they disagree — the code is what the project actually does.'
            : '- They are the only evidence you have.',
        ]),
    "- Decide whether this document applies to THIS project, using the step's `n/a when` condition. If it is met, write the file with status: not-applicable and one line saying why, and stop. That is a complete, correct outcome — not a gap and not a failure. Leave nothing but the title and that one line: a skeleton of empty headings reads to the next author as work waiting to be done.",
    '- Write only what your evidence supports. Where it is silent, say so and leave the question to prime; never fill a section by assuming what the product is probably like.',
    '- You may write something you did not find but believe the project should have. Every such line starts with `**Suggestion —**` and says why you are proposing it. A line without that marker is a fact you observed. Writing a suggestion as a fact misleads everyone who later uses this document as a contract — a target, a threshold and a schedule are facts only if the evidence carries them.',
    "- Every question you leave for the human goes under the document's `## Questions for Prime` heading, one `- ` item each, and nowhere else. Leave that section empty when there is nothing to ask — an empty section is the signal that the document stands on its own.",
    '- A finding about something no document owns — a config file, a workflow, a tracked secret, a live endpoint — goes under `## Findings` in THIS document, one line each, starting with the path in backticks: `` - `.gitignore` — `.env` is tracked and holds live credentials ``. Do not aim a revision request at it: a demand can only ask a document to change, and one aimed anywhere else is a finding nobody can act on. Nothing under `.kortext/` is a finding: `.kortext/DESIGN.html` is the preview kortext itself renders from `DESIGN.md`, and the dot-files there are its own bookkeeping — generated, owned, and not yours to report.',
    '- When an ALREADY-WRITTEN document must change because of what you found, that is not prose: put one line under `## Change Requests`, starting with the target file in backticks — `` - `ENVIRONMENT.md` — the access-log lines must follow the no-logs decision `` — and say what must change and why. The panel turns each line into an action the human can take; a demand written anywhere else in the document is a demand nobody can act on. Leave the section empty when nothing upstream needs to change.',
    '- Under the same heading you will find lines that start with `from` — `` - [ ] from `STACK.md` — … ``. Those are the OTHER direction: what other documents asked of THIS one. They are not yours to write, reword or remove; the human decides them in the panel, and kortext ticks them. Keep every one of them exactly as it is. And read `## Decisions` before you write a request: each line there is a request the human has ALREADY refused, with the reason under it — do not raise the point again, in either direction, unless your evidence has actually changed since, and then say what changed, in so many words. Keep that section exactly as it is too. Repeating a settled request with a fresh wording is how a document set argues with itself forever.',
    '',
    'HARD RULES:',
    `- Produce EXACTLY this file and nothing else: .kortext/${step.output}`,
    '- Fill the skeleton template already at that path. A heading that CONTAINS a bracketed span — `### [Module Name]`, ``### Table: `[table_name]` `` — is a pattern, not a heading: rename it to the real thing, repeat the whole block once per real item, and delete the block entirely when the project has none of them. Every other heading is fixed: keep it VERBATIM and replace the placeholder content under it.',
    `- Frontmatter must end up as: status: draft, author: ${step.author ?? '+agent'}${step.approver ? `, approver: ${step.approver}` : ''}.`,
    '- NEVER set status to approved — approval belongs to the human.',
    '- Write the file in place, on whatever branch the folder is on. Do not create a branch, do not commit, do not run git at all: the human keeps the history, and a run that stops to ask for a branch has produced nothing.',
    '- `## Decisions` is load-bearing: each line there and the indented reason beneath it record a decision the human made. Reproduce the section EXACTLY — same lines, same reasons, same place — no matter how much of the document you rewrite. It is the only reason the next author does not re-open a settled question; drop a line and the decision is gone with it.',
    project.doc_lang
      ? `- Document language: write the PROSE in ${project.doc_lang}. This is prime's stated choice — it overrides the language of the inputs, the repository and the README.`
      : '- Document language: write the PROSE in the language of .kortext/BRIEF.md; if there is no brief (existing project), match the language of the already-approved .kortext documents, else the language of the repo README; default to English.',
    "- ENGLISH ALWAYS, whatever the document language: the section headings (they are structure, and other documents cite them by name), code and code samples, identifiers, file and folder names, commands, environment-variable names, database table and column names, API paths and field names, branch and commit conventions, and every frontmatter key. Only the prose under the headings is written in the brief's language — never translate a name something is called by.",
    "- Product copy is the one exception: strings a user of the product will read (microcopy, error messages, page copy, email text) are written in the product's interface language from the brief — which may differ from the language of this document.",
    '',
    'STEP DEFINITION (from the workflow):',
    workflowStepText.trim(),
  ];
  if (waiting.length > 0) {
    lines.push(
      '',
      'CHANGE REQUESTS ALREADY WAITING FOR THIS DOCUMENT — the `from` lines under its',
      '`## Change Requests`: other documents asked for these while this one did not exist yet, so',
      'nobody could decide them. They are yours to satisfy in this first write: write the document',
      'so each is already true, in the section where it belongs, and leave the lines themselves',
      'exactly as they are — kortext ticks them. Do not quote them and do not answer them as prose.',
      'If your evidence contradicts one, follow your evidence and put a line under',
      '`## Change Requests` aimed back at the document that asked, saying why it cannot be as asked.',
      '',
      ...waiting.map((r) => `- [${r.from} asks] ${r.reason}`),
    );
  }
  if (personaBody) {
    lines.push('', 'AUTHOR PERSONA PERSPECTIVE:', personaBody.trim());
  }
  if (reviseNotes.length > 0) {
    lines.push(
      '',
      'REVISION REQUEST — the human reviewed the current draft and asks for changes.',
      'Rewrite the document addressing EVERY note below (keep what was not objected to), and carry',
      '`## Decisions` and every `from` line under `## Change Requests` across unchanged.',
      'A note is written in `[the line it was left on] the note`. When that line is one of your own',
      'open questions, the note IS the answer: fold it into the document as a settled fact, in the',
      'section where it belongs, and DELETE that question from `## Questions for Prime`. An',
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

// One chain loop per project, with capped parallel document runs.
// Approvals wake the loop to fill available slots without waiting for a running step.
const advancing = new Map<number, () => void>();
const MAX_PARALLEL = 3;
// Tries per document within one chain loop, before the loop leaves it alone.
const MAX_STEP_ATTEMPTS = 3;

// Live spawn registry — pause/restart/cancel abort every running CLI for the
// project (SIGTERM→SIGKILL via cli-spawn) instead of letting it finish and
// rewrite files that were just wiped.
const liveRuns = new Map<number, Set<AbortController>>();
export function hasActiveRuns(): boolean {
  return advancing.size > 0 || liveRuns.size > 0;
}

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
// The server is going down: take every CLI with it. Each runs in its own
// process group, so left alone it outlives the server and writes into a
// document the next server has already marked failed.
export function abortAllRuns(): void {
  for (const set of liveRuns.values()) for (const c of set) c.abort();
}

// The CLI the project picks now, or the caller's when it picks none. Read per
// spawn, not per loop: a quota runs out mid-chain and the panel's switch must
// reach the next step and the next recheck alike.
function pickedEngine(db: Database.Database, project: Project, fallback: EngineSpec): EngineSpec {
  const picked = (
    db.prepare('SELECT engine FROM projects WHERE id = ?').get(project.id) as
      { engine: string } | undefined
  )?.engine;
  return (picked && detectEngines().find((e) => e.id === picked && e.available)) || fallback;
}

function runningJobs(db: Database.Database, projectId: number): number {
  return (
    db
      .prepare("SELECT count(*) AS n FROM jobs WHERE project_id = ? AND status = 'running'")
      .get(projectId) as { n: number }
  ).n;
}

// A revision or a retry started from the panel is not scheduled by the loop,
// so it waits here for a slot instead of running as a fourth CLI. The wait is
// a tracked run: a Pause, Restart or Cancel that lands while it waits aborts
// it like any run in flight, and it does not start when a slot opens. A
// revision asked for on an already-paused project still runs — prime asked.
// False means do not run.
// ponytail: 2s poll, not a semaphore — the loop counts running jobs in the db anyway.
async function waitForRoom(db: Database.Database, projectId: number): Promise<boolean> {
  const wait = trackRun(projectId);
  try {
    while (runningJobs(db, projectId) >= MAX_PARALLEL) {
      if (wait.ctrl.signal.aborted) return false;
      await new Promise((r) => setTimeout(r, 2000));
    }
    return !wait.ctrl.signal.aborted;
  } finally {
    wait.done();
  }
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
  // Claim the loop before awaiting the gate so concurrent approvals cannot start duplicate pools.
  advancing.set(project.id, () => wake());
  try {
    const checked = new Set<string>();
    const inFlight = new Set<Promise<unknown>>();
    // Cap attempts per document to prevent repeated failures from consuming unlimited quota.
    // A new chain loop starts with a fresh count.
    const attempts = new Map<string, number>();
    // One scheduling loop, run twice: rechecks alone before the readiness
    // gate — a reader owes its verdict whatever the brief says — then rechecks
    // and steps together once the gate has passed.
    const pump = async (steps: boolean) => {
      for (;;) {
        // Stop scheduling while paused; wait for in-flight promises to settle.
        const paused = (
          db.prepare('SELECT paused FROM projects WHERE id = ?').get(project.id) as
            { paused: number } | undefined
        )?.paused;
        // Room is what the db shows running, not what this loop started: a
        // revision from the panel takes a slot too.
        let room = paused ? 0 : MAX_PARALLEL - Math.max(inFlight.size, runningJobs(db, project.id));
        const current = pickedEngine(db, project, engine);
        // Rechecks share the pool with steps and take it first: they are short,
        // and a reader that needs a change should say so before a step that
        // reads it starts.
        for (const p of startRechecks(db, project, current, pkgRoot, checked, room)) {
          const q: Promise<void> = p.finally(() => inFlight.delete(q));
          inFlight.add(q);
          room -= 1;
        }
        if (steps && room > 0) {
          for (const step of producibleSteps(db, project, pkgRoot).slice(0, room)) {
            const tried = attempts.get(step.output) ?? 0;
            if (tried >= MAX_STEP_ATTEMPTS) continue;
            attempts.set(step.output, tried + 1);
            const p = runStep(db, project, step, current, pkgRoot).finally(() =>
              inFlight.delete(p),
            );
            inFlight.add(p);
          }
        }
        if (inFlight.size === 0) return; // nothing running, nothing producible
        await Promise.race([...inFlight, arm()]); // completion OR an approval nudge
      }
    };
    await pump(false);
    // Check pause/removal before the readiness gate to avoid starting an unwanted CLI run.
    const before = db.prepare('SELECT paused FROM projects WHERE id = ?').get(project.id) as
      { paused: number } | undefined;
    if (!before || before.paused) return;
    // Restore missing skeletons so the chain can recover without panel polling.
    try {
      scaffoldProject(project.repo_path, pkgRoot, {
        skipBrief: (project.kind ?? 'new') === 'existing',
      });
    } catch {
      /* repo may be gone; the gate below reports it */
    }
    // Require readiness before analysis; cache new-project judgments by brief version.
    // Track the gate run so pause, restart and cancel can abort it.
    const gate = trackRun(project.id);
    let ready = false;
    try {
      ready = (await ensureReadiness(db, project, engine, gate.ctrl.signal)).ready;
    } finally {
      gate.done();
    }
    if (!ready) return;
    await pump(true);
  } finally {
    advancing.delete(project.id);
  }
}

// Record refusals as failed jobs because fire-and-forget callers cannot display a returned error.
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
  // Reject concurrent writers to this document; other documents may be revised in parallel.
  if (runningDoc(db, project.id, rel)) {
    return refuse(db, project, rel, `${rel} is already being rewritten — wait for it to land`);
  }
  if (!(await waitForRoom(db, project.id))) {
    // Stopped, with its notes, so Continue resumes it like a revision the pause
    // caught mid-run — not failed, nothing went wrong.
    db.prepare(
      `INSERT INTO jobs (project_id, doc_rel, kind, status, error, notes, finished_at)
       VALUES (?, ?, 'doc', 'stopped', 'stopped by pause before it could start', ?, datetime('now'))`,
    ).run(project.id, rel, JSON.stringify(notes));
    return { ok: false, error: 'paused' };
  }
  const out = await runStep(db, project, step, pickedEngine(db, project, engine), pkgRoot, notes);
  if (out.ok) await advance(db, project, engine, pkgRoot);
  return out;
}

// Resume stopped revisions and plan revisions from their saved notes.
// Their previous outputs may still appear settled, so normal producibility checks miss them.
export async function resumeStoppedRevisions(
  db: Database.Database,
  project: Project,
  engine: EngineSpec,
  pkgRoot: string,
): Promise<void> {
  const stopped = db
    .prepare(
      `SELECT doc_rel, kind, notes FROM jobs
         WHERE project_id = ? AND kind IN ('doc', 'plan') AND status = 'stopped'
           AND id IN (SELECT MAX(id) FROM jobs WHERE project_id = ? GROUP BY doc_rel)`,
    )
    .all(project.id, project.id) as { doc_rel: string; kind: string; notes: string }[];
  await Promise.all(
    stopped.map((job) => {
      const notes = JSON.parse(job.notes || '[]') as string[];
      // Initial document writes are handled by the chain; initial planning remains user-triggered.
      if (!notes.length) return null;
      return job.kind === 'plan'
        ? runPlanning(db, project, engine, pkgRoot, notes)
        : reviseDoc(db, project, job.doc_rel, notes, engine, pkgRoot);
    }),
  );
}

// Line-anchored Q&A: the author persona answers about its own document.
// No document is modified; the answer is returned to the panel and CLI output is logged.
export async function explainDoc(
  db: Database.Database,
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
  // Track Q&A so pause, restart and cancel can abort it before deleting project files.
  const run = trackRun(project.id);
  let res;
  try {
    res = await spawnCli({
      binary: engine.binary,
      args: engineArgs(engine, liveProject(db, project)),
      promptFlag: engine.promptFlag,
      env: engineEnv(engine, liveProject(db, project)),
      cwd: project.repo_path,
      stdin: prompt,
      logPath: logPathFor(db, `p${project.id}-explain.log`),
      signal: run.ctrl.signal,
      timeoutMs: 3 * 60 * 1000,
    });
  } finally {
    run.done();
  }
  if (res.aborted) throw new Error('the question was stopped');
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

/**
 * A recheck's verdict becomes a request in the document that must change,
 * made by the document that changed. Kortext writes it, so it goes straight
 * where it will be decided — there is no draft for it to wait in.
 */
export function appendRevisionRequest(
  project: Project,
  sourceRel: string,
  targetRel: string,
  reason: string,
): void {
  appendIncomingRequest(project, targetRel, sourceRel, reason);
}

/** The CLI judges the changed input; the server records any resulting revision request. */
async function runRecheck(
  db: Database.Database,
  project: Project,
  readerRel: string,
  sourceRel: string,
  engine: EngineSpec,
): Promise<boolean> {
  const job = db
    .prepare("INSERT INTO jobs (project_id, doc_rel, kind) VALUES (?, ?, 'recheck') RETURNING *")
    .get(project.id, readerRel) as Job;
  const settle = (status: 'done' | 'failed' | 'stopped', error?: string) =>
    db
      .prepare("UPDATE jobs SET status = ?, error = ?, finished_at = datetime('now') WHERE id = ?")
      .run(status, error ?? null, job.id);
  const run = trackRun(project.id);
  // Per run, not per reader: two sources re-judging the same document at once
  // would otherwise read and delete each other's verdict.
  const verdictRel = `.kortext/.recheck-${randomUUID().slice(0, 8)}.json`;
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
    const sourceBefore = readFileSync(docPath(project, sourceRel), 'utf8');
    const readerBefore = readFileSync(docPath(project, readerRel), 'utf8');
    const res = await spawnCli({
      binary: engine.binary,
      args: engineArgs(engine, liveProject(db, project)),
      promptFlag: engine.promptFlag,
      env: engineEnv(engine, liveProject(db, project)),
      cwd: project.repo_path,
      stdin: prompt,
      logPath: logPathFor(db, `p${project.id}-recheck.log`),
      signal: run.ctrl.signal,
      timeoutMs: 5 * 60 * 1000,
    });
    if (res.aborted) {
      rmSync(verdictPath, { force: true });
      settle('stopped', 'stopped by pause/restart/cancel');
      return false;
    }
    if (res.exitCode !== 0 || !existsSync(verdictPath)) {
      settle('failed', `${engine.id} returned no verdict for ${readerRel}`);
      return false;
    }
    const verdict = JSON.parse(readFileSync(verdictPath, 'utf8')) as {
      needsChange?: boolean;
      reason?: string;
    };
    rmSync(verdictPath, { force: true });
    if (
      typeof verdict.needsChange !== 'boolean' ||
      (verdict.needsChange && (typeof verdict.reason !== 'string' || !verdict.reason.trim()))
    ) {
      throw new Error('the recheck returned an invalid verdict');
    }
    if (
      readFileSync(docPath(project, sourceRel), 'utf8') !== sourceBefore ||
      readFileSync(docPath(project, readerRel), 'utf8') !== readerBefore
    ) {
      settle('stopped', 'a document changed during the recheck — retry');
      return false;
    }
    if (verdict.needsChange && (verdict.reason ?? '').trim()) {
      appendRevisionRequest(project, sourceRel, readerRel, String(verdict.reason));
    }
    settle('done');
    return true;
  } catch (err) {
    rmSync(verdictPath, { force: true });
    settle('failed', (err as Error).message);
    return false;
  } finally {
    run.done();
  }
}

/** Queue rechecks for approved readers when their source is edited or approved. */
export function recheckDependents(
  db: Database.Database,
  project: Project,
  sourceRel: string,
  engine: EngineSpec | null,
  pkgRoot: string,
): void {
  const readers = listDocs(db, project, pkgRoot).filter(
    (d) => d.status === 'approved' && d.inputs.includes(sourceRel),
  );
  const enqueue = db.prepare(`INSERT INTO pending_rechecks (project_id, source_rel, reader_rel)
    VALUES (?, ?, ?) ON CONFLICT(project_id, source_rel, reader_rel)
    DO UPDATE SET generation = generation + 1`);
  db.transaction(() => {
    for (const r of readers) enqueue.run(project.id, sourceRel, r.rel);
  })();
  if (engine) void advance(db, project, engine, pkgRoot);
}

// The queue survives pause and process restarts. Each generation is attempted
// once per chain loop; a failed judgment stays pending for Continue/Retry.
// Start up to `room` pending rechecks and return their promises; the chain
// loop races them with its steps. Two rechecks never share a reader: the
// running-doc check below sees the job the first one inserted.
function startRechecks(
  db: Database.Database,
  project: Project,
  engine: EngineSpec,
  pkgRoot: string,
  attempted: Set<string>,
  room: number,
): Promise<void>[] {
  const started: Promise<void>[] = [];
  if (room <= 0) return started;
  const pending = db
    .prepare('SELECT * FROM pending_rechecks WHERE project_id = ?')
    .all(project.id) as { source_rel: string; reader_rel: string; generation: number }[];
  const clear = (item: (typeof pending)[number]) =>
    db
      .prepare(
        `DELETE FROM pending_rechecks WHERE project_id = ?
      AND source_rel = ? AND reader_rel = ? AND generation = ?`,
      )
      .run(project.id, item.source_rel, item.reader_rel, item.generation);
  for (const item of pending) {
    if (started.length >= room) break;
    const key = `${item.source_rel}:${item.reader_rel}:${item.generation}`;
    if (
      attempted.has(key) ||
      runningDoc(db, project.id, item.reader_rel) ||
      runningDoc(db, project.id, item.source_rel)
    )
      continue;
    attempted.add(key);
    const reader = listDocs(db, project, pkgRoot).find((d) => d.rel === item.reader_rel);
    // A fresh draft needs human approval; it no longer claims to be settled.
    if (reader?.status !== 'approved') {
      clear(item);
      continue;
    }
    started.push(
      runRecheck(db, project, item.reader_rel, item.source_rel, engine).then((done) => {
        if (done) clear(item);
      }),
    );
  }
  return started;
}

// Draft a revision into a temporary text file, return it to the editor, then delete it.
// The human must save the proposal before the document changes.
export async function proposeRevision(
  db: Database.Database,
  project: Project,
  rel: string,
  notes: string[],
  engine: EngineSpec,
  pkgRoot: string,
): Promise<{ proposal: string }> {
  // One file per call: two proposals in flight would otherwise overwrite each
  // other and hand both callers whichever draft finished last.
  // ponytail: .txt, not .md — listDocs scans .kortext/*.md and would list it as a document
  const scratchRel = `.proposal-${randomUUID().slice(0, 8)}.txt`;
  const scratch = join(project.repo_path, '.kortext', scratchRel);
  const author = loadDocMap(pkgRoot, project.kind ?? 'new').get(rel)?.author ?? '+agent';
  const prompt = [
    `Another document has asked .kortext/${rel} to change. Draft that change.`,
    ...(author !== '+agent'
      ? [`Write as ${author}, but the document belongs to the human — you propose, they decide.`]
      : []),
    '',
    'HARD RULES:',
    `- Read .kortext/${rel}. Write the FULL revised document to .kortext/${scratchRel} — the whole file, frontmatter included, not a fragment and not a diff.`,
    '- Touch NO other file. Do not modify the document itself; the human applies your draft.',
    '- Keep the frontmatter exactly as it is, including the status line.',
    '- Keep every section heading verbatim, and keep the document in its own language.',
    '- Change ONLY what the requests below ask for. Everything they do not mention stays word for word.',
    '',
    'REQUESTS:',
    ...notes.map((n) => `- ${n}`),
  ].join('\n');
  // Track proposals so cancellation cannot leave a CLI writing into removed project files.
  const run = trackRun(project.id);
  let res;
  try {
    res = await spawnCli({
      binary: engine.binary,
      args: engineArgs(engine, liveProject(db, project)),
      promptFlag: engine.promptFlag,
      env: engineEnv(engine, liveProject(db, project)),
      cwd: project.repo_path,
      stdin: prompt,
      logPath: logPathFor(db, `p${project.id}-propose.log`),
      signal: run.ctrl.signal,
      timeoutMs: 5 * 60 * 1000,
    });
  } finally {
    run.done();
  }
  if (res.aborted) {
    rmSync(scratch, { force: true });
    throw new Error('the draft was stopped');
  }
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

// Export Version, Epic and Task files under .kopeng/ as one plan job; notes request a revision.
export async function runPlanning(
  db: Database.Database,
  project: Project,
  engine: EngineSpec,
  pkgRoot: string,
  reviseNotes: string[] = [],
): Promise<RunOutcome> {
  // Persist plan revision notes so Continue can resume an interrupted run.
  const job = db
    .prepare(
      "INSERT INTO jobs (project_id, doc_rel, kind, notes) VALUES (?, '.kopeng/', 'plan', ?) RETURNING *",
    )
    .get(project.id, JSON.stringify(reviseNotes)) as Job;
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
      args: engineArgs(engine, liveProject(db, project)),
      promptFlag: engine.promptFlag,
      env: engineEnv(engine, liveProject(db, project)),
      cwd: project.repo_path,
      stdin: lines.join('\n'),
      logPath: logPathFor(db, `p${project.id}-plan.log`),
      signal: run.ctrl.signal,
      timeoutMs: PLAN_TIMEOUT_MS,
    });
    if (res.timedOut) {
      return settle(
        'failed',
        `the split ran past ${PLAN_TIMEOUT_MS / 60000} minutes and was stopped`,
      );
    }
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

/** Remove logs belonging to this project from the database-specific log directory. */
export function removeRunLogs(projectId: number, dir: string): void {
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

// Run one document step and record its outcome; callers prevent concurrent writes to the same document.
export async function runStep(
  db: Database.Database,
  project: Project,
  step: DocStep,
  engine: EngineSpec,
  pkgRoot: string,
  reviseNotes: string[] = [],
): Promise<RunOutcome> {
  const job = db
    .prepare('INSERT INTO jobs (project_id, doc_rel, notes) VALUES (?, ?, ?) RETURNING *')
    .get(project.id, step.output, JSON.stringify(reviseNotes)) as Job;

  // A first write inherits every change request aimed at this document while it
  // did not exist. On a revision they already arrived as notes.
  const waiting =
    reviseNotes.length > 0
      ? []
      : (listDocs(db, project, pkgRoot).find((d) => d.rel === step.output)?.revisionRequests ?? []);

  const prompt = buildStepPrompt(
    project,
    step,
    stepTextFor(pkgRoot, project, step.output),
    personaBodyFor(pkgRoot, step),
    reviseNotes,
    waiting,
  );
  const logPath = logPathFor(db, `p${project.id}-${step.output.replace(/\//g, '_')}.log`);

  const settle = (status: 'done' | 'failed' | 'stopped', error?: string): RunOutcome => {
    db.prepare(
      "UPDATE jobs SET status = ?, error = ?, finished_at = datetime('now') WHERE id = ?",
    ).run(status, error ?? null, job.id);
    return status === 'done' ? { ok: true } : { ok: false, error };
  };

  const outPath = join(project.repo_path, '.kortext', step.output);
  // What the document said going in. The history wants it on every write; the
  // "nothing changed" guard below wants it only on a revision, where standing
  // still is a failure — on a first write it is what the skeleton looked like.
  const priorText = existsSync(outPath) ? readFileSync(outPath, 'utf8') : null;
  // Compare contents as well as existence: a successful CLI exit may leave the prior document unchanged.
  const before = reviseNotes.length > 0 ? priorText : null;

  const run = trackRun(project.id);
  try {
    const res = await spawnCli({
      binary: engine.binary,
      args: engineArgs(engine, liveProject(db, project)),
      promptFlag: engine.promptFlag,
      env: engineEnv(engine, liveProject(db, project)),
      cwd: project.repo_path,
      stdin: prompt,
      logPath,
      signal: run.ctrl.signal,
      timeoutMs: STEP_TIMEOUT_MS,
    });
    // A run killed by its own clock is not a run the human stopped.
    if (res.timedOut) {
      return settle(
        'failed',
        `${step.output} ran past ${STEP_TIMEOUT_MS / 60000} minutes and was stopped — retry, or narrow the brief`,
      );
    }
    if (res.aborted) return settle('stopped', 'stopped by pause/restart/cancel');
    if (res.exitCode !== 0) {
      return settle(
        'failed',
        `${engine.id} CLI failed (exit ${res.exitCode}): ${(res.stderrTail || res.stdoutTail).trim().slice(-400) || 'no output'}`,
      );
    }
    if (!existsSync(outPath)) {
      return settle('failed', `engine finished without producing ${step.output}`);
    }
    let written = readFileSync(outPath, 'utf8');
    if (before !== null && written === before) {
      return settle(
        'failed',
        `${engine.id} left ${step.output} exactly as it was — the change was not made`,
      );
    }
    let status = readFrontmatter(written).status;
    // The agent does not approve: a document it marked `approved` would open
    // every step that reads it without prime ever seeing it. The text stays,
    // the status is prime's — back to draft, and the run goes on as one.
    if (status === 'approved') {
      setFrontmatterStatus(outPath, 'draft');
      written = readFileSync(outPath, 'utf8');
      status = 'draft';
    }
    // Generate the design preview after a successful DESIGN.md write.
    if (step.output === 'DESIGN.md') writeDesignPreview(project);
    if (status !== 'draft' && status !== 'not-applicable') {
      // Any other status is a write nobody asked for; the file goes back to
      // what stood, so a failed run leaves nothing new for the chain to read.
      if (priorText !== null) writeFileSync(outPath, priorText, 'utf8');
      return settle('failed', `${step.output} written but status is '${status}' (expected draft)`);
    }
    // A document that does not apply is a title and one line. Anything else is
    // the skeleton left standing, which the next author reads as work waiting.
    if (status === 'not-applicable') {
      const left = unfilledPlaceholders(written, templateFor(pkgRoot, step.output));
      if (left.length > 0) {
        return settle(
          'failed',
          `${step.output} is not-applicable but still carries the skeleton — delete it, leaving the title and the one line saying why: ${left.slice(0, 3).join(' / ')}`,
        );
      }
    }
    // A skeleton is not a version of the document: recording it would make the
    // first draft read as a rewrite of the placeholders, every line marked.
    const priorVersion =
      priorText !== null && readFrontmatter(priorText).status === 'uninitialized'
        ? null
        : priorText;
    // What was asked of this document is not the agent's to drop: put back any
    // line the rewrite lost. Then the requests this run answered — the ones
    // prime chose, and the ones the first write inherited — are done, and a
    // done request leaves the document: the text now says what it asked for.
    restoreRequests(project, step.output, priorText);
    for (const request of listDocs(db, project, pkgRoot).find((d) => d.rel === step.output)
      ?.revisionRequests ?? []) {
      const chosen = reviseNotes.includes(`[${request.from} asks] ${request.reason}`);
      const inherited = waiting.some((w) => w.from === request.from && w.reason === request.reason);
      if (chosen || inherited) removeRequest(project, step.output, request.from, request.reason);
    }
    // Record the file as it stands after those repairs: the version the panel
    // diffs against must be the text on disk, or the picker offers a version
    // nobody saw and the real change hides behind the restored lines.
    recordVersion(
      db,
      project,
      step.output,
      readFileSync(outPath, 'utf8'),
      'agent',
      priorVersion,
      job.id,
    );
    return settle('done');
  } catch (err) {
    return settle('failed', (err as Error).message);
  } finally {
    run.done();
  }
}
