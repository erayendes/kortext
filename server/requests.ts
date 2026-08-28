import type Database from 'better-sqlite3';

export type RequestType = 'revise' | 'report' | 'planning' | 'question';

export interface KortextRequest {
  id: number;
  project_id: number;
  type: RequestType;
  payload: string; // JSON string
  status: 'pending' | 'done' | 'cancelled';
  created_at: string;
  completed_at: string | null;
}

const TYPES: RequestType[] = ['revise', 'report', 'planning', 'question'];

export function createRequest(
  db: Database.Database,
  projectId: number,
  type: string,
  payload: unknown,
): KortextRequest {
  if (!TYPES.includes(type as RequestType)) throw new Error(`unknown request type: ${type}`);
  return db
    .prepare('INSERT INTO requests (project_id, type, payload) VALUES (?, ?, ?) RETURNING *')
    .get(projectId, type, JSON.stringify(payload ?? {})) as KortextRequest;
}

export function listRequests(
  db: Database.Database,
  projectId: number,
  status?: string,
): KortextRequest[] {
  return status
    ? (db
        .prepare('SELECT * FROM requests WHERE project_id = ? AND status = ? ORDER BY id')
        .all(projectId, status) as KortextRequest[])
    : (db.prepare('SELECT * FROM requests WHERE project_id = ? ORDER BY id DESC').all(projectId) as KortextRequest[]);
}

export function completeRequest(db: Database.Database, id: number): boolean {
  return (
    db
      .prepare(
        "UPDATE requests SET status = 'done', completed_at = datetime('now') WHERE id = ? AND status = 'pending'",
      )
      .run(id).changes > 0
  );
}

export function cancelRequest(db: Database.Database, id: number): boolean {
  return (
    db
      .prepare(
        "UPDATE requests SET status = 'cancelled', completed_at = datetime('now') WHERE id = ? AND status = 'pending'",
      )
      .run(id).changes > 0
  );
}
