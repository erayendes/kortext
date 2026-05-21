import type Database from 'better-sqlite3';
import {
  HandoverInsertSchema,
  HandoverSchema,
  type Handover,
  type HandoverInsert,
} from '../schemas.ts';
import { packJson, unpackJson } from '../json.ts';

type Row = {
  id: number;
  item_id: string | null;
  from_persona: string;
  to_persona: string;
  reason: string | null;
  context_payload: string;
  markdown_path: string | null;
  created_at: number;
};

function rowToHandover(row: Row): Handover {
  return HandoverSchema.parse({
    ...row,
    context_payload: unpackJson<Record<string, unknown>>(row.context_payload, {}),
  });
}

export class HandoversRepository {
  private readonly insertStmt;
  private readonly selectByIdStmt;
  private readonly listByItemStmt;
  private readonly listRecentStmt;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO handovers
        (item_id, from_persona, to_persona, reason, context_payload, markdown_path, created_at)
      VALUES
        (@item_id, @from_persona, @to_persona, @reason, @context_payload, @markdown_path, @created_at)
    `);
    this.selectByIdStmt = db.prepare('SELECT * FROM handovers WHERE id = ?');
    this.listByItemStmt = db.prepare(
      'SELECT * FROM handovers WHERE item_id = ? ORDER BY created_at DESC',
    );
    this.listRecentStmt = db.prepare(
      'SELECT * FROM handovers ORDER BY created_at DESC LIMIT @limit',
    );
  }

  create(input: HandoverInsert): Handover {
    const parsed = HandoverInsertSchema.parse(input);
    const result = this.insertStmt.run({
      item_id: parsed.item_id,
      from_persona: parsed.from_persona,
      to_persona: parsed.to_persona,
      reason: parsed.reason,
      context_payload: packJson(parsed.context_payload),
      markdown_path: parsed.markdown_path,
      created_at: Date.now(),
    });
    return this.get(Number(result.lastInsertRowid))!;
  }

  get(id: number): Handover | null {
    const row = this.selectByIdStmt.get(id) as Row | undefined;
    return row ? rowToHandover(row) : null;
  }

  listByItem(itemId: string): Handover[] {
    const rows = this.listByItemStmt.all(itemId) as Row[];
    return rows.map(rowToHandover);
  }

  listRecent(limit = 20): Handover[] {
    const rows = this.listRecentStmt.all({ limit }) as Row[];
    return rows.map(rowToHandover);
  }
}
