-- Kortext v3.1 — Faz 12.5 — per-file reports + reports_index
--
-- Rationale: monolithic per-scope report files (test-reports.md, …) replaced
-- with one file per report under `.kortext/reports/<scope>_<slug>_<ts>.md`.
-- `reports_index` is the SQL surface that lets the dashboard list / filter /
-- sort without scanning disk.
--
-- Naming pattern enforced by the engine when files are written:
--   <scope>_<slug>_<YYYY-MM-DD-HHMM>.md
-- e.g. 'test-reports_login-flow_2026-05-24-1432.md'
--
-- Design decisions:
--   #4 — INTEGER ms timestamps (Unix ms, consistent with other tables)
--   #5 — TEXT JSON columns for arrays (`tags`) accessed via json1
--
-- `file_path` is UNIQUE — relative to project root, e.g.
--   `.kortext/reports/test-reports_login-flow_2026-05-24-1432.md`.
-- This is the natural identity of a report (one file, one row).
--
-- `related_item` is a soft pointer to a backlog item id (e.g. 'T01-login').
-- We intentionally do NOT add a FOREIGN KEY: reports may outlive their parent
-- backlog item (audit trail), and engine may write a report for an item id
-- that is later renamed/migrated. Index, not FK.

CREATE TABLE IF NOT EXISTS reports_index (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  scope           TEXT NOT NULL,
  slug            TEXT NOT NULL,
  file_path       TEXT NOT NULL UNIQUE,
  author          TEXT,
  status          TEXT NOT NULL DEFAULT 'uninitialized'
                    CHECK (status IN ('uninitialized','writing','approved')),
  tags            TEXT NOT NULL DEFAULT '[]',
  related_item    TEXT,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_index_scope ON reports_index(scope);
CREATE INDEX IF NOT EXISTS idx_reports_index_status ON reports_index(status);
CREATE INDEX IF NOT EXISTS idx_reports_index_created_at ON reports_index(created_at);
CREATE INDEX IF NOT EXISTS idx_reports_index_related_item ON reports_index(related_item);
