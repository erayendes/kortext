import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type { Repositories } from '../db/repositories/index.ts';

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

    return { markdown_path: relPath, absolutePath };
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
   * Reads a previously written markdown file given its stored relative path.
   * Returns null if the file no longer exists on disk (orphan index row).
   */
  readArtifact(relPath: string): string | null {
    const abs = join(this.layout.root, relPath);
    if (!existsSync(abs)) return null;
    return readFileSync(abs, 'utf8');
  }
}
