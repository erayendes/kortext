import type Database from 'better-sqlite3';
import {
  AuditLogInsertSchema,
  AuditLogSchema,
  type AuditLogInsert,
  type AuditLogRow,
} from '../schemas.ts';
import { packJson, unpackJson } from '../json.ts';

type Row = {
  id: number;
  actor: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  payload: string;
  created_at: number;
};

function rowToAudit(row: Row): AuditLogRow {
  return AuditLogSchema.parse({
    ...row,
    payload: unpackJson<Record<string, unknown>>(row.payload, {}),
  });
}

/**
 * Actions hidden from the global activity feed (Dashboard timeline). These are
 * high-volume per-item bookkeeping rows — a single planning enrichment pass
 * emits one `backlog.patch` per item (hundreds in a real run), which would bury
 * the meaningful lifecycle/gate events. The per-step `backlog.patch.summary`
 * (one row per step) survives, so the feed still shows "patched N items".
 */
export const FEED_EXCLUDED_ACTIONS = ['backlog.patch'] as const;

export class AuditLogRepository {
  private readonly insertStmt;
  private readonly listStmt;
  private readonly listFeedStmt;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO audit_log (actor, action, resource_type, resource_id, payload, created_at)
      VALUES (@actor, @action, @resource_type, @resource_id, @payload, @created_at)
    `);
    this.listStmt = db.prepare(`
      SELECT * FROM audit_log
      WHERE (@actor IS NULL OR actor = @actor)
        AND (@action IS NULL OR action = @action)
        AND (@resource_type IS NULL OR resource_type = @resource_type)
        AND (@resource_id IS NULL OR resource_id = @resource_id)
        AND (@since IS NULL OR created_at >= @since)
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `);
    // Curated feed — same ordering, but the noisy per-item actions are filtered
    // out at the SQL level so a `limit` of N yields N *meaningful* events.
    const excluded = FEED_EXCLUDED_ACTIONS.map((a) => `'${a}'`).join(', ');
    this.listFeedStmt = db.prepare(`
      SELECT * FROM audit_log
      WHERE action NOT IN (${excluded})
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `);
  }

  append(input: AuditLogInsert): AuditLogRow {
    const parsed = AuditLogInsertSchema.parse(input);
    const result = this.insertStmt.run({
      actor: parsed.actor,
      action: parsed.action,
      resource_type: parsed.resource_type,
      resource_id: parsed.resource_id,
      payload: packJson(parsed.payload),
      created_at: Date.now(),
    });
    const row = this.db
      .prepare('SELECT * FROM audit_log WHERE id = ?')
      .get(Number(result.lastInsertRowid)) as Row;
    return rowToAudit(row);
  }

  list(
    filter: {
      actor?: string | null;
      action?: string | null;
      resource_type?: string | null;
      resource_id?: string | null;
      since?: number | null;
      limit?: number;
      offset?: number;
    } = {},
  ): AuditLogRow[] {
    const rows = this.listStmt.all({
      actor: filter.actor ?? null,
      action: filter.action ?? null,
      resource_type: filter.resource_type ?? null,
      resource_id: filter.resource_id ?? null,
      since: filter.since ?? null,
      limit: filter.limit ?? 200,
      offset: filter.offset ?? 0,
    }) as Row[];
    return rows.map(rowToAudit);
  }

  /**
   * The curated, cross-resource activity feed for the Dashboard timeline —
   * newest-first, with the high-volume per-item actions
   * ({@link FEED_EXCLUDED_ACTIONS}) filtered out so the limit buys meaningful
   * lifecycle, gate and transition events rather than a wall of patches.
   */
  listFeed(opts: { limit?: number; offset?: number } = {}): AuditLogRow[] {
    const rows = this.listFeedStmt.all({
      limit: opts.limit ?? 40,
      offset: opts.offset ?? 0,
    }) as Row[];
    return rows.map(rowToAudit);
  }
}
