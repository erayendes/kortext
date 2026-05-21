#!/usr/bin/env tsx
/**
 * One-shot migration: parses workspace/memory/backlog/*.md item files and
 * inserts them into the backlog_items table. Idempotent — re-running it on the
 * same database leaves existing rows untouched.
 *
 * Skips:
 *   - Template files (TXX-, BXX-, etc. with literal XX in the filename)
 *   - Dashboard files (epic-dashboard.md, version-dashboard.md, debt-dashboard.md)
 *   - README and .gitkeep
 *
 * Usage:
 *   npx tsx bin/migrate-legacy-backlog.ts            # uses configured KORTEXT_DB_PATH
 *   npx tsx bin/migrate-legacy-backlog.ts --dry-run  # parse + report, no writes
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openDb } from '../server/db/client.ts';
import type { BacklogItemType, BacklogStatus } from '../server/db/schemas.ts';

const ROOT = resolve(process.cwd());
const BACKLOG_DIR = join(ROOT, 'workspace/memory/backlog');

const SKIP_FILES = new Set([
  'README.md',
  '.gitkeep',
  'epic-dashboard.md',
  'version-dashboard.md',
  'debt-dashboard.md',
]);

const PREFIX_TO_TYPE: Record<string, BacklogItemType> = {
  T: 'task',
  B: 'bug',
  D: 'debt',
  E: 'epic',
  S: 'spike',
  H: 'hotfix',
};

const STATUS_MAP: Record<string, BacklogStatus> = {
  'to do': 'to_do',
  todo: 'to_do',
  'in progress': 'in_progress',
  blocked: 'blocked',
  review: 'review',
  done: 'done',
  cancelled: 'cancelled',
  canceled: 'cancelled',
};

type ParsedItem = {
  id: string;
  type: BacklogItemType;
  title: string;
  status: BacklogStatus;
  owner: string | null;
  parent_id: string | null;
  body_md: string;
};

function isTemplate(filename: string): boolean {
  return /^[A-Z]XX-/.test(filename);
}

function parseItem(filename: string, content: string): ParsedItem | null {
  const stem = filename.replace(/\.md$/, '');
  const idMatch = stem.match(/^([TBDESH])(\d+)(?:-(.+))?$/);
  if (!idMatch) return null;
  const prefix = idMatch[1] ?? '';
  const num = idMatch[2] ?? '';
  const slug = idMatch[3] ?? '';
  const type = PREFIX_TO_TYPE[prefix];
  if (!type) return null;
  const id = `${prefix}${num}`;

  const titleMatch = content.match(/^#\s+(.+?)\s*$/m);
  const title = titleMatch?.[1]?.replace(/^[TBDESH]\d+[:\-]\s*/, '').trim() ?? slug ?? id;

  const statusMatch = content.match(/\*\*Status:\*\*\s*\[?([^\]\n]+?)\]?\s*$/im);
  const rawStatus = statusMatch?.[1]?.toLowerCase().trim() ?? 'to do';
  const status = STATUS_MAP[rawStatus] ?? 'to_do';

  const ownerMatch = content.match(/\*\*Assignee:\*\*\s*\[?(\+[\w-]+)\]?/i);
  const owner = ownerMatch?.[1] ?? null;

  const epicMatch = content.match(/\*\*Epic:\*\*\s*(E\d+)(?:-[\w-]+)?/i);
  const parent_id = epicMatch?.[1] ?? null;

  return { id, type, title, status, owner, parent_id, body_md: content };
}

function main(): void {
  const dryRun = process.argv.includes('--dry-run');
  const files = readdirSync(BACKLOG_DIR).filter((f) => f.endsWith('.md'));

  const { repositories } = openDb();

  const stats = { scanned: 0, skipped: 0, inserted: 0, alreadyExists: 0, unparseable: 0 };
  const inserted: string[] = [];

  for (const filename of files) {
    stats.scanned += 1;
    if (SKIP_FILES.has(filename) || isTemplate(filename)) {
      stats.skipped += 1;
      continue;
    }
    const content = readFileSync(join(BACKLOG_DIR, filename), 'utf8');
    const parsed = parseItem(filename, content);
    if (!parsed) {
      stats.unparseable += 1;
      console.warn(`  unparseable: ${filename}`);
      continue;
    }

    if (repositories.backlog.get(parsed.id)) {
      stats.alreadyExists += 1;
      continue;
    }

    if (dryRun) {
      inserted.push(`${parsed.id} (${parsed.type}) — ${parsed.title}`);
      continue;
    }

    repositories.backlog.create({
      id: parsed.id,
      type: parsed.type,
      title: parsed.title,
      status: parsed.status,
      owner: parsed.owner,
      parent_id: parsed.parent_id,
      version: null,
      frontmatter: {},
      body_md: parsed.body_md,
    });
    repositories.auditLog.append({
      actor: 'system',
      action: 'backlog.item.migrated',
      resource_type: 'backlog_item',
      resource_id: parsed.id,
      payload: { from: 'legacy_markdown', filename },
    });
    stats.inserted += 1;
    inserted.push(`${parsed.id} (${parsed.type}) — ${parsed.title}`);
  }

  console.log('\nLegacy backlog migration report');
  console.log('--------------------------------');
  console.log(`  scanned         ${stats.scanned}`);
  console.log(`  skipped         ${stats.skipped}  (templates, dashboards, README)`);
  console.log(`  unparseable     ${stats.unparseable}`);
  console.log(`  already exists  ${stats.alreadyExists}`);
  console.log(`  ${dryRun ? 'would insert   ' : 'inserted       '} ${
    dryRun ? inserted.length : stats.inserted
  }`);
  if (inserted.length > 0) {
    console.log('');
    for (const line of inserted) console.log(`    + ${line}`);
  }
  if (dryRun) console.log('\n(dry run — no writes performed)');
}

main();
