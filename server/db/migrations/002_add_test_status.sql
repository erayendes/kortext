-- Kortext v3.1 — add 'test' to backlog_items.status CHECK constraint
-- SQLite cannot ALTER a CHECK constraint, so we rebuild the table.
-- Rationale: wireframe-v4-final.html Board has a dedicated "Test" column;
-- the original 001_init schema only allowed to_do/in_progress/blocked/review/done/cancelled.
-- We add 'test' as an additive status; 'blocked' and 'cancelled' are kept.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE backlog_items_new (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('task','bug','debt','epic','spike','hotfix')),
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'to_do'
                  CHECK (status IN ('to_do','in_progress','blocked','test','review','done','cancelled')),
  owner         TEXT,
  parent_id     TEXT REFERENCES backlog_items(id) ON DELETE SET NULL,
  version       TEXT,
  frontmatter   TEXT NOT NULL DEFAULT '{}',
  body_md       TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

INSERT INTO backlog_items_new
  (id, type, title, status, owner, parent_id, version, frontmatter, body_md, created_at, updated_at)
  SELECT id, type, title, status, owner, parent_id, version, frontmatter, body_md, created_at, updated_at
  FROM backlog_items;

DROP TABLE backlog_items;
ALTER TABLE backlog_items_new RENAME TO backlog_items;

CREATE INDEX idx_backlog_status ON backlog_items(status);
CREATE INDEX idx_backlog_owner ON backlog_items(owner);
CREATE INDEX idx_backlog_parent ON backlog_items(parent_id);
CREATE INDEX idx_backlog_type ON backlog_items(type);
