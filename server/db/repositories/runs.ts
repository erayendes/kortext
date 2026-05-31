import type Database from 'better-sqlite3';
import {
  RunInsertSchema,
  RunSchema,
  RunStatusSchema,
  RunStepInsertSchema,
  RunStepSchema,
  RunStepStatusSchema,
  type Run,
  type RunInsert,
  type RunStatus,
  type RunStep,
  type RunStepInsert,
  type RunStepStatus,
} from '../schemas.ts';

type RunRow = {
  id: number;
  workflow_id: string;
  item_id: string | null;
  status: string;
  worktree_path: string | null;
  triggered_by: string;
  error_message: string | null;
  started_at: number | null;
  ended_at: number | null;
  created_at: number;
};

type StepRow = {
  id: number;
  run_id: number;
  step_index: number;
  step_name: string;
  persona: string | null;
  status: string;
  started_at: number | null;
  ended_at: number | null;
  log_path: string | null;
  output_summary: string | null;
  error_message: string | null;
};

const TERMINAL_RUN_STATUSES: ReadonlySet<RunStatus> = new Set([
  'succeeded',
  'failed',
  'cancelled',
]);
const TERMINAL_STEP_STATUSES: ReadonlySet<RunStepStatus> = new Set([
  'succeeded',
  'failed',
  'skipped',
]);

export class RunsRepository {
  private readonly insertRunStmt;
  private readonly selectRunStmt;
  private readonly listRunsStmt;
  private readonly transitionRunStmt;
  private readonly setWorktreePathStmt;
  private readonly insertStepStmt;
  private readonly selectStepStmt;
  private readonly listStepsStmt;
  private readonly transitionStepStmt;

  constructor(private readonly db: Database.Database) {
    this.insertRunStmt = db.prepare(`
      INSERT INTO runs
        (workflow_id, item_id, status, worktree_path, triggered_by, created_at)
      VALUES
        (@workflow_id, @item_id, @status, @worktree_path, @triggered_by, @created_at)
    `);
    this.selectRunStmt = db.prepare('SELECT * FROM runs WHERE id = ?');
    this.listRunsStmt = db.prepare(`
      SELECT * FROM runs
      WHERE (@status IS NULL OR status = @status)
        AND (@workflow_id IS NULL OR workflow_id = @workflow_id)
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `);
    this.transitionRunStmt = db.prepare(`
      UPDATE runs SET
        status = @status,
        started_at = CASE WHEN @status = 'running' AND started_at IS NULL THEN @ts ELSE started_at END,
        ended_at = CASE WHEN @is_terminal = 1 THEN @ts ELSE ended_at END,
        error_message = COALESCE(@error_message, error_message)
      WHERE id = @id
    `);
    this.setWorktreePathStmt = db.prepare(
      'UPDATE runs SET worktree_path = @worktree_path WHERE id = @id',
    );

    this.insertStepStmt = db.prepare(`
      INSERT INTO run_steps
        (run_id, step_index, step_name, persona, status)
      VALUES
        (@run_id, @step_index, @step_name, @persona, @status)
    `);
    this.selectStepStmt = db.prepare('SELECT * FROM run_steps WHERE id = ?');
    this.listStepsStmt = db.prepare(
      'SELECT * FROM run_steps WHERE run_id = ? ORDER BY step_index',
    );
    this.transitionStepStmt = db.prepare(`
      UPDATE run_steps SET
        status = @status,
        started_at = CASE WHEN @status = 'running' AND started_at IS NULL THEN @ts ELSE started_at END,
        ended_at = CASE WHEN @is_terminal = 1 THEN @ts ELSE ended_at END,
        output_summary = COALESCE(@output_summary, output_summary),
        error_message = COALESCE(@error_message, error_message),
        log_path = COALESCE(@log_path, log_path)
      WHERE id = @id
    `);
  }

  createRun(input: RunInsert): Run {
    const parsed = RunInsertSchema.parse(input);
    const result = this.insertRunStmt.run({
      workflow_id: parsed.workflow_id,
      item_id: parsed.item_id,
      status: parsed.status,
      worktree_path: parsed.worktree_path,
      triggered_by: parsed.triggered_by,
      created_at: Date.now(),
    });
    return this.getRun(Number(result.lastInsertRowid))!;
  }

  getRun(id: number): Run | null {
    const row = this.selectRunStmt.get(id) as RunRow | undefined;
    return row ? RunSchema.parse(row) : null;
  }

  listRuns(
    filter: {
      status?: RunStatus | null;
      workflow_id?: string | null;
      limit?: number;
      offset?: number;
    } = {},
  ): Run[] {
    const rows = this.listRunsStmt.all({
      status: filter.status ?? null,
      workflow_id: filter.workflow_id ?? null,
      limit: filter.limit ?? 50,
      offset: filter.offset ?? 0,
    }) as RunRow[];
    return rows.map((r) => RunSchema.parse(r));
  }

  transitionRun(
    id: number,
    status: RunStatus,
    opts: { error_message?: string | null } = {},
  ): Run {
    RunStatusSchema.parse(status);
    const result = this.transitionRunStmt.run({
      id,
      status,
      ts: Date.now(),
      is_terminal: TERMINAL_RUN_STATUSES.has(status) ? 1 : 0,
      error_message: opts.error_message ?? null,
    });
    if (result.changes === 0) throw new Error(`run not found: ${id}`);
    return this.getRun(id)!;
  }

  /** Set the run's worktree path once the worktree is provisioned (capstone runItem, §5.14). */
  setWorktreePath(id: number, worktreePath: string | null): Run {
    const result = this.setWorktreePathStmt.run({ id, worktree_path: worktreePath });
    if (result.changes === 0) throw new Error(`run not found: ${id}`);
    return this.getRun(id)!;
  }

  addStep(input: RunStepInsert): RunStep {
    const parsed = RunStepInsertSchema.parse(input);
    const result = this.insertStepStmt.run({
      run_id: parsed.run_id,
      step_index: parsed.step_index,
      step_name: parsed.step_name,
      persona: parsed.persona,
      status: parsed.status,
    });
    return this.getStep(Number(result.lastInsertRowid))!;
  }

  getStep(id: number): RunStep | null {
    const row = this.selectStepStmt.get(id) as StepRow | undefined;
    return row ? RunStepSchema.parse(row) : null;
  }

  listSteps(runId: number): RunStep[] {
    const rows = this.listStepsStmt.all(runId) as StepRow[];
    return rows.map((r) => RunStepSchema.parse(r));
  }

  transitionStep(
    id: number,
    status: RunStepStatus,
    opts: {
      output_summary?: string | null;
      error_message?: string | null;
      log_path?: string | null;
    } = {},
  ): RunStep {
    RunStepStatusSchema.parse(status);
    const result = this.transitionStepStmt.run({
      id,
      status,
      ts: Date.now(),
      is_terminal: TERMINAL_STEP_STATUSES.has(status) ? 1 : 0,
      output_summary: opts.output_summary ?? null,
      error_message: opts.error_message ?? null,
      log_path: opts.log_path ?? null,
    });
    if (result.changes === 0) throw new Error(`run_step not found: ${id}`);
    return this.getStep(id)!;
  }
}
