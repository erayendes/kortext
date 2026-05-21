import type Database from 'better-sqlite3';
import {
  SecretScanResultInsertSchema,
  SecretScanResultSchema,
  type SecretScanResult,
  type SecretScanResultInsert,
  type SecretSeverity,
} from '../schemas.ts';

type Row = {
  id: number;
  run_id: number | null;
  scanned_path: string;
  finding_type: string;
  severity: string;
  line_number: number | null;
  context: string | null;
  masked_snippet: string | null;
  resolved: number;
  created_at: number;
};

function rowToResult(row: Row): SecretScanResult {
  return SecretScanResultSchema.parse({ ...row, resolved: row.resolved === 1 });
}

export class SecretsRepository {
  private readonly insertStmt;
  private readonly selectByIdStmt;
  private readonly listStmt;
  private readonly markResolvedStmt;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO secrets_scan_results
        (run_id, scanned_path, finding_type, severity, line_number, context, masked_snippet, created_at)
      VALUES
        (@run_id, @scanned_path, @finding_type, @severity, @line_number, @context, @masked_snippet, @created_at)
    `);
    this.selectByIdStmt = db.prepare('SELECT * FROM secrets_scan_results WHERE id = ?');
    this.listStmt = db.prepare(`
      SELECT * FROM secrets_scan_results
      WHERE (@severity IS NULL OR severity = @severity)
        AND (@resolved IS NULL OR resolved = @resolved)
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `);
    this.markResolvedStmt = db.prepare(
      'UPDATE secrets_scan_results SET resolved = 1 WHERE id = ?',
    );
  }

  create(input: SecretScanResultInsert): SecretScanResult {
    const parsed = SecretScanResultInsertSchema.parse(input);
    const result = this.insertStmt.run({
      run_id: parsed.run_id,
      scanned_path: parsed.scanned_path,
      finding_type: parsed.finding_type,
      severity: parsed.severity,
      line_number: parsed.line_number,
      context: parsed.context,
      masked_snippet: parsed.masked_snippet,
      created_at: Date.now(),
    });
    return this.get(Number(result.lastInsertRowid))!;
  }

  get(id: number): SecretScanResult | null {
    const row = this.selectByIdStmt.get(id) as Row | undefined;
    return row ? rowToResult(row) : null;
  }

  list(
    filter: {
      severity?: SecretSeverity | null;
      resolved?: boolean | null;
      limit?: number;
      offset?: number;
    } = {},
  ): SecretScanResult[] {
    const resolvedFlag =
      filter.resolved === undefined || filter.resolved === null
        ? null
        : filter.resolved
          ? 1
          : 0;
    const rows = this.listStmt.all({
      severity: filter.severity ?? null,
      resolved: resolvedFlag,
      limit: filter.limit ?? 100,
      offset: filter.offset ?? 0,
    }) as Row[];
    return rows.map(rowToResult);
  }

  markResolved(id: number): boolean {
    return this.markResolvedStmt.run(id).changes > 0;
  }
}
