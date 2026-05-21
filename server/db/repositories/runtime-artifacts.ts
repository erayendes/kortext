import type Database from 'better-sqlite3';
import {
  RuntimeArtifactInsertSchema,
  RuntimeArtifactSchema,
  type ArtifactKind,
  type RuntimeArtifact,
  type RuntimeArtifactInsert,
} from '../schemas.ts';

type Row = {
  id: number;
  run_id: number | null;
  step_id: number | null;
  kind: string;
  path: string;
  bytes: number | null;
  created_at: number;
};

export class RuntimeArtifactsRepository {
  private readonly insertStmt;
  private readonly selectByIdStmt;
  private readonly listByRunStmt;
  private readonly listByRunAndKindStmt;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO runtime_artifacts (run_id, step_id, kind, path, bytes, created_at)
      VALUES (@run_id, @step_id, @kind, @path, @bytes, @created_at)
    `);
    this.selectByIdStmt = db.prepare('SELECT * FROM runtime_artifacts WHERE id = ?');
    this.listByRunStmt = db.prepare(
      'SELECT * FROM runtime_artifacts WHERE run_id = ? ORDER BY created_at',
    );
    this.listByRunAndKindStmt = db.prepare(
      'SELECT * FROM runtime_artifacts WHERE run_id = ? AND kind = ? ORDER BY created_at',
    );
  }

  create(input: RuntimeArtifactInsert): RuntimeArtifact {
    const parsed = RuntimeArtifactInsertSchema.parse(input);
    const result = this.insertStmt.run({
      run_id: parsed.run_id,
      step_id: parsed.step_id,
      kind: parsed.kind,
      path: parsed.path,
      bytes: parsed.bytes,
      created_at: Date.now(),
    });
    return this.get(Number(result.lastInsertRowid))!;
  }

  get(id: number): RuntimeArtifact | null {
    const row = this.selectByIdStmt.get(id) as Row | undefined;
    return row ? RuntimeArtifactSchema.parse(row) : null;
  }

  listByRun(runId: number, kind?: ArtifactKind): RuntimeArtifact[] {
    const rows = (
      kind ? this.listByRunAndKindStmt.all(runId, kind) : this.listByRunStmt.all(runId)
    ) as Row[];
    return rows.map((r) => RuntimeArtifactSchema.parse(r));
  }
}
