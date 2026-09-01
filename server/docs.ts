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
  upstreamChanged: boolean; // an approved/draft doc whose input regressed
  openQuestions: boolean; // carries unanswered questions for prime
  /** Changes other documents have asked of THIS one, still unactioned. */
  revisionRequests: Array<{ from: string; reason: string }>;
}

/**
 * A document that finds a problem upstream writes one line under
 * `## Revision Requests`, naming the target file in backticks. Parsed so the
 * panel can offer the action — a demand in prose is one nobody can act on.
 */
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
    // `- \`TARGET.md\` — reason`; the template's own bracket prompt is not one.
    const m = line.match(/^\s*[-*+]\s+`([A-Za-z][\w./-]*\.md)`\s*[—:-]?\s*(.*)$/);
    if (m) out.push({ target: m[1].replace(/^\.kortext\//, ''), reason: m[2].trim() });
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

// A demand a human has already acted on is remembered next to the project, not
// inside the document that made it — the requester is not re-run just to strike
// its own line out.
const HANDLED_REL = join('.kortext', '.revisions.json');

export function requestKey(from: string, target: string, reason: string): string {
  return `${from}→${target}: ${reason.slice(0, 120)}`;
}

export function readHandledRequests(project: Project): Set<string> {
  const p = join(project.repo_path, HANDLED_REL);
  if (!existsSync(p)) return new Set();
  try {
    return new Set(JSON.parse(readFileSync(p, 'utf8')) as string[]);
  } catch {
    return new Set();
  }
}

export function markRequestHandled(project: Project, key: string): void {
  const handled = readHandledRequests(project);
  handled.add(key);
  writeFileSync(join(project.repo_path, HANDLED_REL), JSON.stringify([...handled], null, 2), 'utf8');
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
        upstreamChanged: false,
        openQuestions: status !== 'uninitialized' && hasOpenQuestions(body),
        revisionRequests: [],
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
  const handled = readHandledRequests(project);
  for (const r of requests) {
    const target = docs.find((d) => d.rel === r.target || d.rel.endsWith(`/${r.target}`));
    // A document that was never written cannot be asked to change — the step
    // that writes it will read the requester as an input anyway.
    if (target && target.status !== 'uninitialized' && !handled.has(requestKey(r.from, r.target, r.reason))) {
      target.revisionRequests.push({ from: r.from, reason: r.reason });
    }
  }

  // 'not-applicable' satisfies a dependency: the doc was considered and
  // deliberately skipped — downstream steps must not wait on it.
  const settled = (s: string | undefined) => s === 'approved' || s === 'not-applicable';
  const byRel = new Map(docs.map((d) => [d.rel, d]));
  for (const doc of docs) {
    doc.blocked = doc.inputs.some((i) => !settled(statuses.get(i)));
    // Already-written doc whose input fell out of approved — the reader
    // should re-check it against the new upstream.
    doc.upstreamChanged =
      doc.status !== 'uninitialized' &&
      doc.inputs.some((i) => {
        const input = byRel.get(i);
        return input ? !settled(input.status) : false;
      });
  }

  // Dependency-ish ordering: docs with fewer unmet/deeper inputs first (BRD → … → PFD).
  const depth = (rel: string, seen = new Set<string>()): number => {
    if (seen.has(rel)) return 0;
    seen.add(rel);
    const ins = map.get(rel)?.inputs ?? [];
    return ins.length === 0 ? 0 : 1 + Math.max(...ins.map((i) => depth(i, seen)));
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
