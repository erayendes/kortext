import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { Project } from './db.js';
import { listRequests } from './requests.js';

export interface DocStep {
  output: string; // rel path like foundation/PRD.md
  inputs: string[];
  author: string | null;
  approver: string | null;
}

export interface DocInfo {
  rel: string;
  group: 'foundation' | 'references';
  name: string;
  status: string; // uninitialized | draft | approved | …
  author: string | null;
  inputs: string[];
  blocked: boolean; // an input is not approved yet
  revisionPending: boolean; // a pending revise request targets this doc
  upstreamChanged: boolean; // an approved/draft doc whose input regressed or has pending revision
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

// The panel's canonical dependency map comes from new-project-analysis
// (existing-project-analysis produces the same document set; per-project
// workflow choice can refine this later).
export function loadDocMap(pkgRoot: string): Map<string, DocStep> {
  const map = new Map<string, DocStep>();
  for (const wf of ['new-project-analysis.md', 'planning-pipeline.md']) {
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

const DOC_GROUPS = ['foundation', 'references'] as const;

export function listDocs(db: Database.Database, project: Project, pkgRoot: string): DocInfo[] {
  const map = loadDocMap(pkgRoot);
  const pendingRevise = new Set(
    listRequests(db, project.id, 'pending')
      .filter((r) => r.type === 'revise')
      .map((r) => {
        try {
          return (JSON.parse(r.payload) as { doc?: string }).doc ?? '';
        } catch {
          return '';
        }
      }),
  );

  const statuses = new Map<string, string>();
  const docs: DocInfo[] = [];
  for (const group of DOC_GROUPS) {
    const dir = join(project.repo_path, '.kortext', group);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
      const rel = `${group}/${file}`;
      const fm = readFrontmatter(readFileSync(join(dir, file), 'utf8'));
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
        revisionPending: pendingRevise.has(rel),
        upstreamChanged: false,
      });
    }
  }

  const byRel = new Map(docs.map((d) => [d.rel, d]));
  for (const doc of docs) {
    doc.blocked = doc.inputs.some((i) => (statuses.get(i) ?? 'uninitialized') !== 'approved');
    // Already-written doc whose input got a revision request or fell out of
    // approved — the reader should re-check it against the new upstream.
    doc.upstreamChanged =
      doc.status !== 'uninitialized' &&
      doc.inputs.some((i) => {
        const input = byRel.get(i);
        return input ? input.revisionPending || input.status !== 'approved' : false;
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

export function docPath(project: Project, rel: string): string {
  if (!/^(foundation|references|reports)\/[\w.-]+\.md$/.test(rel)) throw new Error(`bad doc path: ${rel}`);
  return join(project.repo_path, '.kortext', rel);
}
