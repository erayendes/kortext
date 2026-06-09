import type Database from 'better-sqlite3';
import {
  GateRunInsertSchema,
  GateRunSchema,
  GateRunStatusSchema,
  type GateRun,
  type GateRunInsert,
  type GateRunStatus,
  type UsageMetadata,
} from '../schemas.ts';
import { packJson } from '../json.ts';

type GateRunRow = {
  id: number;
  item_id: string;
  gate: string;
  persona: string | null;
  attempt: number;
  status: string;
  findings: string | null;
  created_at: number;
  ended_at: number | null;
  usage_metadata: string | null;
};

const TERMINAL_GATE_STATUSES: ReadonlySet<GateRunStatus> = new Set(['pass', 'fail']);

/**
 * Home for test-cycle gate checks (§5.9 #3). Each selected gate leaves one row
 * per test cycle: pass/fail + findings. The "all pass → review / ≥1 fail →
 * in_progress" join (§5.8) is an orchestrator-layer fold over these rows — NOT
 * a DAG fan-in (§5.13). `attempt` discriminates cycles so a bounce + re-test
 * never reads the previous cycle's stale `fail` rows.
 */
export class GateRunsRepository {
  private readonly insertStmt;
  private readonly selectStmt;
  private readonly listForItemStmt;
  private readonly listForAttemptStmt;
  private readonly maxAttemptStmt;
  private readonly transitionStmt;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO gate_runs
        (item_id, gate, persona, attempt, status, findings, created_at)
      VALUES
        (@item_id, @gate, @persona, @attempt, @status, @findings, @created_at)
    `);
    this.selectStmt = db.prepare('SELECT * FROM gate_runs WHERE id = ?');
    this.listForItemStmt = db.prepare(
      'SELECT * FROM gate_runs WHERE item_id = ? ORDER BY attempt, gate',
    );
    this.listForAttemptStmt = db.prepare(
      'SELECT * FROM gate_runs WHERE item_id = @item_id AND attempt = @attempt ORDER BY gate',
    );
    this.maxAttemptStmt = db.prepare(
      'SELECT MAX(attempt) AS n FROM gate_runs WHERE item_id = ?',
    );
    this.transitionStmt = db.prepare(`
      UPDATE gate_runs SET
        status = @status,
        findings = COALESCE(@findings, findings),
        usage_metadata = COALESCE(@usage_metadata, usage_metadata),
        ended_at = CASE WHEN @is_terminal = 1 THEN @ts ELSE ended_at END
      WHERE id = @id
    `);
  }

  create(input: GateRunInsert): GateRun {
    const parsed = GateRunInsertSchema.parse(input);
    const result = this.insertStmt.run({
      item_id: parsed.item_id,
      gate: parsed.gate,
      persona: parsed.persona,
      attempt: parsed.attempt,
      status: parsed.status,
      findings: parsed.findings,
      created_at: Date.now(),
    });
    return this.get(Number(result.lastInsertRowid))!;
  }

  get(id: number): GateRun | null {
    const row = this.selectStmt.get(id) as GateRunRow | undefined;
    return row ? GateRunSchema.parse(row) : null;
  }

  /** Every gate run for an item across all attempts (ordered attempt, then gate). */
  listForItem(itemId: string): GateRun[] {
    const rows = this.listForItemStmt.all(itemId) as GateRunRow[];
    return rows.map((r) => GateRunSchema.parse(r));
  }

  /** Gate runs for a single test cycle — the set the join folds over. */
  listForAttempt(itemId: string, attempt: number): GateRun[] {
    const rows = this.listForAttemptStmt.all({ item_id: itemId, attempt }) as GateRunRow[];
    return rows.map((r) => GateRunSchema.parse(r));
  }

  /** Highest attempt recorded for an item; 0 if none. Lets the orchestrator pick the next cycle. */
  currentAttempt(itemId: string): number {
    const row = this.maxAttemptStmt.get(itemId) as { n: number | null };
    return row?.n ?? 0;
  }

  transition(
    id: number,
    status: GateRunStatus,
    opts: { findings?: string | null; usage_metadata?: UsageMetadata | null } = {},
  ): GateRun {
    GateRunStatusSchema.parse(status);
    const result = this.transitionStmt.run({
      id,
      status,
      ts: Date.now(),
      is_terminal: TERMINAL_GATE_STATUSES.has(status) ? 1 : 0,
      findings: opts.findings ?? null,
      usage_metadata: opts.usage_metadata != null ? packJson(opts.usage_metadata) : null,
    });
    if (result.changes === 0) throw new Error(`gate_run not found: ${id}`);
    return this.get(id)!;
  }
}
