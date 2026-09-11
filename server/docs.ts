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
  /**
   * Open change requests about this document, read from its own
   * `## Change Requests` — one place, one list. They arrive when the document
   * that asked is approved, and this is where they are decided. On a document
   * nobody has written yet they are not prime's to decide: they go into its
   * first write.
   */
  revisionRequests: Array<{ from: string; reason: string }>;
  /** Requests prime denied here. A record, not work: nothing asks about them again. */
  denied: Array<{ from: string; reason: string }>;
  /**
   * Findings about something no document owns — a config file, a workflow, a
   * key. A record the next writer reads, not a decision owed: no buttons, no
   * Action Needed row, no gate on the handshake.
   */
  warnings: Array<{ subject: string; reason: string }>;
  /**
   * The `## Conflicts` section documents carried before denials were recorded
   * in place. Read for the handover count only; nothing writes it any more.
   */
  conflicts: Array<{ from: string; reason: string }>;
  /** Which shelf the panel files this on. */
  section: 'needs' | 'doing' | 'todo' | 'done';
  /** The word after the name: what the document is doing, or waiting to do. */
  state: 'waiting' | 'writing' | 'paused' | 'failed' | 'approved' | 'n/a';
  /** The word in brackets: which kind of waiting, writing, pausing or failing. */
  detail: 'approve' | 'review' | 'queue' | 'recheck' | 'draft' | 'revision' | null;
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

  // What a run is writing: the first draft, or a revision of what stands.
  const pass = job?.isUpdate ? 'revision' : 'draft';
  if (job?.kind === 'doc' && job.status === 'running') return at('doing', 'writing', pass);
  // `paused` means one thing: prime stopped it. A run that errored is `failed`,
  // and the two share no button — Continue against Retry.
  if (job?.status === 'stopped') return at('doing', 'paused', pass);
  if (job?.status === 'failed') return at('needs', 'failed', pass);
  if (doc.status === 'uninitialized') return at('todo', 'waiting', 'queue');
  // Every open Action Needed item blocks approval, so one case covers them all:
  // questions left for prime and change requests arriving from other documents.
  // Conflicts and findings are not among them — they are records written into
  // the document, not decisions owed.
  if (doc.revisionRequests.length > 0 || (doc.status === 'draft' && doc.openQuestions))
    return at('needs', 'waiting', 'review');
  // A recheck is a reading, not a writing: the document waits either way.
  if (doc.pendingRecheck) return at('todo', 'waiting', 'recheck');
  if (doc.status === 'draft') return at('needs', 'waiting', 'approve');
  if (doc.status === 'approved') return at('done', 'approved', null);
  return at('done', 'n/a', null);
}

/**
 * One grammar for every marked line. Under `## Change Requests` the line has a
 * direction: `` - `TARGET.md` — reason `` is what THIS document asks of another
 * (it leaves when this document is approved), and `` - [ ] from `SOURCE.md` —
 * reason `` is what another document asked of this one (it stays, and is
 * decided here). Findings use the same shape with any path as the subject,
 * because insisting on `.md` is what made a real `.gitignore` finding vanish
 * into prose nobody could act on.
 */
const MARKED_LINE = /^\s*[-*+]\s+(?:\[([ xX]?)\]\s*)?(from\s+)?`([^`]+)`\s*[—:-]?\s*(.*)$/;

/** An outcome trailer: indented and a list item of its own. */
const TRAILER = /^\s+[-*+] /;

/**
 * A demand is one item, but an agent may wrap it over several lines. The
 * indented lines that follow are the rest of the sentence unless they are
 * list items themselves, which is what an outcome trailer looks like.
 * Returns the whole reason and the index the item ends at.
 */
function foldWrapped(lines: string[], i: number, first: string): [string, number] {
  let reason = first.trim();
  let j = i + 1;
  for (; j < lines.length; j++) {
    const line = lines[j] ?? '';
    if (!/^\s+\S/.test(line) || TRAILER.test(line)) break;
    reason = `${reason} ${line.trim()}`.trim();
  }
  return [reason, j];
}

export interface MarkedItem {
  subject: string;
  reason: string;
  /** The line is `from` another document — a request made about this one. */
  incoming: boolean;
  /** The box is ticked. */
  settled: boolean;
  /** The first outcome trailer under it, if any. */
  outcome: string;
}

/** Every marked line under `heading`, settled or not, with its direction. */
export function parseMarkedList(content: string, heading: RegExp): MarkedItem[] {
  const out: MarkedItem[] = [];
  const lines = content.split('\n');
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      inSection = heading.test((h[1] ?? '').trim());
      continue;
    }
    if (!inSection) continue;
    const m = line.match(MARKED_LINE);
    if (!m) continue;
    const [reason, next] = foldWrapped(lines, i, m[4] ?? '');
    const trailer = lines[next] ?? '';
    i = next - 1;
    out.push({
      subject: m[3]!.replace(/^\.kortext\//, ''),
      reason,
      incoming: !!m[2],
      settled: (m[1] ?? '').trim().toLowerCase() === 'x',
      outcome: TRAILER.test(trailer) ? trailer.replace(TRAILER, '').trim() : '',
    });
  }
  return out;
}

const DOC_SUBJECT = /^[A-Za-z][\w./-]*\.md$/;

/**
 * The three headings, each accepting the name it used to carry. Documents
 * written before the rename are still on disk, and a parser that stopped
 * reading them would drop demands nobody would ever see again.
 */
export const CHANGE_REQUESTS = /^(change|revision) requests$/i;
export const FINDINGS = /^(findings|warnings)$/i;
export const QUESTIONS = /^(open )?questions( for prime)?$/i;

/** What other documents asked of this one and prime has not decided yet. */
export function parseIncoming(content: string): Array<{ from: string; reason: string }> {
  return parseMarkedList(content, CHANGE_REQUESTS)
    .filter((r) => r.incoming && !r.settled)
    .map((r) => ({ from: r.subject, reason: r.reason }));
}

/** What prime denied here. The line stays ticked, its reason under it. */
export function parseDenied(content: string): Array<{ from: string; reason: string }> {
  return parseMarkedList(content, CHANGE_REQUESTS)
    .filter((r) => r.incoming && r.settled && /^(denied|dismissed)/i.test(r.outcome))
    .map((r) => ({ from: r.subject, reason: r.reason }));
}

/**
 * What this document asks of others — the lines the agent wrote while drafting.
 * They travel to the document they name when this one is approved.
 */
export function parseOutgoing(content: string): Array<{ target: string; reason: string }> {
  return parseMarkedList(content, CHANGE_REQUESTS)
    .filter((r) => !r.incoming && !r.settled && DOC_SUBJECT.test(r.subject))
    .map((r) => ({ target: r.subject, reason: r.reason }));
}

/** The `## Conflicts` section older documents carry. Counted, never written. */
export function parseConflicts(content: string): Array<{ from: string; reason: string }> {
  return parseMarkedList(content, /^conflicts$/i)
    .filter((r) => !r.settled)
    .map((r) => ({ from: r.subject, reason: r.reason }));
}

/**
 * Findings about something the document set does not own.
 *
 * A demand aimed at a file that is not a document counts as one wherever it was
 * written. An agent found `.env` tracked in git and filed it under Change
 * Requests against `.gitignore`; the demand parser wants a document, so the line
 * became prose nobody could act on. It is a finding, and it is read as one.
 */
export function parseWarnings(content: string): Array<{ subject: string; reason: string }> {
  const own = parseMarkedList(content, FINDINGS).filter((r) => !r.settled);
  const misfiled = parseMarkedList(content, CHANGE_REQUESTS).filter(
    (r) => !r.incoming && !r.settled && !DOC_SUBJECT.test(r.subject),
  );
  return [...own, ...misfiled].map((r) => ({ subject: r.subject, reason: r.reason }));
}

// Read questions only from the questions section; ignore template placeholders.
export function hasOpenQuestions(content: string): boolean {
  const lines = content.split('\n');
  let inSection = false;
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      inSection = QUESTIONS.test((heading[1] ?? '').trim());
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

/**
 * Settles one marked line in place: the box is ticked and the outcome goes
 * under it, so the record stays in the file where the next reader looks. A
 * line may already carry a trailer saying how it came to be; the outcome goes
 * after it, so the item reads in the order it happened. The wrapped rest of the
 * demand stays where it is — it belongs to the demand, not to the outcome.
 */
function markListItemHandled(
  project: Project,
  rel: string,
  heading: RegExp,
  subject: string,
  reason: string,
  outcome: string,
  incoming: boolean,
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
      inSection = heading.test((h[1] ?? '').trim());
      continue;
    }
    if (!inSection) continue;
    const m = line.match(MARKED_LINE);
    if (!m || !!m[2] !== incoming) continue;
    if (m[3]!.replace(/^\.kortext\//, '') !== subject.replace(/^.*\//, '') && m[3] !== subject)
      continue;
    const [full, afterWrap] = foldWrapped(lines, i, m[4] ?? '');
    if (full !== reason.trim()) continue;
    let end = afterWrap;
    while (end < lines.length && TRAILER.test(lines[end] ?? '')) end++;
    lines.splice(end, 0, `  - ${outcome} · ${day}`);
    lines[i] = `- [x] ${incoming ? 'from ' : ''}\`${m[3]}\` — ${m[4]}`;
    writeFileSync(path, lines.join('\n'), 'utf8');
    return;
  }
}

/**
 * Settles a request in the document it is about: `rel` holds the line,
 * `from` is the document that asked. The record stays here — the next agent to
 * rewrite `rel` reads it here, and does not raise the same request again.
 */
export function markRequestHandled(
  project: Project,
  rel: string,
  from: string,
  reason: string,
  outcome: string,
): void {
  markListItemHandled(project, rel, CHANGE_REQUESTS, from, reason, outcome, true);
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
  incoming = false,
): void {
  const path = docPath(project, rel);
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split('\n');
  const item = `- [ ] ${incoming ? 'from ' : ''}\`${subject}\` — ${reason.replace(/\s+/g, ' ').trim()}`;
  const block = trailer ? [item, `  - ${trailer}`] : [item];
  const head = lines.findIndex((l) => {
    const m = l.match(/^#{1,6}\s+(.*?)\s*$/);
    return !!m && new RegExp(`^${heading}$`, 'i').test(m[1]!);
  });
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

/** Files a request about `target`, made by `from`, where it will be decided. */
export function appendIncomingRequest(
  project: Project,
  target: string,
  from: string,
  reason: string,
): void {
  appendListItem(project, target, 'Change Requests', from, reason, undefined, true);
}

/**
 * Puts back what an agent's rewrite dropped. The lines `from` other documents
 * are not the agent's to remove — an open one is a decision prime still owes,
 * a ticked one is a decision prime made — and the prompt says so, but a prompt
 * is not a guarantee. This is: after every agent write, any such line missing
 * from the new text is appended again, state and outcome intact.
 */
export function restoreRequests(project: Project, rel: string, priorText: string | null): void {
  if (priorText === null) return;
  const path = docPath(project, rel);
  if (!existsSync(path)) return;
  const written = readFileSync(path, 'utf8');
  const kept = parseMarkedList(written, CHANGE_REQUESTS).filter((r) => r.incoming);
  const lost = parseMarkedList(priorText, CHANGE_REQUESTS).filter(
    (r) => r.incoming && !kept.some((k) => k.subject === r.subject && k.reason === r.reason),
  );
  if (lost.length === 0) return;
  const lines = written.split('\n');
  const block = lost.flatMap((r) => [
    `- [${r.settled ? 'x' : ' '}] from \`${r.subject}\` — ${r.reason}`,
    ...(r.outcome ? [`  - ${r.outcome}`] : []),
  ]);
  const head = lines.findIndex((l) => {
    const m = l.match(/^#{1,6}\s+(.*?)\s*$/);
    return !!m && CHANGE_REQUESTS.test(m[1]!);
  });
  if (head === -1) {
    lines.push('', '## Change Requests', '', ...block);
  } else {
    let end = head + 1;
    while (end < lines.length && !/^#{1,6}\s/.test(lines[end] ?? '')) end++;
    let at = end;
    while (at > head + 1 && (lines[at - 1] ?? '').trim() === '') at--;
    lines.splice(at, 0, ...block);
  }
  writeFileSync(path, lines.join('\n'), 'utf8');
}

/**
 * Moves every open outgoing request of an approved document to the document it
 * names. The agent writes what it asks of others into its own draft, where
 * prime sees it before approving and may delete it; approval is the moment it
 * becomes real, so this runs on approval — and once more on every listing, for
 * documents approved before requests travelled. Idempotent: a moved line is
 * gone from its source.
 */
export function deliverRequests(project: Project, rel: string): number {
  const path = docPath(project, rel);
  if (!existsSync(path)) return 0;
  const text = readFileSync(path, 'utf8');
  if (readFrontmatter(text).status !== 'approved') return 0;
  const outgoing = parseOutgoing(text).filter((r) => {
    try {
      return existsSync(docPath(project, r.target));
    } catch {
      return false;
    }
  });
  if (outgoing.length === 0) return 0;
  // Remove from the source first, line by line, then file in the target.
  const lines = text.split('\n');
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      inSection = CHANGE_REQUESTS.test((h[1] ?? '').trim());
      continue;
    }
    if (!inSection) continue;
    const m = line.match(MARKED_LINE);
    if (!m || m[2] || (m[1] ?? '').trim().toLowerCase() === 'x') continue;
    const [reason, next] = foldWrapped(lines, i, m[4] ?? '');
    const name = m[3]!.replace(/^\.kortext\//, '');
    if (!outgoing.some((r) => r.target === name && r.reason === reason)) continue;
    lines.splice(i, next - i);
    i--;
  }
  writeFileSync(path, lines.join('\n'), 'utf8');
  for (const r of outgoing) appendIncomingRequest(project, r.target, rel, r.reason);
  return outgoing.length;
}

export function listDocs(db: Database.Database, project: Project, pkgRoot: string): DocInfo[] {
  const map = loadDocMap(pkgRoot, project.kind ?? 'new');
  const statuses = new Map<string, string>();
  const docs: DocInfo[] = [];
  const dir = join(project.repo_path, '.kortext');
  if (existsSync(dir)) {
    // Requests travel on approval. A document approved before they did still
    // carries its outgoing lines; deliver those now, before anything is read.
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      deliverRequests(project, file);
    }
    // One shelf: every .md in .kortext/ is a document of this project.
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
        // Read from the document's own section: what others asked of it is
        // filed here when they are approved, and decided here. An unwritten
        // document can already hold some — they go into its first write.
        revisionRequests: parseIncoming(body),
        denied: parseDenied(body),
        warnings: status === 'uninitialized' ? [] : parseWarnings(body),
        conflicts: status === 'uninitialized' ? [] : parseConflicts(body),
        // Filled once every document is known; nothing can be filed before then.
        section: 'todo',
        state: 'waiting',
        detail: 'queue',
        pendingRecheck: false,
      });
    }
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
  // Conflicts and findings do not gate the handshake. A conflict is not a
  // decision prime avoided; it is one deferred to the moment there is enough
  // information — the build phase, where prime is present anyway. It is handed
  // over, not settled here.
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
  /**
   * The same hash over the body alone. Approving rewrites `status:` and nothing
   * else, so two versions can differ as files and be the same document — and a
   * diff against the earlier of those two shows nothing changed, which is the
   * one thing the diff must never say when something did.
   */
  bodySha: string;
  source: string;
  created_at: string;
}

/** Everything above and including the closing `---` of the frontmatter. */
function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

export function listVersions(db: Database.Database, project: Project, rel: string): DocVersion[] {
  return (
    db
      .prepare(
        'SELECT id, sha, content, source, created_at FROM doc_versions WHERE project_id = ? AND rel = ? ORDER BY id DESC',
      )
      .all(project.id, rel) as Array<DocVersion & { content: string }>
  ).map(({ content, ...v }) => ({ ...v, bodySha: docVersion(stripFrontmatter(content)) }));
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
