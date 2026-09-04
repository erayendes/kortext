import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { Project } from './db.js';

export interface DocStep {
  output: string; // rel path like foundation/PRD.md
  inputs: string[];
  author: string | null;
  approver: string | null;
}

export interface DocInfo {
  rel: string;
  group: 'core' | 'foundation';
  name: string;
  status: string; // uninitialized | draft | approved | …
  author: string | null;
  inputs: string[];
  blocked: boolean; // an input is not approved yet
  /**
   * Approved, but an input is moving: it carries an open demand of its own, or
   * it fell out of approved. Nothing is wrong yet — when that input settles
   * again, this document is re-read against it.
   */
  dependentOn: string[];
  openQuestions: boolean; // carries unanswered questions for prime
  /** A workflow step writes this document. The brief has none — it is prime's own. */
  hasProducingStep: boolean;
  /** Changes other documents have asked of THIS one, still unactioned. */
  revisionRequests: Array<{ from: string; reason: string }>;
  /** Changes THIS one has asked of others, still unactioned — decidable here too. */
  sentRequests: Array<{ target: string; reason: string; targetHasStep: boolean }>;
}

/**
 * A document that finds a problem upstream writes one line under
 * `## Revision Requests`, naming the target file in backticks. Parsed so the
 * panel can offer the action — a demand in prose is one nobody can act on.
 */
// `- [ ] \`TARGET.md\` — reason`. The checkbox is optional (older documents and
// the templates write the bare form) and, when ticked, means the demand is
// settled. The template's own bracket prompt is not a request.
const REQUEST_LINE = /^\s*[-*+]\s+(?:\[([ xX]?)\]\s*)?`([A-Za-z][\w./-]*\.md)`\s*[—:-]?\s*(.*)$/;

export function parseRevisionRequests(content: string): Array<{ target: string; reason: string }> {
  const out: Array<{ target: string; reason: string }> = [];
  let inSection = false;
  for (const line of content.split('\n')) {
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      inSection = /revision requests/i.test(heading[1]);
      continue;
    }
    if (!inSection) continue;
    const m = line.match(REQUEST_LINE);
    // A ticked box is a demand that has been settled — the line under it says
    // how. Both the panel and every agent reading the document see the same mark.
    if (m && (m[1] ?? '').trim().toLowerCase() !== 'x') {
      out.push({ target: m[2]!.replace(/^\.kortext\//, ''), reason: m[3]!.trim() });
    }
  }
  return out;
}

// Every written document keeps its questions under one heading, so "is anyone
// waiting on the human?" is a scan rather than a judgement. A line that is
// still the template's own bracket prompt does not count as a question.
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

// Parses workflow step metadata: numbered steps carrying
//   1. **+persona:** …
//      - inputs: `.kortext/foundation/BRD.md`, …
//      - outputs: `.kortext/references/STACK.md`
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
    const paths = (s: string) =>
      [...s.matchAll(/`\.kortext\/([^`]+)`/g)].map((m) => m[1]);
    if (/^\s*-\s*inputs:/.test(line)) inputs = paths(line);
    else if (/^\s*-\s*outputs:/.test(line)) outputs = paths(line);
    else if (/^\s*-\s*approver:/.test(line)) approver = line.split('approver:')[1].trim();
  }
  flush();
  return steps;
}

// The dependency map follows the project's kind: a 'new' project reads
// new-project-analysis, an 'existing' one existing-project-analysis
// (planning steps apply to both).
export function workflowNameFor(kind: 'new' | 'existing'): string {
  return kind === 'existing' ? 'existing-project-analysis' : 'new-project-analysis';
}

export function loadDocMap(pkgRoot: string, kind: 'new' | 'existing' = 'new'): Map<string, DocStep> {
  const map = new Map<string, DocStep>();
  for (const wf of [`${workflowNameFor(kind)}.md`, 'planning-pipeline.md']) {
    const p = join(pkgRoot, 'workflows', wf);
    if (!existsSync(p)) continue;
    for (const step of parseWorkflowSteps(readFileSync(p, 'utf8'))) {
      if (!map.has(step.output)) map.set(step.output, step);
    }
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

// A settled demand is recorded where it was made. Keeping the outcome in a
// side file meant the document still read as an open demand to every agent that
// opened it — the panel knew it was closed and the model did not. So the line
// itself carries the verdict, and the document is the only source of truth.
export function markRequestHandled(
  project: Project,
  from: string,
  target: string,
  reason: string,
  outcome: string,
): void {
  const path = docPath(project, from);
  if (!existsSync(path)) return;
  const day = new Date().toISOString().slice(0, 10);
  const lines = readFileSync(path, 'utf8').split('\n');
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      inSection = /revision requests/i.test(heading[1] ?? '');
      continue;
    }
    if (!inSection) continue;
    const m = line.match(REQUEST_LINE);
    if (!m) continue;
    if (m[2]!.replace(/^\.kortext\//, '') !== target.replace(/^.*\//, '') && m[2] !== target) continue;
    if ((m[3] ?? '').trim() !== reason.trim()) continue;
    // The ticked box says it is closed; the line under it says what closed it,
    // so "dismissed" and "the agent rewrote it" are not the same record.
    lines.splice(i, 1, `- [x] \`${m[2]}\` — ${m[3]}`, `  - ${outcome} · ${day}`);
    writeFileSync(path, lines.join('\n'), 'utf8');
    return;
  }
}

export function listDocs(db: Database.Database, project: Project, pkgRoot: string): DocInfo[] {
  const map = loadDocMap(pkgRoot, project.kind ?? 'new');
  const statuses = new Map<string, string>();
  const docs: DocInfo[] = [];
  const requests: Array<{ from: string; target: string; reason: string }> = [];
  const collect = (dir: string, group: 'core' | 'foundation', relPrefix: string, skip: Set<string>) => {
    if (!existsSync(dir)) return;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.md') && !skip.has(f)).sort()) {
      const rel = `${relPrefix}${file}`;
      const body = readFileSync(join(dir, file), 'utf8');
      const fm = readFrontmatter(body);
      const status = fm.status ?? 'uninitialized';
      statuses.set(rel, status);
      docs.push({
        rel,
        group,
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
      });
      if (status !== 'uninitialized') {
        for (const r of parseRevisionRequests(body)) requests.push({ ...r, from: rel });
      }
    }
  };
  // Root = the living core. TODO.md belongs to the Plan tab, not Documents.
  collect(join(project.repo_path, '.kortext'), 'core', '', new Set(['TODO.md']));
  collect(join(project.repo_path, '.kortext', 'foundation'), 'foundation', 'foundation/', new Set());

  // Each request lands in the inbox of the document it names. One a human has
  // already actioned is remembered outside the documents, so sending a file
  // back does not leave the demand standing forever.
  for (const r of requests) {
    const target = docs.find((d) => d.rel === r.target || d.rel.endsWith(`/${r.target}`));
    // A document that was never written cannot be asked to change — the step
    // that writes it will read the requester as an input anyway.
    if (!target || target.status === 'uninitialized') continue;
    // Key on the RESOLVED rel, which is what the deciding route writes. Keying
    // on the raw name a document typed (`BRD.md`) meant a decision recorded
    // against `foundation/BRD.md` never matched, and the demand stood forever.
    target.revisionRequests.push({ from: r.from, reason: r.reason });
    // The same demand, seen from the document that made it: deciding it there
    // saves opening the target just to answer a question you already read.
    docs
      .find((d) => d.rel === r.from)
      ?.sentRequests.push({ target: target.rel, reason: r.reason, targetHasStep: target.hasProducingStep });
  }

  // 'not-applicable' satisfies a dependency: the doc was considered and
  // deliberately skipped — downstream steps must not wait on it.
  const settled = (s: string | undefined) => s === 'approved' || s === 'not-applicable';
  const byRel = new Map(docs.map((d) => [d.rel, d]));
  for (const doc of docs) {
    doc.blocked = doc.inputs.some((i) => !settled(statuses.get(i)));
    // Only an approved document can be dependent: an unwritten one has nothing
    // to re-read, and one still in draft is about to be rewritten anyway. The
    // input is "moving" either because someone asked it to change or because it
    // fell out of approved — for the reader the two mean the same thing.
    if (doc.status !== 'approved') continue;
    doc.dependentOn = doc.inputs.filter((i) => {
      const input = byRel.get(i);
      if (!input) return false;
      return input.revisionRequests.length > 0 || !settled(input.status);
    });
  }

  // Dependency ordering: a document sits one step behind its deepest input
  // (BRD → … → PFD). The graph is a diamond — nearly everything descends from
  // the PRD — so the memo has to be per-document and the cycle guard has to be
  // the path being walked, not every document already seen. Sharing one "seen"
  // set across sibling branches makes the second branch to reach a shared input
  // score it 0, which collapses the order into traversal order.
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
  docs.sort((a, b) => depth(a.rel) - depth(b.rel) || a.rel.localeCompare(b.rel));
  return docs;
}

// The handshake is done when every document the workflow produces is settled
// (approved or not-applicable). Docs without a producing step (unmapped
// skeletons a project already carried) don't gate completion.
export function analysisComplete(db: Database.Database, project: Project, pkgRoot: string): boolean {
  const map = loadDocMap(pkgRoot, project.kind ?? 'new');
  const docs = listDocs(db, project, pkgRoot);
  const byRel = new Map(docs.map((d) => [d.rel, d.status]));
  const targets = [...map.keys()];
  if (targets.length === 0) return false;
  const settled = (s: string | undefined) => s === 'approved' || s === 'not-applicable';
  // BRD gates the new-project flow even though no step produces it
  if ((project.kind ?? 'new') === 'new' && !settled(byRel.get('foundation/BRD.md'))) return false;
  if (targets.some((rel) => docs.find((d) => d.rel === rel)?.openQuestions)) return false;
  if (docs.some((d) => d.revisionRequests.length > 0)) return false;
  return targets.every((rel) => settled(byRel.get(rel)));
}

// rel is relative to .kortext/: a root doc ("STACK.md"), or one under
// foundation/. The pattern forbids traversal ("." never starts
// a segment) and anything outside those three places.
export function docPath(project: Project, rel: string): string {
  if (!/^(?:foundation\/)?[A-Za-z][\w.-]*\.md$/.test(rel)) {
    throw new Error(`bad doc path: ${rel}`);
  }
  return join(project.repo_path, '.kortext', rel);
}
