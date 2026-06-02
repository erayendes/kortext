import { z } from 'zod';
import type Database from 'better-sqlite3';
import {
  BacklogItemInsertSchema,
  BacklogItemSchema,
  BacklogStatusSchema,
  GateSchema,
  type BacklogItem,
  type BacklogItemInsert,
  type BacklogStatus,
  type BacklogItemType,
  type Gate,
} from '../schemas.ts';
import { packJson, unpackJson } from '../json.ts';

type Row = {
  id: string;
  type: string;
  title: string;
  status: string;
  owner: string | null;
  parent_id: string | null;
  version: string | null;
  review_gates: string;
  frontmatter: string;
  body_md: string;
  created_at: number;
  updated_at: number;
};

function rowToItem(row: Row): BacklogItem {
  return BacklogItemSchema.parse({
    ...row,
    review_gates: unpackJson<Gate[]>(row.review_gates, []),
    frontmatter: unpackJson<Record<string, unknown>>(row.frontmatter, {}),
  });
}

export class BacklogRepository {
  private readonly insertStmt;
  private readonly selectByIdStmt;
  private readonly listStmt;
  private readonly updateStatusStmt;
  private readonly updateBodyStmt;
  private readonly updateFrontmatterStmt;
  private readonly updateReviewGatesStmt;
  private readonly deleteStmt;
  private readonly countStmt;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO backlog_items
        (id, type, title, status, owner, parent_id, version, review_gates, frontmatter, body_md, created_at, updated_at)
      VALUES
        (@id, @type, @title, @status, @owner, @parent_id, @version, @review_gates, @frontmatter, @body_md, @ts, @ts)
    `);
    this.selectByIdStmt = db.prepare('SELECT * FROM backlog_items WHERE id = ?');
    this.listStmt = db.prepare(`
      SELECT * FROM backlog_items
      WHERE (@type IS NULL OR type = @type)
        AND (@status IS NULL OR status = @status)
        AND (@owner IS NULL OR owner = @owner)
        AND (@parent_id IS NULL OR parent_id = @parent_id)
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `);
    this.updateStatusStmt = db.prepare(
      'UPDATE backlog_items SET status = @status, updated_at = @ts WHERE id = @id',
    );
    this.updateBodyStmt = db.prepare(
      'UPDATE backlog_items SET body_md = @body, updated_at = @ts WHERE id = @id',
    );
    this.updateFrontmatterStmt = db.prepare(
      'UPDATE backlog_items SET frontmatter = @frontmatter, updated_at = @ts WHERE id = @id',
    );
    this.updateReviewGatesStmt = db.prepare(
      'UPDATE backlog_items SET review_gates = @review_gates, updated_at = @ts WHERE id = @id',
    );
    this.deleteStmt = db.prepare('DELETE FROM backlog_items WHERE id = ?');
    this.countStmt = db.prepare(
      'SELECT COUNT(*) as n FROM backlog_items WHERE (@status IS NULL OR status = @status)',
    );
  }

  create(input: BacklogItemInsert): BacklogItem {
    const parsed = BacklogItemInsertSchema.parse(input);
    const ts = Date.now();
    this.insertStmt.run({
      id: parsed.id,
      type: parsed.type,
      title: parsed.title,
      status: parsed.status,
      owner: parsed.owner,
      parent_id: parsed.parent_id,
      version: parsed.version,
      review_gates: packJson(parsed.review_gates),
      frontmatter: packJson(parsed.frontmatter),
      body_md: parsed.body_md,
      ts,
    });
    return this.get(parsed.id)!;
  }

  get(id: string): BacklogItem | null {
    const row = this.selectByIdStmt.get(id) as Row | undefined;
    return row ? rowToItem(row) : null;
  }

  list(
    filter: {
      type?: BacklogItemType | null;
      status?: BacklogStatus | null;
      owner?: string | null;
      parent_id?: string | null;
      limit?: number;
      offset?: number;
    } = {},
  ): BacklogItem[] {
    const rows = this.listStmt.all({
      type: filter.type ?? null,
      status: filter.status ?? null,
      owner: filter.owner ?? null,
      parent_id: filter.parent_id ?? null,
      limit: filter.limit ?? 100,
      offset: filter.offset ?? 0,
    }) as Row[];
    return rows.map(rowToItem);
  }

  transitionStatus(id: string, status: BacklogStatus): BacklogItem {
    BacklogStatusSchema.parse(status);
    const ts = Date.now();
    const result = this.updateStatusStmt.run({ id, status, ts });
    if (result.changes === 0) {
      throw new Error(`backlog item not found: ${id}`);
    }
    return this.get(id)!;
  }

  updateBody(id: string, body: string): BacklogItem {
    const ts = Date.now();
    this.updateBodyStmt.run({ id, body, ts });
    return this.get(id)!;
  }

  /**
   * Replace the item's frontmatter (the structured key/value block — owner-set
   * fields, acceptance criteria, dependencies, notes). The mark/unmark AC
   * endpoint uses this to persist per-item acceptance-criteria flags.
   */
  updateFrontmatter(id: string, frontmatter: Record<string, unknown>): BacklogItem {
    const ts = Date.now();
    const result = this.updateFrontmatterStmt.run({
      id,
      frontmatter: packJson(frontmatter),
      ts,
    });
    if (result.changes === 0) {
      throw new Error(`backlog item not found: ${id}`);
    }
    return this.get(id)!;
  }

  /**
   * Replace the item's gate checklist selection (§5.9 #2). planning-pipeline
   * calls this to set which gates run in the test-cycle; orchestrator (§5.9 #4)
   * reads it to fan out. An empty list = 0-gate item (join → review, §5.8).
   */
  setReviewGates(id: string, gates: Gate[]): BacklogItem {
    const parsed = z.array(GateSchema).parse(gates);
    const ts = Date.now();
    const result = this.updateReviewGatesStmt.run({
      id,
      review_gates: packJson(parsed),
      ts,
    });
    if (result.changes === 0) {
      throw new Error(`backlog item not found: ${id}`);
    }
    return this.get(id)!;
  }

  delete(id: string): boolean {
    const result = this.deleteStmt.run(id);
    return result.changes > 0;
  }

  countByStatus(status: BacklogStatus | null = null): number {
    const row = this.countStmt.get({ status }) as { n: number };
    return row.n;
  }
}
