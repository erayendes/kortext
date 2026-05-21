import type Database from 'better-sqlite3';
import {
  NotificationInsertSchema,
  NotificationSchema,
  type Notification,
  type NotificationChannel,
  type NotificationInsert,
} from '../schemas.ts';
import { packJson, unpackJson } from '../json.ts';

type Row = {
  id: number;
  channel: string;
  event_key: string;
  payload: string;
  status: string;
  error_message: string | null;
  created_at: number;
};

function rowToNotification(row: Row): Notification {
  return NotificationSchema.parse({
    ...row,
    payload: unpackJson<Record<string, unknown>>(row.payload, {}),
  });
}

export class NotificationsRepository {
  private readonly insertStmt;
  private readonly selectByKeyStmt;
  private readonly listRecentStmt;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO notifications_sent
        (channel, event_key, payload, status, error_message, created_at)
      VALUES
        (@channel, @event_key, @payload, @status, @error_message, @created_at)
    `);
    this.selectByKeyStmt = db.prepare(
      'SELECT * FROM notifications_sent WHERE channel = ? AND event_key = ?',
    );
    this.listRecentStmt = db.prepare(`
      SELECT * FROM notifications_sent
      WHERE (@channel IS NULL OR channel = @channel)
      ORDER BY created_at DESC
      LIMIT @limit
    `);
  }

  /** Returns null if (channel, event_key) already exists (dedup). */
  record(input: NotificationInsert): Notification | null {
    const parsed = NotificationInsertSchema.parse(input);
    try {
      this.insertStmt.run({
        channel: parsed.channel,
        event_key: parsed.event_key,
        payload: packJson(parsed.payload),
        status: parsed.status,
        error_message: parsed.error_message,
        created_at: Date.now(),
      });
      return this.getByKey(parsed.channel, parsed.event_key);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('UNIQUE constraint failed')) return null;
      throw e;
    }
  }

  getByKey(channel: NotificationChannel, event_key: string): Notification | null {
    const row = this.selectByKeyStmt.get(channel, event_key) as Row | undefined;
    return row ? rowToNotification(row) : null;
  }

  listRecent(filter: { channel?: NotificationChannel | null; limit?: number } = {}): Notification[] {
    const rows = this.listRecentStmt.all({
      channel: filter.channel ?? null,
      limit: filter.limit ?? 50,
    }) as Row[];
    return rows.map(rowToNotification);
  }
}
