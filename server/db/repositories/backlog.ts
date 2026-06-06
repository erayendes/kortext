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
  model: string | null;
  preview_url: string | null;
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
  private readonly updatePlanningStmt;
  private readonly setPreviewUrlStmt;
  private readonly deleteStmt;
  private readonly countStmt;
  private readonly countFilteredStmt;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO backlog_items
        (id, type, title, status, owner, parent_id, version, model, review_gates, frontmatter, body_md, created_at, updated_at)
      VALUES
        (@id, @type, @title, @status, @owner, @parent_id, @version, @model, @review_gates, @frontmatter, @body_md, @ts, @ts)
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
    // Planning-owned columns only — NEVER status/owner (engine-owned). The
    // backlog-ingest upsert calls this when a later enrichment pass rewrites the
    // whole backlog.yaml, so version/model/gate markings reach an already-created
    // row instead of being skipped.
    this.updatePlanningStmt = db.prepare(`
      UPDATE backlog_items SET
        type = @type,
        title = @title,
        parent_id = @parent_id,
        version = @version,
        model = @model,
        review_gates = @review_gates,
        frontmatter = @frontmatter,
        body_md = @body_md,
        updated_at = @ts
      WHERE id = @id
    `);
    this.setPreviewUrlStmt = db.prepare(
      'UPDATE backlog_items SET preview_url = @preview_url, updated_at = @ts WHERE id = @id',
    );
    this.deleteStmt = db.prepare('DELETE FROM backlog_items WHERE id = ?');
    this.countStmt = db.prepare(
      'SELECT COUNT(*) as n FROM backlog_items WHERE (@status IS NULL OR status = @status)',
    );
    this.countFilteredStmt = db.prepare(`
      SELECT COUNT(*) as n FROM backlog_items
      WHERE (@type IS NULL OR type = @type)
        AND (@status IS NULL OR status = @status)
        AND (@owner IS NULL OR owner = @owner)
        AND (@parent_id IS NULL OR parent_id = @parent_id)
    `);
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
      model: parsed.model,
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

  /**
   * Persist the live local-preview URL for a runnable item (task B4, §5.7). Set
   * by the orchestrator after a successful dev-cycle exit when the item's
   * frontmatter declares `preview: true`. Pass null to clear the URL (e.g. on a
   * restart where the preview server is no longer running).
   */
  setPreviewUrl(id: string, url: string | null): BacklogItem {
    const ts = Date.now();
    const result = this.setPreviewUrlStmt.run({ id, preview_url: url, ts });
    if (result.changes === 0) {
      throw new Error(`backlog item not found: ${id}`);
    }
    return this.get(id)!;
  }

  /**
   * Re-apply the planning-owned fields of an existing item (used by the backlog
   * upsert when a later pipeline step rewrites the whole backlog.yaml). Updates
   * type/title/parent_id/version/model/review_gates/frontmatter/body_md — but
   * deliberately leaves `status` and `owner` untouched so a re-ingest can never
   * drag an item the engine has already moved forward back to `to_do`.
   */
  updatePlanningFields(
    id: string,
    fields: {
      type: BacklogItemType;
      title: string;
      parent_id: string | null;
      version: string | null;
      model: string | null;
      review_gates: Gate[];
      frontmatter: Record<string, unknown>;
      body_md: string;
    },
  ): BacklogItem {
    const result = this.updatePlanningStmt.run({
      id,
      type: fields.type,
      title: fields.title,
      parent_id: fields.parent_id,
      version: fields.version,
      model: fields.model,
      review_gates: packJson(z.array(GateSchema).parse(fields.review_gates)),
      frontmatter: packJson(fields.frontmatter),
      body_md: fields.body_md,
      ts: Date.now(),
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

  /**
   * Count items matching the same filter set as `list()` — used by the route
   * to return `total` (full count ignoring limit/offset).
   */
  count(
    filter: {
      type?: BacklogItemType | null;
      status?: BacklogStatus | null;
      owner?: string | null;
      parent_id?: string | null;
    } = {},
  ): number {
    const row = this.countFilteredStmt.get({
      type: filter.type ?? null,
      status: filter.status ?? null,
      owner: filter.owner ?? null,
      parent_id: filter.parent_id ?? null,
    }) as { n: number };
    return row.n;
  }
}
