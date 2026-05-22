import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { Repositories } from '../db/repositories/index.ts';
import type { PersonaRegistry } from './persona-registry.ts';
import { gitCommit } from './git-commit.ts';

/**
 * Handover engine — TS port of legacy/scripts/kortext-handover.py.
 *
 * Records a persona-to-persona handover both as a row in the SQLite
 * `handovers` table (machine-readable, for dashboard/timeline) and as a
 * markdown block prepended to `workspace/memory/handover.md` (human-
 * readable, preserved for backwards continuity with v2 reviewers).
 *
 * `from` and `to` personas are validated against the registry — bad
 * handles throw immediately rather than silently writing dangling
 * references.
 */

export type HandoverStatus = 'completed' | 'blocked' | 'partial';

export type HandoverInput = {
  itemId: string;
  title: string;
  fromPersona: string;
  toPersona: string;
  status: HandoverStatus;
  completed: string;
  context: string;
  changedFiles?: string[];
  watchOuts?: string[];
  lastCommit?: string;
  nextStep: string;
};

export type HandoverResult = {
  handoverId: number;
  markdownPath: string;
  /** New HEAD sha when git auto-commit succeeded; null otherwise. */
  commitSha: string | null;
};

export type HandoverEngineOptions = {
  repos: Repositories;
  personas: PersonaRegistry;
  /** Project workspace root — handover.md lives at `<root>/memory/handover.md`. */
  workspaceRoot: string;
  /**
   * When set, the engine commits the markdown change after each record()
   * with message `chore(kortext): handover <itemId>`. Best-effort: a
   * failure (no git, dirty index, etc.) leaves commitSha=null.
   */
  git?: { repoRoot: string };
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
};

const STATUS_LABELS: Record<HandoverStatus, string> = {
  completed: 'Tamamlandı',
  blocked: 'Bloklandı',
  partial: 'Kısmen tamamlandı',
};

const FILE_HEADER = '# Handover Reports\n';

export class HandoverEngine {
  constructor(private readonly opts: HandoverEngineOptions) {}

  record(input: HandoverInput): HandoverResult {
    this.assertKnownPersona(input.fromPersona, 'from');
    this.assertKnownPersona(input.toPersona, 'to');

    const markdownPath = join(this.opts.workspaceRoot, 'memory', 'handover.md');
    mkdirSync(dirname(markdownPath), { recursive: true });

    const now = (this.opts.now ?? (() => new Date()))();
    const block = renderBlock(input, now);

    const existing = existsSync(markdownPath)
      ? readFileSync(markdownPath, 'utf8')
      : FILE_HEADER;
    const next = existing.startsWith(FILE_HEADER)
      ? `${FILE_HEADER}\n${block}${existing.slice(FILE_HEADER.length)}`
      : `${FILE_HEADER}\n${block}${existing}`;
    writeFileSync(markdownPath, next, 'utf8');

    const relPath = relative(this.opts.workspaceRoot, markdownPath);
    const handover = this.opts.repos.handovers.create({
      item_id: input.itemId,
      from_persona: input.fromPersona,
      to_persona: input.toPersona,
      reason: null,
      context_payload: {
        status: input.status,
        title: input.title,
        completed: input.completed,
        context: input.context,
        changed_files: input.changedFiles ?? [],
        watch_outs: input.watchOuts ?? [],
        last_commit: input.lastCommit ?? null,
        next_step: input.nextStep,
      },
      markdown_path: relPath,
    });

    let commitSha: string | null = null;
    if (this.opts.git) {
      const repoRoot = this.opts.git.repoRoot;
      const pathInRepo = relative(repoRoot, markdownPath);
      const commit = gitCommit({
        repoRoot,
        message: `chore(kortext): handover ${input.itemId}`,
        paths: [pathInRepo],
      });
      if (commit.ok) commitSha = commit.sha;
    }

    return { handoverId: handover.id, markdownPath, commitSha };
  }

  private assertKnownPersona(handle: string, role: 'from' | 'to'): void {
    if (this.opts.personas.get(handle) === null) {
      throw new Error(`unknown persona for ${role}: ${handle}`);
    }
  }
}

function renderBlock(input: HandoverInput, now: Date): string {
  const date = formatDate(now);
  const label = STATUS_LABELS[input.status];
  const changed = bulletList(input.changedFiles);
  const watchOuts = bulletList(input.watchOuts);
  return `## Handover: ${input.itemId} — ${input.title}

> [!INFO]
> - **Author:** ${input.fromPersona}
> - **To:** ${input.toPersona}
> - **Date:** ${date}
> - **Status:** ${label}

### ✅ Completed

- ${input.completed}

### Changed Files

${changed}

### Kritik Bağlam

- ${input.context}

### Watch-outs & Decisions

${watchOuts}

### Last Commit

- ${input.lastCommit ?? 'Yok'}

### Next Steps

- ${input.nextStep}

`;
}

function bulletList(items: string[] | undefined): string {
  if (!items || items.length === 0) return '- Yok';
  return items.map((s) => `- ${s}`).join('\n');
}

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const yy = pad(d.getFullYear() % 100);
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${dd}.${mm}.${yy}-${hh}:${mi}`;
}
