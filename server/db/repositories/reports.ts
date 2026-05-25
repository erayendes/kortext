import type Database from 'better-sqlite3';
import {
  ReportIndexInsertSchema,
  ReportIndexSchema,
  ReportStatusSchema,
  type ReportIndex,
  type ReportIndexInsert,
  type ReportStatus,
} from '../schemas.ts';
import { packJson, unpackJson } from '../json.ts';

type Row = {
  id: number;
  scope: string;
  slug: string;
  file_path: string;
  author: string | null;
  status: string;
  tags: string;
  related_item: string | null;
  created_at: number;
};

function rowToReport(row: Row): ReportIndex {
  return ReportIndexSchema.parse({
    ...row,
    tags: unpackJson<string[]>(row.tags, []),
  });
}

export type ReportListFilter = {
  scope?: string | null;
  status?: ReportStatus | null;
  relatedItem?: string | null;
  limit?: number;
  offset?: number;
};

export class ReportsRepository {
  private readonly insertStmt;
  private readonly selectByIdStmt;
  private readonly selectByPathStmt;
  private readonly listStmt;
  private readonly updateStatusStmt;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO reports_index
        (scope, slug, file_path, author, status, tags, related_item, created_at)
      VALUES
        (@scope, @slug, @file_path, @author, @status, @tags, @related_item, @created_at)
    `);
    this.selectByIdStmt = db.prepare('SELECT * FROM reports_index WHERE id = ?');
    this.selectByPathStmt = db.prepare(
      'SELECT * FROM reports_index WHERE file_path = ?',
    );
    this.listStmt = db.prepare(`
      SELECT * FROM reports_index
      WHERE (@scope IS NULL OR scope = @scope)
        AND (@status IS NULL OR status = @status)
        AND (@related_item IS NULL OR related_item = @related_item)
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `);
    this.updateStatusStmt = db.prepare(
      'UPDATE reports_index SET status = @status WHERE id = @id',
    );
  }

  create(input: ReportIndexInsert): ReportIndex {
    const parsed = ReportIndexInsertSchema.parse(input);
    const result = this.insertStmt.run({
      scope: parsed.scope,
      slug: parsed.slug,
      file_path: parsed.file_path,
      author: parsed.author,
      status: parsed.status,
      tags: packJson(parsed.tags),
      related_item: parsed.related_item,
      created_at: parsed.created_at ?? Date.now(),
    });
    return this.get(Number(result.lastInsertRowid))!;
  }

  get(id: number): ReportIndex | null {
    const row = this.selectByIdStmt.get(id) as Row | undefined;
    return row ? rowToReport(row) : null;
  }

  getByPath(file_path: string): ReportIndex | null {
    const row = this.selectByPathStmt.get(file_path) as Row | undefined;
    return row ? rowToReport(row) : null;
  }

  list(filter: ReportListFilter = {}): ReportIndex[] {
    const rows = this.listStmt.all({
      scope: filter.scope ?? null,
      status: filter.status ?? null,
      related_item: filter.relatedItem ?? null,
      limit: filter.limit ?? 100,
      offset: filter.offset ?? 0,
    }) as Row[];
    return rows.map(rowToReport);
  }

  updateStatus(id: number, status: ReportStatus): ReportIndex {
    ReportStatusSchema.parse(status);
    const result = this.updateStatusStmt.run({ id, status });
    if (result.changes === 0) throw new Error(`report not found: ${id}`);
    return this.get(id)!;
  }
}
