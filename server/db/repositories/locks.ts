import type Database from 'better-sqlite3';
import { LockInsertSchema, LockSchema, type Lock, type LockInsert } from '../schemas.ts';

type Row = {
  id: number;
  resource: string;
  holder: string;
  reason: string | null;
  acquired_at: number;
  expires_at: number | null;
};

function rowToLock(row: Row): Lock {
  return LockSchema.parse(row);
}

export class LocksRepository {
  private readonly insertStmt;
  private readonly selectByResourceStmt;
  private readonly listStmt;
  private readonly releaseStmt;
  private readonly cleanExpiredStmt;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO locks (resource, holder, reason, acquired_at, expires_at)
      VALUES (@resource, @holder, @reason, @acquired_at, @expires_at)
    `);
    this.selectByResourceStmt = db.prepare('SELECT * FROM locks WHERE resource = ?');
    this.listStmt = db.prepare('SELECT * FROM locks ORDER BY acquired_at DESC');
    this.releaseStmt = db.prepare('DELETE FROM locks WHERE resource = @resource AND holder = @holder');
    this.cleanExpiredStmt = db.prepare(
      'DELETE FROM locks WHERE expires_at IS NOT NULL AND expires_at < ?',
    );
  }

  /** Returns null if resource is already locked by another holder. */
  acquire(input: LockInsert): Lock | null {
    const parsed = LockInsertSchema.parse(input);
    try {
      this.insertStmt.run({
        resource: parsed.resource,
        holder: parsed.holder,
        reason: parsed.reason,
        acquired_at: Date.now(),
        expires_at: parsed.expires_at,
      });
      return this.getByResource(parsed.resource);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('UNIQUE constraint failed')) return null;
      throw e;
    }
  }

  getByResource(resource: string): Lock | null {
    const row = this.selectByResourceStmt.get(resource) as Row | undefined;
    return row ? rowToLock(row) : null;
  }

  list(): Lock[] {
    const rows = this.listStmt.all() as Row[];
    return rows.map(rowToLock);
  }

  /** Returns true if the lock was released (resource + holder matched). */
  release(resource: string, holder: string): boolean {
    return this.releaseStmt.run({ resource, holder }).changes > 0;
  }

  cleanExpired(now = Date.now()): number {
    return this.cleanExpiredStmt.run(now).changes;
  }
}
