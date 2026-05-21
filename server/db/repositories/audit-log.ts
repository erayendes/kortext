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

export class AuditLogRepository {
  private readonly insertStmt;
  private readonly listStmt;

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
}
