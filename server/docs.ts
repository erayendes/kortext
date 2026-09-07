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
  /* Open incoming revision requests. */
  revisionRequests: Array<{ from: string; reason: string }>;
  /* Open outgoing revision requests, also actionable from this document. */
  sentRequests: Array<{ target: string; reason: string; targetHasStep: boolean }>;
}

/* A revision request names a target file in backticks under Revision Requests. */
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
    // Checked requests are settled and excluded from the pending list.
    if (m && (m[1] ?? '').trim().toLowerCase() !== 'x') {
      out.push({ target: m[2]!.replace(/^\.kortext\//, ''), reason: m[3]!.trim() });
    }
  }
  return out;
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

// Record the outcome in the requesting document so the panel and CLI read the same state.
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
    if (m[2]!.replace(/^\.kortext\//, '') !== target.replace(/^.*\//, '') && m[2] !== target)
      continue;
    if ((m[3] ?? '').trim() !== reason.trim()) continue;
    // Keep both the settled marker and the outcome in the source document.
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
