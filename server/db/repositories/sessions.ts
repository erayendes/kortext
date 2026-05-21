import type Database from 'better-sqlite3';
import {
  SessionInsertSchema,
  SessionSchema,
  type Session,
  type SessionInsert,
} from '../schemas.ts';
import { packJson, unpackJson } from '../json.ts';

type Row = {
  id: number;
  started_by: string;
  entry_point: string;
  metadata: string;
  started_at: number;
  ended_at: number | null;
};

function rowToSession(row: Row): Session {
  return SessionSchema.parse({
    ...row,
    metadata: unpackJson<Record<string, unknown>>(row.metadata, {}),
  });
}

export class SessionsRepository {
  private readonly insertStmt;
  private readonly selectByIdStmt;
  private readonly endStmt;
  private readonly listStmt;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO sessions (started_by, entry_point, metadata, started_at)
      VALUES (@started_by, @entry_point, @metadata, @started_at)
    `);
    this.selectByIdStmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
    this.endStmt = db.prepare('UPDATE sessions SET ended_at = @ended_at WHERE id = @id');
    this.listStmt = db.prepare(
      'SELECT * FROM sessions ORDER BY started_at DESC LIMIT @limit OFFSET @offset',
    );
  }

  create(input: SessionInsert): Session {
    const parsed = SessionInsertSchema.parse(input);
    const result = this.insertStmt.run({
      started_by: parsed.started_by,
      entry_point: parsed.entry_point,
      metadata: packJson(parsed.metadata),
      started_at: Date.now(),
    });
    return this.get(Number(result.lastInsertRowid))!;
  }

  get(id: number): Session | null {
    const row = this.selectByIdStmt.get(id) as Row | undefined;
    return row ? rowToSession(row) : null;
  }

  end(id: number): Session | null {
    this.endStmt.run({ id, ended_at: Date.now() });
    return this.get(id);
  }

  list(limit = 50, offset = 0): Session[] {
    const rows = this.listStmt.all({ limit, offset }) as Row[];
    return rows.map(rowToSession);
  }
}
