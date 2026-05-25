import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Handover rotation service.
 *
 * Spec: v3.1-architecture-proposal.md Bölüm 6 + Bölüm 11. When the live
 * `<projectRoot>/.kortext/memory/handover.md` accumulates more than N
 * entries OR grows past a byte threshold, the file is archived as
 * `handover-<YYYY-MM-DD-HHMM>.md` (timestamp = the last/newest entry's
 * timestamp, falling back to `now()`) and the live file is reset to the
 * empty template.
 *
 * Idempotent: calling twice on an already-rotated file is a no-op. If the
 * archive path already exists (same timestamp), a numeric suffix `-2`,
 * `-3`, ... is appended.
 */

export type RotationOptions = {
  projectRoot: string;
  /** Entry count threshold. Default: 5. */
  maxEntries?: number;
  /** Byte threshold. Default: 30 * 1024. */
  maxBytes?: number;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
};

export type RotationResult =
  | {
      rotated: true;
      archivePath: string;
      entries: number;
      sizeBytes: number;
    }
  | {
      rotated: false;
      reason: 'below_threshold' | 'no_file';
    };

const DEFAULT_MAX_ENTRIES = 5;
const DEFAULT_MAX_BYTES = 30 * 1024;

const LIVE_FILE_HEADER =
  '# Handover Reports\n\n' +
  '> **Entry-level frontmatter disipline:** Her devir kaydi kendi YAML frontmatter\'i ile baslar (dosya-level frontmatter YOK). Yeni kayitlar dosyanin **en ustune** eklenir; eski kayitlar silinmez.\n' +
  '>\n' +
  '> **Rotation:** 5 devir VEYA dosya boyutu > 30 KB oldugunda engine `handover-<YYYY-MM-DD-HHMM>.md` adiyla rotation yapar.\n';

const ENTRY_HEADING_RE = /^## Handover:/gm;
const DATE_LINE_RE = /\*\*Date:\*\*\s+(\d{2}\.\d{2}\.\d{2}-\d{2}:\d{2})/g;
const DATE_PARSE_RE = /^(\d{2})\.(\d{2})\.(\d{2})-(\d{2}):(\d{2})$/;

/**
 * Counts `## Handover:` entries in the markdown body.
 */
export function countHandoverEntries(content: string): number {
  const matches = content.match(ENTRY_HEADING_RE);
  return matches ? matches.length : 0;
}

/**
 * Parses the timestamp of the oldest entry in the file and returns it as
 * `YYYY-MM-DD-HHMM`. The handover engine renders dates in
 * `DD.MM.YY-HH:MM`. We grab the LAST Date line (oldest, since new entries
 * are prepended) and fall back to `now()` if none match.
 */
export function deriveArchiveTimestamp(content: string, now: Date): string {
  const dateLines = [...content.matchAll(DATE_LINE_RE)];
  const lastDate = dateLines[dateLines.length - 1];
  const raw = lastDate?.[1];
  if (raw) {
    const m = DATE_PARSE_RE.exec(raw);
    if (m) {
      const [, dd, mm, yy, hh, mi] = m;
      return `20${yy}-${mm}-${dd}-${hh}${mi}`;
    }
  }
  return formatTimestamp(now);
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`
  );
}

function uniqueArchivePath(memoryDir: string, baseStamp: string): string {
  const candidate = join(memoryDir, `handover-${baseStamp}.md`);
  if (!existsSync(candidate)) return candidate;
  for (let i = 2; i < 100; i += 1) {
    const next = join(memoryDir, `handover-${baseStamp}-${i}.md`);
    if (!existsSync(next)) return next;
  }
  return join(memoryDir, `handover-${baseStamp}-99.md`);
}

export function rotateHandover(opts: RotationOptions): RotationResult {
  const memoryDir = join(opts.projectRoot, '.kortext', 'memory');
  const livePath = join(memoryDir, 'handover.md');
  if (!existsSync(livePath)) {
    return { rotated: false, reason: 'no_file' };
  }
  const content = readFileSync(livePath, 'utf8');
  const sizeBytes = statSync(livePath).size;
  const entries = countHandoverEntries(content);
  const maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  if (entries < maxEntries && sizeBytes <= maxBytes) {
    return { rotated: false, reason: 'below_threshold' };
  }
  if (entries === 0) {
    // Crossed the byte threshold but no entries to archive — resetting
    // would just empty the file. Treat as below_threshold.
    return { rotated: false, reason: 'below_threshold' };
  }

  const now = (opts.now ?? (() => new Date()))();
  const stamp = deriveArchiveTimestamp(content, now);
  const archivePath = uniqueArchivePath(memoryDir, stamp);

  writeFileSync(archivePath, content, 'utf8');
  writeFileSync(livePath, LIVE_FILE_HEADER, 'utf8');

  return { rotated: true, archivePath, entries, sizeBytes };
}
