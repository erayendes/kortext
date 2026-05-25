import type Database from 'better-sqlite3';
import {
  WorkflowStepIndexSchema,
  WorkflowStepIndexUpsertSchema,
  type WorkflowStepIndex,
  type WorkflowStepIndexUpsert,
} from '../schemas.ts';
import { packJson, unpackJson } from '../json.ts';

/**
 * `workflow_steps` table — step-by-step projection of `workflows/*.md`.
 *
 * One row per (workflow_id, step_no). The compound is enforced by a
 * UNIQUE index so re-running the boot upsert is idempotent. The
 * `persona_handle` column is an FK into `personas(handle)`: any workflow
 * that names an unknown persona (e.g. a stale `+ajan` placeholder) fails
 * the upsert with `SQLITE_CONSTRAINT_FOREIGNKEY`, which the engine boot
 * surfaces as a fatal error.
 */

type Row = {
  id: number;
  workflow_id: string;
  step_no: number;
  step_name: string | null;
  persona_handle: string;
  inputs: string;
  outputs: string;
  gate_kind: string | null;
  parallel_with: string;
  source_path: string;
};

function rowToStep(row: Row): WorkflowStepIndex {
  return WorkflowStepIndexSchema.parse({
    ...row,
    inputs: unpackJson<string[]>(row.inputs, []),
    outputs: unpackJson<string[]>(row.outputs, []),
    parallel_with: unpackJson<number[]>(row.parallel_with, []),
  });
}

export type WorkflowDependencyAggregate = {
  inputs: string[];
  outputs: string[];
};

export class WorkflowStepsRepository {
  private readonly upsertStmt;
  private readonly listByWorkflowStmt;
  private readonly listByPersonaStmt;
  private readonly deleteByWorkflowStmt;
  private readonly deleteAllStmt;
  private readonly usageCountStmt;

  constructor(private readonly db: Database.Database) {
    this.upsertStmt = db.prepare(`
      INSERT INTO workflow_steps
        (workflow_id, step_no, step_name, persona_handle,
         inputs, outputs, gate_kind, parallel_with, source_path)
      VALUES
        (@workflow_id, @step_no, @step_name, @persona_handle,
         @inputs, @outputs, @gate_kind, @parallel_with, @source_path)
      ON CONFLICT(workflow_id, step_no) DO UPDATE SET
        step_name      = excluded.step_name,
        persona_handle = excluded.persona_handle,
        inputs         = excluded.inputs,
        outputs        = excluded.outputs,
        gate_kind      = excluded.gate_kind,
        parallel_with  = excluded.parallel_with,
        source_path    = excluded.source_path
    `);
    this.listByWorkflowStmt = db.prepare(
      'SELECT * FROM workflow_steps WHERE workflow_id = ? ORDER BY step_no',
    );
    this.listByPersonaStmt = db.prepare(
      'SELECT * FROM workflow_steps WHERE persona_handle = ? ORDER BY workflow_id, step_no',
    );
    this.deleteByWorkflowStmt = db.prepare(
      'DELETE FROM workflow_steps WHERE workflow_id = ?',
    );
    this.deleteAllStmt = db.prepare('DELETE FROM workflow_steps');
    this.usageCountStmt = db.prepare(`
      SELECT persona_handle AS persona_handle, COUNT(*) AS step_count
      FROM workflow_steps
      GROUP BY persona_handle
      ORDER BY step_count DESC, persona_handle ASC
    `);
  }

  upsert(input: WorkflowStepIndexUpsert): WorkflowStepIndex {
    const parsed = WorkflowStepIndexUpsertSchema.parse(input);
    this.upsertStmt.run({
      workflow_id: parsed.workflow_id,
      step_no: parsed.step_no,
      step_name: parsed.step_name,
      persona_handle: parsed.persona_handle,
      inputs: packJson(parsed.inputs),
      outputs: packJson(parsed.outputs),
      gate_kind: parsed.gate_kind,
      parallel_with: packJson(parsed.parallel_with),
      source_path: parsed.source_path,
    });
    // Re-fetch the row keyed by the unique (workflow_id, step_no) pair.
    const row = this.db
      .prepare(
        'SELECT * FROM workflow_steps WHERE workflow_id = ? AND step_no = ?',
      )
      .get(parsed.workflow_id, parsed.step_no) as Row;
    return rowToStep(row);
  }

  list(workflow_id: string): WorkflowStepIndex[] {
    const rows = this.listByWorkflowStmt.all(workflow_id) as Row[];
    return rows.map(rowToStep);
  }

  listByPersona(handle: string): WorkflowStepIndex[] {
    const rows = this.listByPersonaStmt.all(handle) as Row[];
    return rows.map(rowToStep);
  }

  /** Wipe one workflow's rows — used when reloading a single workflow. */
  deleteByWorkflow(workflow_id: string): void {
    this.deleteByWorkflowStmt.run(workflow_id);
  }

  /** Wipe — used by boot reload before a fresh batch upsert. */
  deleteAll(): void {
    this.deleteAllStmt.run();
  }

  /**
   * Persona usage counts — feeds `GET /api/personas/usage`. Personas with
   * zero steps are NOT included (use `personas.list()` for the full set).
   */
  usageCounts(): { persona_handle: string; step_count: number }[] {
    return this.usageCountStmt.all() as {
      persona_handle: string;
      step_count: number;
    }[];
  }

  /**
   * Cross-cut dependency view for a workflow — the deduplicated union of
   * every step's inputs and outputs. Feeds
   * `GET /api/workflows/:id/dependencies`.
   */
  dependencies(workflow_id: string): WorkflowDependencyAggregate {
    const rows = this.list(workflow_id);
    const inputs = new Set<string>();
    const outputs = new Set<string>();
    for (const step of rows) {
      for (const i of step.inputs) inputs.add(i);
      for (const o of step.outputs) outputs.add(o);
    }
    return {
      inputs: [...inputs].sort(),
      outputs: [...outputs].sort(),
    };
  }
}
