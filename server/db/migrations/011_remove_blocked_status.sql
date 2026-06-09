-- Kortext v3.1 — remove 'blocked' from backlog_items.status (UAT #10)
--
-- `blocked` is no longer a status. Eray's model: a dependency lock is NOT a
-- lane the item moves into — it is a DERIVED flag (orchestrator/build-order.ts
-- `isBlocked`) overlaid as a 🔒 badge on the item's REAL status column. A
-- never-started item waiting on a dependency simply stays in `to_do`.
--
-- SQLite cannot ALTER a CHECK constraint, so we rebuild the table (the
-- 002_add_test_status.sql pattern), this time WITHOUT 'blocked' in the CHECK,
-- and convert any surviving `blocked` rows to `to_do` (their dependency info in
-- frontmatter.blocked_by is preserved — it's what drives the derived lock).
--
-- The rebuild carries every column added by later migrations (review_gates 006,
-- model 008, preview_url 009) so nothing is dropped.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE backlog_items_new (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('task','bug','debt','epic','spike','hotfix')),
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'to_do'
                  CHECK (status IN ('to_do','in_progress','test','review','done','cancelled')),
  owner         TEXT,
  parent_id     TEXT REFERENCES backlog_items(id) ON DELETE SET NULL,
  version       TEXT,
  frontmatter   TEXT NOT NULL DEFAULT '{}',
  body_md       TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  review_gates  TEXT NOT NULL DEFAULT '[]',
  model         TEXT,
  preview_url   TEXT
);

-- Convert legacy 'blocked' rows → 'to_do' on copy; everything else unchanged.
INSERT INTO backlog_items_new
  (id, type, title, status, owner, parent_id, version, frontmatter, body_md,
   created_at, updated_at, review_gates, model, preview_url)
  SELECT id, type, title,
         CASE WHEN status = 'blocked' THEN 'to_do' ELSE status END,
         owner, parent_id, version, frontmatter, body_md,
         created_at, updated_at, review_gates, model, preview_url
  FROM backlog_items;

DROP TABLE backlog_items;
ALTER TABLE backlog_items_new RENAME TO backlog_items;

CREATE INDEX idx_backlog_status ON backlog_items(status);
CREATE INDEX idx_backlog_owner ON backlog_items(owner);
CREATE INDEX idx_backlog_parent ON backlog_items(parent_id);
CREATE INDEX idx_backlog_type ON backlog_items(type);
