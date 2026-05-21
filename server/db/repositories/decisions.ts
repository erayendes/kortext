import type Database from 'better-sqlite3';
import {
  DecisionIndexInsertSchema,
  DecisionIndexSchema,
  DecisionStatusSchema,
  type DecisionIndex,
  type DecisionIndexInsert,
  type DecisionStatus,
} from '../schemas.ts';
import { packJson, unpackJson } from '../json.ts';

type Row = {
  id: number;
  decision_id: string;
  title: string;
  status: string;
  markdown_path: string;
  item_id: string | null;
  tags: string;
  created_at: number;
  decided_at: number | null;
};

function rowToDecision(row: Row): DecisionIndex {
  return DecisionIndexSchema.parse({
    ...row,
    tags: unpackJson<string[]>(row.tags, []),
  });
}

export class DecisionsRepository {
  private readonly insertStmt;
  private readonly selectByDecisionIdStmt;
  private readonly listStmt;
  private readonly transitionStmt;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO decisions_index
        (decision_id, title, status, markdown_path, item_id, tags, created_at, decided_at)
      VALUES
        (@decision_id, @title, @status, @markdown_path, @item_id, @tags, @created_at, @decided_at)
    `);
    this.selectByDecisionIdStmt = db.prepare(
      'SELECT * FROM decisions_index WHERE decision_id = ?',
    );
    this.listStmt = db.prepare(`
      SELECT * FROM decisions_index
      WHERE (@status IS NULL OR status = @status)
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `);
    this.transitionStmt = db.prepare(`
      UPDATE decisions_index
      SET status = @status,
          decided_at = CASE WHEN @status IN ('accepted','rejected','superseded') THEN @ts ELSE decided_at END
      WHERE decision_id = @decision_id
    `);
  }

  create(input: DecisionIndexInsert): DecisionIndex {
    const parsed = DecisionIndexInsertSchema.parse(input);
    this.insertStmt.run({
      decision_id: parsed.decision_id,
      title: parsed.title,
      status: parsed.status,
      markdown_path: parsed.markdown_path,
      item_id: parsed.item_id,
      tags: packJson(parsed.tags),
      created_at: Date.now(),
      decided_at: parsed.decided_at,
    });
    return this.get(parsed.decision_id)!;
  }

  get(decision_id: string): DecisionIndex | null {
    const row = this.selectByDecisionIdStmt.get(decision_id) as Row | undefined;
    return row ? rowToDecision(row) : null;
  }

  list(
    filter: { status?: DecisionStatus | null; limit?: number; offset?: number } = {},
  ): DecisionIndex[] {
    const rows = this.listStmt.all({
      status: filter.status ?? null,
      limit: filter.limit ?? 100,
      offset: filter.offset ?? 0,
    }) as Row[];
    return rows.map(rowToDecision);
  }

  transition(decision_id: string, status: DecisionStatus): DecisionIndex {
    DecisionStatusSchema.parse(status);
    const result = this.transitionStmt.run({ decision_id, status, ts: Date.now() });
    if (result.changes === 0) throw new Error(`decision not found: ${decision_id}`);
    return this.get(decision_id)!;
  }
}
