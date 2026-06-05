import type Database from 'better-sqlite3';
import {
  PendingQuestionInsertSchema,
  PendingQuestionSchema,
  PendingQuestionStatusSchema,
  type PendingQuestion,
  type PendingQuestionInsert,
  type PendingQuestionStatus,
} from '../schemas.ts';
import { packJson, unpackJson } from '../json.ts';

type Row = {
  id: number;
  run_id: number | null;
  step_id: number | null;
  question: string;
  choices: string;
  status: string;
  answer: string | null;
  answered_by: string | null;
  answered_at: number | null;
  created_at: number;
  artifact_path: string | null;
  persona: string | null;
  phase: string | null;
};

function rowToQuestion(row: Row): PendingQuestion {
  return PendingQuestionSchema.parse({
    ...row,
    choices: unpackJson<string[]>(row.choices, []),
  });
}

export class PendingQuestionsRepository {
  private readonly insertStmt;
  private readonly selectByIdStmt;
  private readonly listOpenStmt;
  private readonly answerStmt;
  private readonly transitionStmt;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO pending_questions
        (run_id, step_id, question, choices, created_at, artifact_path, persona, phase)
      VALUES
        (@run_id, @step_id, @question, @choices, @created_at, @artifact_path, @persona, @phase)
    `);
    this.selectByIdStmt = db.prepare('SELECT * FROM pending_questions WHERE id = ?');
    this.listOpenStmt = db.prepare(
      "SELECT * FROM pending_questions WHERE status = 'open' ORDER BY created_at",
    );
    this.answerStmt = db.prepare(`
      UPDATE pending_questions
      SET status = 'answered', answer = @answer, answered_by = @answered_by, answered_at = @ts
      WHERE id = @id AND status = 'open'
    `);
    this.transitionStmt = db.prepare(
      'UPDATE pending_questions SET status = @status WHERE id = @id AND status = \'open\'',
    );
  }

  create(input: PendingQuestionInsert): PendingQuestion {
    const parsed = PendingQuestionInsertSchema.parse(input);
    const result = this.insertStmt.run({
      run_id: parsed.run_id,
      step_id: parsed.step_id,
      question: parsed.question,
      choices: packJson(parsed.choices),
      created_at: Date.now(),
      artifact_path: parsed.artifact_path,
      persona: parsed.persona,
      phase: parsed.phase,
    });
    return this.get(Number(result.lastInsertRowid))!;
  }

  get(id: number): PendingQuestion | null {
    const row = this.selectByIdStmt.get(id) as Row | undefined;
    return row ? rowToQuestion(row) : null;
  }

  listOpen(): PendingQuestion[] {
    const rows = this.listOpenStmt.all() as Row[];
    return rows.map(rowToQuestion);
  }

  answer(id: number, answer: string, answered_by: string): PendingQuestion {
    const result = this.answerStmt.run({ id, answer, answered_by, ts: Date.now() });
    if (result.changes === 0) {
      throw new Error(`pending_question not open or not found: ${id}`);
    }
    return this.get(id)!;
  }

  transition(id: number, status: Exclude<PendingQuestionStatus, 'open' | 'answered'>): PendingQuestion {
    PendingQuestionStatusSchema.parse(status);
    this.transitionStmt.run({ id, status });
    return this.get(id)!;
  }
}
