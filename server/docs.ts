import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { Project } from './db.js';

export interface DocStep {
  output: string; // the document this step writes, e.g. PRODUCT.md
  inputs: string[];
  author: string | null;
  approver: string | null;
}

export interface DocInfo {
  rel: string;
  name: string;
  status: string; // uninitialized | draft | approved | …
  author: string | null;
  inputs: string[];
  blocked: boolean; // an input is not approved yet
  /**
   * Approved document whose input has an open request or is no longer settled.
   * Recheck it after that input settles.
   */
  dependentOn: string[];
  openQuestions: boolean; // carries unanswered questions for prime
  /** A workflow step writes this document. The brief has none — it is prime's own. */
  hasProducingStep: boolean;
  /** Open incoming revision requests. */
  revisionRequests: Array<{ from: string; reason: string }>;
  /** Open outgoing revision requests, also actionable from this document. */
  sentRequests: Array<{ target: string; reason: string; targetHasStep: boolean }>;
  /** Findings about something no document owns — a config file, a workflow, a key. */
  warnings: Array<{ subject: string; reason: string }>;
  /** Contradictions left standing because prime dismissed the demand that named them. */
  conflicts: Array<{ from: string; reason: string }>;
  /** Which shelf the panel files this on. */
  section: 'needs' | 'doing' | 'todo' | 'done';
  /** The word after the name: what the document is doing, or waiting to do. */
  state: 'waiting' | 'writing' | 'paused' | 'approved' | 'n/a';
  /** The word in brackets: which kind of waiting, writing or pausing. */
  detail: 'approve' | 'review' | 'answer' | 'queue' | 'update' | 'draft' | 'failed' | null;
  /** A recheck is queued or running against this document. */
  pendingRecheck: boolean;
}

interface LastJob {
  kind: string;
  status: string;
  isUpdate: boolean;
}

/**
 * Where a document sits and what it is waiting for. Five inputs decide it, and
 * two of them — the queued rechecks and whether a run carries revision notes —
 * live only in the database, so the answer is computed here rather than shipped
 * raw for the panel to reassemble.
 *
 * Order matters: the first match wins.
 */
function fileDoc(doc: DocInfo, job: LastJob | null): Pick<DocInfo, 'section' | 'state' | 'detail'> {
  const at = (section: DocInfo['section'], state: DocInfo['state'], detail: DocInfo['detail']) => ({
    section,
    state,
    detail,
  });

  if (job?.kind === 'doc' && job.status === 'running') {
    return at('doing', 'writing', job.isUpdate ? 'update' : 'draft');
  }
  if (job?.status === 'stopped') {
    return at('doing', 'paused', job.isUpdate ? 'update' : 'draft');
  }
  // Nothing is doing anything with a failed job — it waits for prime to retry.
  if (job?.status === 'failed') return at('needs', 'paused', 'failed');
  if (doc.status === 'uninitialized') return at('todo', 'waiting', 'queue');
  // A draft carrying demands is triaged before it can be approved.
  if (doc.revisionRequests.length > 0) return at('needs', 'waiting', 'review');
  if (doc.conflicts.length > 0 || doc.warnings.length > 0) return at('needs', 'waiting', 'review');
  // A recheck is a reading, not a writing: the document waits either way.
  if (doc.pendingRecheck) return at('todo', 'waiting', 'update');
  // Approval is disabled while a question stands; say so rather than point at a
  // greyed-out button.
  if (doc.status === 'draft' && doc.openQuestions) return at('needs', 'waiting', 'answer');
  if (doc.status === 'draft') return at('needs', 'waiting', 'approve');
  if (doc.status === 'approved') return at('done', 'approved', null);
  return at('done', 'n/a', null);
}

/**
 * A warning names something outside the document set — `.gitignore`, a CI file,
 * a live endpoint. It uses the demand grammar but not the demand pattern: the
 * subject is any backticked path, because insisting on `.md` is what made a real
 * `.gitignore` finding vanish into prose nobody could act on.
 */
const MARKED_LINE = /^\s*[-*+]\s+(?:\[([ xX]?)\]\s*)?`([^`]+)`\s*[—:-]?\s*(.*)$/;

/**
 * One parser for the three sections that carry marked lists: Revision Requests,
 * Conflicts and Warnings. `subject` narrows what counts as a subject — demands
 * insist on a document, warnings take anything.
 */
export function parseMarkedList(
  content: string,
  heading: RegExp,
  subject: RegExp,
): Array<{ subject: string; reason: string }> {
  const out: Array<{ subject: string; reason: string }> = [];
  let inSection = false;
  for (const line of content.split('\n')) {
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      inSection = heading.test(h[1] ?? '');
      continue;
    }
    if (!inSection) continue;
    const m = line.match(MARKED_LINE);
    // A ticked box is settled and excluded from the pending list.
    if (!m || (m[1] ?? '').trim().toLowerCase() === 'x') continue;
    const name = m[2]!.replace(/^\.kortext\//, '');
    if (!subject.test(name)) continue;
    out.push({ subject: name, reason: m[3]!.trim() });
  }
  return out;
}

const DOC_SUBJECT = /^[A-Za-z][\w./-]*\.md$/;
const ANY_SUBJECT = /./;

export function parseRevisionRequests(content: string): Array<{ target: string; reason: string }> {
  return parseMarkedList(content, /revision requests/i, DOC_SUBJECT).map((r) => ({
    target: r.subject,
    reason: r.reason,
  }));
}

/** Contradictions left standing because prime dismissed the demand that named them. */
export function parseConflicts(content: string): Array<{ from: string; reason: string }> {
  return parseMarkedList(content, /^conflicts$/i, ANY_SUBJECT).map((r) => ({
    from: r.subject,
    reason: r.reason,
  }));
}

/**
 * Findings about something the document set does not own.
 *
 * A demand aimed at a file that is not a document counts as one wherever it was
 * written. An agent found `.env` tracked in git and filed it under Revision
 * Requests against `.gitignore`; the demand parser wants a document, so the line
 * became prose nobody could act on. It is a warning, and it is read as one.
 */
export function parseWarnings(content: string): Array<{ subject: string; reason: string }> {
  const own = parseMarkedList(content, /^warnings$/i, ANY_SUBJECT);
  const misfiled = parseMarkedList(content, /revision requests/i, ANY_SUBJECT).filter(
    (r) => !DOC_SUBJECT.test(r.subject),
  );
  return [...own, ...misfiled];
}

// Read questions only from the Open Questions section; ignore template placeholders.
export function hasOpenQuestions(content: string): boolean {
  const lines = content.split('\n');
  let inSection = false;
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      inSection = /open questions/i.test(heading[1]);
      continue;
    }
    if (!inSection) continue;
    const t = line.trim();
    if (t === '' || /^[-*+]?\s*\[[^\]]*\]$/.test(t)) continue;
    return true;
  }
  return false;
}

/**
 * Lines the agent was meant to replace and did not. A real test shipped an
 * approved `DATABASE.md` still carrying `### Table: \`[table_name]\``, because the
 * prompt told it to keep headings verbatim and the heading itself was a pattern.
 *
 * Bracketed prose is normal in a template (`[e.g., PostgreSQL]`), so a line only
 * counts as unfilled when it survives verbatim from the shipped skeleton — plus
 * any heading carrying a bracketed span, which is a pattern wherever it came from.
 */
export function unfilledPlaceholders(content: string, template: string | null): string[] {
  const shipped = new Set(
    (template ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  );
  const out: string[] = [];
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || !/\[[^\]]+\]/.test(t)) continue;
    if (/^#{1,6}\s/.test(t) || shipped.has(t)) out.push(t);
  }
  return out;
}

export function templateFor(pkgRoot: string, rel: string): string | null {
  const p = join(pkgRoot, 'templates', 'docs', rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

// Parses workflow step metadata: numbered steps carrying
//   1. **+persona:** …
//      - inputs: `.kortext/BRIEF.md`, …
//      - outputs: `.kortext/STACK.md`
//      - approver: +prime
// Returns one DocStep per output file.
export function parseWorkflowSteps(md: string): DocStep[] {
  const steps: DocStep[] = [];
  let author: string | null = null;
  let inputs: string[] = [];
  let outputs: string[] = [];
  let approver: string | null = null;

  const flush = () => {
    for (const output of outputs) steps.push({ output, inputs, author, approver });
    author = null;
    inputs = [];
    outputs = [];
    approver = null;
  };

  for (const line of md.split('\n')) {
    const stepStart = line.match(/^\d+\.\s+\*\*(\+[a-z-]+):?\*\*/);
    if (stepStart) {
      flush();
      author = stepStart[1];
      continue;
    }
    const paths = (s: string) => [...s.matchAll(/`\.kortext\/([^`]+)`/g)].map((m) => m[1]);
    if (/^\s*-\s*inputs:/.test(line)) inputs = paths(line);
    else if (/^\s*-\s*outputs:/.test(line)) outputs = paths(line);
    else if (/^\s*-\s*approver:/.test(line)) approver = line.split('approver:')[1].trim();
  }
  flush();
  return steps;
}

// The dependency map follows the project's kind: a 'new' project reads
// new-project-analysis, an 'existing' one existing-project-analysis
// (planning-pipeline.md declares no document steps of its own).
export function workflowNameFor(kind: 'new' | 'existing'): string {
  return kind === 'existing' ? 'existing-project-analysis' : 'new-project-analysis';
}

export function loadDocMap(
  pkgRoot: string,
  kind: 'new' | 'existing' = 'new',
): Map<string, DocStep> {
  const map = new Map<string, DocStep>();
  // Only analysis workflows declare document steps; planning produces separate .kopeng/ files.
  const p = join(pkgRoot, 'workflows', `${workflowNameFor(kind)}.md`);
  if (!existsSync(p)) return map;
  for (const step of parseWorkflowSteps(readFileSync(p, 'utf8'))) {
    if (!map.has(step.output)) map.set(step.output, step);
  }
  return map;
}

export function readFrontmatter(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!content.startsWith('---')) return out;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return out;
  for (const line of content.slice(3, end).split('\n')) {
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

export function setFrontmatterStatus(path: string, status: string): void {
  const body = readFileSync(path, 'utf8');
  if (/^status:/m.test(body)) {
    writeFileSync(path, body.replace(/^status:.*$/m, `status: ${status}`), 'utf8');
  } else if (body.startsWith('---\n')) {
    writeFileSync(path, body.replace('---\n', `---\nstatus: ${status}\n`), 'utf8');
  } else {
    writeFileSync(path, `---\nstatus: ${status}\n---\n\n${body}`, 'utf8');
  }
}

// Record the outcome in the document that carries the line, so the panel and the
// next CLI read the same state.
export function markListItemHandled(
  project: Project,
  rel: string,
  heading: RegExp,
  subject: string,
  reason: string,
  outcome: string,
): void {
  const path = docPath(project, rel);
  if (!existsSync(path)) return;
  const day = new Date().toISOString().slice(0, 10);
  const lines = readFileSync(path, 'utf8').split('\n');
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      inSection = heading.test(h[1] ?? '');
      continue;
    }
    if (!inSection) continue;
    const m = line.match(MARKED_LINE);
    if (!m) continue;
    if (m[2]!.replace(/^\.kortext\//, '') !== subject.replace(/^.*\//, '') && m[2] !== subject)
      continue;
    if ((m[3] ?? '').trim() !== reason.trim()) continue;
    // Keep both the settled marker and the outcome in the document.
    lines.splice(i, 1, `- [x] \`${m[2]}\` — ${m[3]}`, `  - ${outcome} · ${day}`);
    writeFileSync(path, lines.join('\n'), 'utf8');
    return;
  }
}

export function markRequestHandled(
  project: Project,
  from: string,
  target: string,
  reason: string,
  outcome: string,
): void {
  markListItemHandled(project, from, /revision requests/i, target, reason, outcome);
}

/**
 * Adds one marked line under `heading`, creating the section when the document
 * does not carry it. Sections are made on demand rather than shipped in the
 * fifteen templates, so an empty one never exists to be mistaken for work.
 */
export function appendListItem(
  project: Project,
  rel: string,
  heading: string,
  subject: string,
  reason: string,
  trailer?: string,
): void {
  const path = docPath(project, rel);
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split('\n');
  const item = `- [ ] \`${subject}\` — ${reason.replace(/\s+/g, ' ').trim()}`;
  const block = trailer ? [item, `  - ${trailer}`] : [item];
  const head = lines.findIndex((l) => new RegExp(`^#{1,6}\\s+${heading}\\s*$`, 'i').test(l));
  if (head === -1) {
    lines.push('', `## ${heading}`, '', ...block);
  } else {
    let end = head + 1;
    while (end < lines.length && !/^#{1,6}\s/.test(lines[end] ?? '')) end++;
    let at = end;
    while (at > head + 1 && (lines[at - 1] ?? '').trim() === '') at--;
    lines.splice(at, 0, ...block);
  }
  writeFileSync(path, lines.join('\n'), 'utf8');
}

export function listDocs(db: Database.Database, project: Project, pkgRoot: string): DocInfo[] {
  const map = loadDocMap(pkgRoot, project.kind ?? 'new');
  const statuses = new Map<string, string>();
  const docs: DocInfo[] = [];
  const requests: Array<{ from: string; target: string; reason: string }> = [];
  const collect = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()) {
      const rel = file;
      const body = readFileSync(join(dir, file), 'utf8');
      const fm = readFrontmatter(body);
      const status = fm.status ?? 'uninitialized';
      statuses.set(rel, status);
      docs.push({
        rel,
        name: file.replace(/\.md$/, ''),
        status,
        author: fm.author ?? map.get(rel)?.author ?? null,
        inputs: map.get(rel)?.inputs ?? [],
        blocked: false,
        dependentOn: [],
        openQuestions: status !== 'uninitialized' && hasOpenQuestions(body),
        hasProducingStep: map.has(rel),
        revisionRequests: [],
        sentRequests: [],
        warnings: status === 'uninitialized' ? [] : parseWarnings(body),
        conflicts: status === 'uninitialized' ? [] : parseConflicts(body),
        // Filled once every document is known; nothing can be filed before then.
        section: 'todo',
        state: 'waiting',
        detail: 'queue',
        pendingRecheck: false,
      });
      if (status !== 'uninitialized') {
        for (const r of parseRevisionRequests(body)) requests.push({ ...r, from: rel });
      }
    }
  };
  // One shelf: every .md in .kortext/ is a document of this project.
  collect(join(project.repo_path, '.kortext'));

  // Attach each open request to its target and source documents.
  for (const r of requests) {
    const target = docs.find((d) => d.rel === r.target);
    // Only written documents can receive revision requests.
    if (!target || target.status === 'uninitialized') continue;
    target.revisionRequests.push({ from: r.from, reason: r.reason });
    // Expose the same request on the source document for either-end decisions.
    docs
      .find((d) => d.rel === r.from)
      ?.sentRequests.push({
        target: target.rel,
        reason: r.reason,
        targetHasStep: target.hasProducingStep,
      });
  }

  // 'not-applicable' satisfies a dependency: the doc was considered and
  // deliberately skipped — downstream steps must not wait on it.
  const settled = (s: string | undefined) => s === 'approved' || s === 'not-applicable';
  const byRel = new Map(docs.map((d) => [d.rel, d]));
  for (const doc of docs) {
    doc.blocked = doc.inputs.some((i) => !settled(statuses.get(i)));
    // Only approved readers need rechecking when an input becomes unsettled or receives a request.
    if (doc.status !== 'approved') continue;
    doc.dependentOn = doc.inputs.filter((i) => {
      const input = byRel.get(i);
      if (!input) return false;
      return input.revisionRequests.length > 0 || !settled(input.status);
    });
  }

  // Sort by maximum dependency depth. Memoize per document, but keep cycle detection
  // local to each traversal path so shared inputs in a diamond retain their depth.
  const memo = new Map<string, number>();
  const depth = (rel: string, path = new Set<string>()): number => {
    const done = memo.get(rel);
    if (done !== undefined) return done;
    if (path.has(rel)) return 0; // ponytail: the shipped workflows are acyclic; this is for hand-edited ones
    path.add(rel);
    const ins = map.get(rel)?.inputs ?? [];
    const d = ins.length === 0 ? 0 : 1 + Math.max(...ins.map((i) => depth(i, path)));
    path.delete(rel);
    memo.set(rel, d);
    return d;
  };
  // The last job per document, and the rechecks queued against it. Both live in
  // the database only; the runner cannot be imported here — it imports this file.
  const jobs = new Map<string, LastJob>();
  for (const row of db
    .prepare(
      `SELECT doc_rel, kind, status, notes FROM jobs
        WHERE project_id = ? AND id IN (SELECT MAX(id) FROM jobs WHERE project_id = ? GROUP BY doc_rel)`,
    )
    .all(project.id, project.id) as Array<{
    doc_rel: string;
    kind: string;
    status: string;
    notes: string;
  }>) {
    let isUpdate = false;
    try {
      isUpdate = (JSON.parse(row.notes || '[]') as unknown[]).length > 0;
    } catch {
      isUpdate = false;
    }
    jobs.set(row.doc_rel, { kind: row.kind, status: row.status, isUpdate });
  }
  const rechecking = new Set(
    (
      db
        .prepare('SELECT DISTINCT reader_rel FROM pending_rechecks WHERE project_id = ?')
        .all(project.id) as Array<{ reader_rel: string }>
    ).map((r) => r.reader_rel),
  );
  for (const doc of docs) {
    const job = jobs.get(doc.rel) ?? null;
    doc.pendingRecheck =
      rechecking.has(doc.rel) || (job?.kind === 'recheck' && job.status === 'running');
    Object.assign(doc, fileDoc(doc, job));
  }

  docs.sort((a, b) => depth(a.rel) - depth(b.rel) || a.rel.localeCompare(b.rel));
  return docs;
}

// The handshake is done when every document the workflow produces is settled
// (approved or not-applicable). Docs without a producing step (unmapped
// skeletons a project already carried) don't gate completion.
export function analysisComplete(
  db: Database.Database,
  project: Project,
  pkgRoot: string,
): boolean {
  if (db.prepare('SELECT 1 FROM pending_rechecks WHERE project_id = ? LIMIT 1').get(project.id)) {
    return false;
  }
  if (
    db
      .prepare(
        "SELECT 1 FROM jobs WHERE project_id = ? AND status = 'running' AND kind != 'plan' LIMIT 1",
      )
      .get(project.id)
  ) {
    return false;
  }
  const map = loadDocMap(pkgRoot, project.kind ?? 'new');
  const docs = listDocs(db, project, pkgRoot);
  const byRel = new Map(docs.map((d) => [d.rel, d.status]));
  const targets = [...map.keys()];
  if (targets.length === 0) return false;
  const settled = (s: string | undefined) => s === 'approved' || s === 'not-applicable';
  // The brief gates the new-project flow even though no step produces it
  if ((project.kind ?? 'new') === 'new' && !settled(byRel.get('BRIEF.md'))) return false;
  if (targets.some((rel) => docs.find((d) => d.rel === rel)?.openQuestions)) return false;
  if (docs.some((d) => d.revisionRequests.length > 0)) return false;
  return targets.every((rel) => settled(byRel.get(rel)));
}

// rel names a document on the shelf ("STACK.md"). The pattern forbids traversal
// ("." never starts the name) and anything outside .kortext/ itself.
export function docPath(project: Project, rel: string): string {
  if (!/^[A-Za-z][\w.-]*\.md$/.test(rel)) {
    throw new Error(`bad doc path: ${rel}`);
  }
  return join(project.repo_path, '.kortext', rel);
}

export function docVersion(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Keeps what a document said, so a revision can be read as a change rather than
 * as a new text. Only the two paths that rewrite the prose record: the agent's
 * write and prime's save. Approving, ticking a demand and appending a recheck's
 * line all touch one line the reader already strips.
 *
 * `priorText` bootstraps the chain: the first recorded write has no predecessor
 * to compare against, so the bytes it replaced go in first.
 */
export function recordVersion(
  db: Database.Database,
  project: Project,
  rel: string,
  content: string,
  source: 'agent' | 'prime' | 'proposal',
  priorText: string | null,
  jobId?: number,
): void {
  const insert = db.prepare(
    'INSERT INTO doc_versions (project_id, rel, sha, content, source, job_id) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const seen = db
    .prepare('SELECT 1 FROM doc_versions WHERE project_id = ? AND rel = ? LIMIT 1')
    .get(project.id, rel);
  if (!seen && priorText !== null) {
    insert.run(project.id, rel, docVersion(priorText), priorText, 'pre-existing', null);
  }
  insert.run(project.id, rel, docVersion(content), content, source, jobId ?? null);
}

export interface DocVersion {
  id: number;
  sha: string;
  source: string;
  created_at: string;
}

export function listVersions(db: Database.Database, project: Project, rel: string): DocVersion[] {
  return db
    .prepare(
      'SELECT id, sha, source, created_at FROM doc_versions WHERE project_id = ? AND rel = ? ORDER BY id DESC',
    )
    .all(project.id, rel) as DocVersion[];
}

export function readVersion(
  db: Database.Database,
  project: Project,
  id: number,
): { content: string; rel: string } | null {
  return (
    (db
      .prepare('SELECT content, rel FROM doc_versions WHERE id = ? AND project_id = ?')
      .get(id, project.id) as { content: string; rel: string } | undefined) ?? null
  );
}
