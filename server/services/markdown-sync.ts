import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import type { Repositories } from '../db/repositories/index.ts';
import type { ReportStatus } from '../db/schemas.ts';
import { updateToc } from './toc-updater.ts';

/**
 * Markdown ↔ SQLite sync for *generated artifacts* (decisions, handovers, learned).
 *
 * Strategy (from ROADMAP-v3.md):
 *   - Engine produces these markdown files for human-readable history.
 *   - SQLite stores an index so dashboard / queries don't have to scan disk.
 *   - The disk file is canonical content; the row is canonical for status/metadata.
 *
 * Read-only human-authored markdown (blueprint, agents/, workflows/, rules/) is
 * NEVER touched here — those stay on disk and are parsed at engine startup
 * directly into in-memory registries.
 */

export type WorkspaceLayout = {
  /** Project root (where .kortext/ lives). */
  root: string;
};

const DECISIONS_SUBDIR = '.kortext/memory/decisions';
const HANDOVERS_SUBDIR = '.kortext/memory/handovers';
const REPORTS_SUBDIR = '.kortext/reports';

/** Single-file ADR markdown (v3.1 spec Bölüm 5.4). Engine maintains its TOC. */
const DECISIONS_SINGLE_FILE = '.kortext/memory/decisions.md';
/** Single-file learned markdown (v3.1 spec Bölüm 5.4). Never archived. */
const LEARNED_SINGLE_FILE = '.kortext/memory/learned.md';

/**
 * Per-file report filename pattern:
 *   <report-type>_<project-id>_<YYYY-MM-DD_HH-MM-SS>.md   (canonical, UAT #5)
 *
 * report-type is kebab-case lowercase; the slug carries the project id
 * (project.json.code, e.g. `NOT`) so it accepts UPPERCASE too. Underscores
 * separate the three parts. The legacy `YYYY-MM-DD-HHMM` timestamp is still
 * accepted so reports written before the standard change keep indexing.
 */
export const REPORT_FILENAME_PATTERN =
  /^([a-z][a-z0-9-]*)_([A-Za-z0-9][A-Za-z0-9-]*)_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}-\d{4})\.md$/;

export type ParsedReportFilename = {
  scope: string;
  slug: string;
  timestamp: string;
};

/**
 * Parse a per-file report filename. Returns null if the name does not match
 * the v3.1 pattern. Accepts a full path or a bare filename.
 */
export function parseReportFilename(pathOrName: string): ParsedReportFilename | null {
  const name = basename(pathOrName);
  const match = REPORT_FILENAME_PATTERN.exec(name);
  if (!match) return null;
  const [, scope, slug, timestamp] = match;
  if (!scope || !slug || !timestamp) return null;
  return { scope, slug, timestamp };
}

// Canonical single timestamp format: YYYY-MM-DD_HH-MM-SS (UAT #5 standard).
// One format everywhere — the engine writer, the workflow instructions, and the
// output-resolver matcher all speak this shape, so an agent-written report and a
// Kortext-written report are indistinguishable to the indexer.
function formatReportTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `_${pad(date.getUTCHours())}-${pad(date.getUTCMinutes())}-${pad(date.getUTCSeconds())}`
  );
}

function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { encoding: 'utf8' });
}

function todayIsoDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export class MarkdownSyncService {
  constructor(
    private readonly repos: Repositories,
    private readonly layout: WorkspaceLayout,
  ) {}

  /**
   * Persist an ADR markdown file and index it in decisions_index.
   * Returns the relative markdown path.
   */
  writeDecision(input: {
    decision_id: string;
    title: string;
    status?: 'proposed' | 'accepted' | 'superseded' | 'rejected';
    body_md: string;
    item_id?: string | null;
    tags?: string[];
  }): { markdown_path: string; absolutePath: string } {
    const filename = `${input.decision_id.toLowerCase()}.md`;
    const absolutePath = resolve(this.layout.root, DECISIONS_SUBDIR, filename);
    const relPath = relative(this.layout.root, absolutePath);

    const frontmatter = [
      '---',
      `decision_id: ${input.decision_id}`,
      `title: ${JSON.stringify(input.title)}`,
      `status: ${input.status ?? 'proposed'}`,
      `date: ${todayIsoDate()}`,
      input.item_id ? `item_id: ${input.item_id}` : null,
      input.tags && input.tags.length > 0 ? `tags: [${input.tags.join(', ')}]` : null,
      '---',
      '',
    ]
      .filter((line): line is string => line !== null)
      .join('\n');

    writeAtomic(absolutePath, frontmatter + input.body_md);

    const existing = this.repos.decisions.get(input.decision_id);
    if (existing) {
      this.repos.decisions.transition(input.decision_id, input.status ?? existing.status);
    } else {
      this.repos.decisions.create({
        decision_id: input.decision_id,
        title: input.title,
        status: input.status ?? 'proposed',
        markdown_path: relPath,
        item_id: input.item_id ?? null,
        tags: input.tags ?? [],
      });
    }

    // Best-effort TOC refresh on the single-file ADR doc, if it exists and
    // opts in (i.e. has a `## İçindekiler` heading). Errors swallowed —
    // the per-file ADR + index row are already persisted.
    this.refreshTocBestEffort(DECISIONS_SINGLE_FILE);

    return { markdown_path: relPath, absolutePath };
  }

  /**
   * Append a `## Öğrenim: <title>` block to `.kortext/memory/learned.md`
   * and refresh its TOC. Unlike ADRs, learned entries are NOT indexed in
   * SQL (Eray's decision — knowledge base stays pure markdown).
   *
   * Idempotent on identical (title, body) — the file is append-only by
   * design; callers are responsible for de-duplication if needed.
   */
  writeLearned(input: {
    title: string;
    body_md: string;
    author?: string | null;
    status?: 'Waiting' | 'Approved' | 'Rejected';
    approver?: string | null;
    timestamp?: Date;
  }): { markdown_path: string; absolutePath: string } {
    const absolutePath = resolve(this.layout.root, LEARNED_SINGLE_FILE);
    const relPath = relative(this.layout.root, absolutePath);
    mkdirSync(dirname(absolutePath), { recursive: true });

    const ts = input.timestamp ?? new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp =
      `${ts.getUTCFullYear()}-${pad(ts.getUTCMonth() + 1)}-${pad(ts.getUTCDate())}` +
      `-${pad(ts.getUTCHours())}:${pad(ts.getUTCMinutes())}`;

    const header =
      `## Öğrenim: ${input.title}\n` +
      `**Author:** ${input.author ?? 'unknown'} | **Status:** ${input.status ?? 'Waiting'} | ${stamp}` +
      (input.approver ? ` | **Approver:** ${input.approver}` : '') +
      '\n\n';
    const block = header + input.body_md + (input.body_md.endsWith('\n') ? '' : '\n') + '\n';

    if (!existsSync(absolutePath)) {
      // Seed with a minimal scaffold so the TOC heading exists.
      writeFileSync(
        absolutePath,
        '# Knowledge Base\n\n## İçindekiler\n\n---\n\n' + block,
        'utf8',
      );
    } else {
      appendFileSync(absolutePath, block, 'utf8');
    }

    this.refreshTocBestEffort(LEARNED_SINGLE_FILE);

    return { markdown_path: relPath, absolutePath };
  }

  /**
   * Refresh the TOC of a single-file memory document (decisions / learned)
   * if it exists. Errors are swallowed — TOC maintenance MUST NOT break
   * the calling write path.
   */
  private refreshTocBestEffort(subPath: string): void {
    try {
      const absolutePath = resolve(this.layout.root, subPath);
      updateToc({ filePath: absolutePath });
    } catch {
      // Best-effort.
    }
  }

  /**
   * Persist a handover markdown file and insert a handovers row.
   * The markdown_path is stored on the row for round-trip lookup.
   */
  writeHandover(input: {
    item_id: string | null;
    from_persona: string;
    to_persona: string;
    reason?: string | null;
    context: Record<string, unknown>;
    body_md: string;
  }): { handoverId: number; markdown_path: string } {
    const ts = new Date();
    const stamp = ts.toISOString().replace(/[:.]/g, '-');
    const slug = input.item_id ? `${input.item_id}-${stamp}` : `general-${stamp}`;
    const absolutePath = resolve(this.layout.root, HANDOVERS_SUBDIR, `${slug}.md`);
    const relPath = relative(this.layout.root, absolutePath);

    const frontmatter = [
      '---',
      `from: ${input.from_persona}`,
      `to: ${input.to_persona}`,
      input.item_id ? `item_id: ${input.item_id}` : null,
      `created_at: ${ts.toISOString()}`,
      input.reason ? `reason: ${JSON.stringify(input.reason)}` : null,
      '---',
      '',
    ]
      .filter((line): line is string => line !== null)
      .join('\n');

    writeAtomic(absolutePath, frontmatter + input.body_md);

    const row = this.repos.handovers.create({
      item_id: input.item_id,
      from_persona: input.from_persona,
      to_persona: input.to_persona,
      reason: input.reason ?? null,
      context_payload: input.context,
      markdown_path: relPath,
    });

    return { handoverId: row.id, markdown_path: relPath };
  }

  /**
   * Persist a per-file report under `.kortext/reports/` and index it.
   *
   * Naming pattern (v3.1 spec section 6):
   *   <scope>_<slug>_<YYYY-MM-DD-HHMM>.md
   *
   * Returns the absolute + relative path and the indexed row id. If a row
   * already exists for the target file_path (re-write), the row is reused
   * and its status updated.
   */
  writeReport(input: {
    scope: string;
    slug: string;
    body_md: string;
    author?: string | null;
    status?: ReportStatus;
    tags?: string[];
    related_item?: string | null;
    /** Override timestamp (mostly for tests). */
    timestamp?: Date;
  }): { markdown_path: string; absolutePath: string; reportId: number } {
    const ts = input.timestamp ?? new Date();
    const stamp = formatReportTimestamp(ts);
    const filename = `${input.scope}_${input.slug}_${stamp}.md`;
    const absolutePath = resolve(this.layout.root, REPORTS_SUBDIR, filename);
    const relPath = relative(this.layout.root, absolutePath);

    const frontmatter = [
      '---',
      `status: ${input.status ?? 'writing'}`,
      input.author ? `author: ${input.author}` : null,
      `updated_at: ${ts.toISOString()}`,
      input.related_item ? `related_item: ${input.related_item}` : null,
      input.tags && input.tags.length > 0
        ? `tags: [${input.tags.join(', ')}]`
        : null,
      '---',
      '',
    ]
      .filter((line): line is string => line !== null)
      .join('\n');

    writeAtomic(absolutePath, frontmatter + input.body_md);

    const existing = this.repos.reports.getByPath(relPath);
    if (existing) {
      const next = this.repos.reports.updateStatus(
        existing.id,
        input.status ?? existing.status,
      );
      return { markdown_path: relPath, absolutePath, reportId: next.id };
    }

    const row = this.repos.reports.create({
      scope: input.scope,
      slug: input.slug,
      file_path: relPath,
      author: input.author ?? null,
      status: input.status ?? 'writing',
      tags: input.tags ?? [],
      related_item: input.related_item ?? null,
    });
    return { markdown_path: relPath, absolutePath, reportId: row.id };
  }

  /**
   * Best-effort indexer: given an arbitrary output file written by the
   * engine, if it lives under `.kortext/reports/` AND matches the per-file
   * naming pattern, ensure a `reports_index` row exists for it.
   *
   * Used by the worker pool's post-step output guard to back-fill the index
   * for outputs the executor wrote on its own (without going through
   * `writeReport`).
   *
   * Returns the resulting (or pre-existing) row id, or null if the file is
   * not a per-file report.
   */
  indexReportFromPath(input: {
    absolutePath: string;
    author?: string | null;
    status?: ReportStatus;
    relatedItem?: string | null;
  }): number | null {
    const parsed = parseReportFilename(input.absolutePath);
    if (!parsed) return null;
    const relPath = relative(this.layout.root, input.absolutePath);
    // Only index files that actually fall inside the project's reports dir.
    if (!relPath.startsWith(`${REPORTS_SUBDIR}/`) && relPath !== REPORTS_SUBDIR) {
      return null;
    }
    if (!existsSync(input.absolutePath)) return null;

    const existing = this.repos.reports.getByPath(relPath);
    if (existing) return existing.id;

    const row = this.repos.reports.create({
      scope: parsed.scope,
      slug: parsed.slug,
      file_path: relPath,
      author: input.author ?? null,
      status: input.status ?? 'writing',
      tags: [],
      related_item: input.relatedItem ?? null,
    });
    return row.id;
  }

  /**
   * Reads a previously written markdown file given its stored relative path.
   * Returns null if the file no longer exists on disk (orphan index row).
   */
  readArtifact(relPath: string): string | null {
    const abs = join(this.layout.root, relPath);
    if (!existsSync(abs)) return null;
    return readFileSync(abs, 'utf8');
  }
}
