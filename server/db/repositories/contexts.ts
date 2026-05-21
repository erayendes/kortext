import type Database from 'better-sqlite3';
import {
  ContextSchema,
  ContextUpsertSchema,
  type Context,
  type ContextUpsert,
} from '../schemas.ts';
import { packJson, unpackJson } from '../json.ts';

type Row = {
  id: number;
  persona: string;
  item_id: string | null;
  session_id: number | null;
  payload: string;
  created_at: number;
  updated_at: number;
};

function rowToContext(row: Row): Context {
  return ContextSchema.parse({
    ...row,
    payload: unpackJson<Record<string, unknown>>(row.payload, {}),
  });
}

export class ContextsRepository {
  private readonly upsertStmt;
  private readonly selectByKeyStmt;
  private readonly listByPersonaStmt;
  private readonly deleteStmt;

  constructor(private readonly db: Database.Database) {
    this.upsertStmt = db.prepare(`
      INSERT INTO contexts (persona, item_id, session_id, payload, created_at, updated_at)
      VALUES (@persona, @item_id, @session_id, @payload, @ts, @ts)
      ON CONFLICT(persona, item_id) DO UPDATE SET
        session_id = excluded.session_id,
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `);
    this.selectByKeyStmt = db.prepare(
      'SELECT * FROM contexts WHERE persona = @persona AND IFNULL(item_id, \'\') = IFNULL(@item_id, \'\')',
    );
    this.listByPersonaStmt = db.prepare(
      'SELECT * FROM contexts WHERE persona = ? ORDER BY updated_at DESC',
    );
    this.deleteStmt = db.prepare(
      'DELETE FROM contexts WHERE persona = @persona AND IFNULL(item_id, \'\') = IFNULL(@item_id, \'\')',
    );
  }

  upsert(input: ContextUpsert): Context {
    const parsed = ContextUpsertSchema.parse(input);
    const ts = Date.now();
    this.upsertStmt.run({
      persona: parsed.persona,
      item_id: parsed.item_id,
      session_id: parsed.session_id,
      payload: packJson(parsed.payload),
      ts,
    });
    return this.get(parsed.persona, parsed.item_id)!;
  }

  get(persona: string, item_id: string | null): Context | null {
    const row = this.selectByKeyStmt.get({ persona, item_id }) as Row | undefined;
    return row ? rowToContext(row) : null;
  }

  listByPersona(persona: string): Context[] {
    const rows = this.listByPersonaStmt.all(persona) as Row[];
    return rows.map(rowToContext);
  }

  delete(persona: string, item_id: string | null): boolean {
    const result = this.deleteStmt.run({ persona, item_id });
    return result.changes > 0;
  }
}
