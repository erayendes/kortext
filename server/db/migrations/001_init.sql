-- Kortext v3.0 — initial schema
-- All timestamps are Unix milliseconds (INTEGER). All JSON columns are TEXT with json1 access.

----------------------------------------------------------------------
-- backlog_items: Epic / Task / Bug / Debt / Spike / Hotfix
----------------------------------------------------------------------
CREATE TABLE backlog_items (
  id            TEXT PRIMARY KEY,                      -- e.g. T01, E01-auth
  type          TEXT NOT NULL CHECK (type IN ('task','bug','debt','epic','spike','hotfix')),
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'to_do'
                  CHECK (status IN ('to_do','in_progress','blocked','review','done','cancelled')),
  owner         TEXT,                                  -- persona handle, e.g. '+backend-engineer'
  parent_id     TEXT REFERENCES backlog_items(id) ON DELETE SET NULL,
  version       TEXT,                                  -- target version, e.g. 'v3.0.0'
  frontmatter   TEXT NOT NULL DEFAULT '{}',            -- JSON metadata
  body_md       TEXT NOT NULL DEFAULT '',              -- full markdown body
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX idx_backlog_status ON backlog_items(status);
CREATE INDEX idx_backlog_owner ON backlog_items(owner);
CREATE INDEX idx_backlog_parent ON backlog_items(parent_id);
CREATE INDEX idx_backlog_type ON backlog_items(type);

----------------------------------------------------------------------
-- sessions: runtime oturumları
----------------------------------------------------------------------
CREATE TABLE sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  started_by    TEXT NOT NULL,                         -- persona or 'user' or 'system'
  entry_point   TEXT NOT NULL CHECK (entry_point IN ('cli','mcp','dashboard','cron','system')),
  metadata      TEXT NOT NULL DEFAULT '{}',
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER
);

CREATE INDEX idx_sessions_started_at ON sessions(started_at);

----------------------------------------------------------------------
-- contexts: aktif ajan oturum context'leri
----------------------------------------------------------------------
CREATE TABLE contexts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  persona       TEXT NOT NULL,
  item_id       TEXT REFERENCES backlog_items(id) ON DELETE CASCADE,
  session_id    INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  payload       TEXT NOT NULL DEFAULT '{}',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE(persona, item_id)
);

CREATE INDEX idx_contexts_persona ON contexts(persona);
CREATE INDEX idx_contexts_item ON contexts(item_id);

----------------------------------------------------------------------
-- locks: dosya/path kilitleri
----------------------------------------------------------------------
CREATE TABLE locks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  resource      TEXT NOT NULL UNIQUE,                  -- path or logical resource id
  holder        TEXT NOT NULL,                         -- persona handle
  reason        TEXT,
  acquired_at   INTEGER NOT NULL,
  expires_at    INTEGER                                -- nullable: null = manual release
);

CREATE INDEX idx_locks_holder ON locks(holder);
CREATE INDEX idx_locks_expires_at ON locks(expires_at);

----------------------------------------------------------------------
-- handovers: persona devir kayıtları
----------------------------------------------------------------------
CREATE TABLE handovers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id         TEXT REFERENCES backlog_items(id) ON DELETE CASCADE,
  from_persona    TEXT NOT NULL,
  to_persona      TEXT NOT NULL,
  reason          TEXT,
  context_payload TEXT NOT NULL DEFAULT '{}',          -- JSON snapshot
  markdown_path   TEXT,                                -- mirrored handover.md
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_handovers_item ON handovers(item_id);
CREATE INDEX idx_handovers_to ON handovers(to_persona);
CREATE INDEX idx_handovers_created_at ON handovers(created_at);

----------------------------------------------------------------------
-- decisions_index: ADR markdown index
----------------------------------------------------------------------
CREATE TABLE decisions_index (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id     TEXT NOT NULL UNIQUE,                -- e.g. 'ADR-001'
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'proposed'
                    CHECK (status IN ('proposed','accepted','superseded','rejected')),
  markdown_path   TEXT NOT NULL,                       -- relative path to .md file
  item_id         TEXT REFERENCES backlog_items(id) ON DELETE SET NULL,
  tags            TEXT NOT NULL DEFAULT '[]',          -- JSON array
  created_at      INTEGER NOT NULL,
  decided_at      INTEGER
);

CREATE INDEX idx_decisions_status ON decisions_index(status);
CREATE INDEX idx_decisions_item ON decisions_index(item_id);

----------------------------------------------------------------------
-- runs: pipeline çalıştırmaları
----------------------------------------------------------------------
CREATE TABLE runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id     TEXT NOT NULL,                       -- e.g. '01a-analysis-pipeline'
  item_id         TEXT REFERENCES backlog_items(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','running','succeeded','failed','cancelled','awaiting_approval')),
  worktree_path   TEXT,
  triggered_by    TEXT NOT NULL,                       -- persona / 'auto' / 'user'
  error_message   TEXT,
  started_at      INTEGER,
  ended_at        INTEGER,
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_runs_status ON runs(status);
CREATE INDEX idx_runs_workflow ON runs(workflow_id);
CREATE INDEX idx_runs_item ON runs(item_id);
CREATE INDEX idx_runs_created_at ON runs(created_at);

----------------------------------------------------------------------
-- run_steps: her pipeline adımı
----------------------------------------------------------------------
CREATE TABLE run_steps (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_index      INTEGER NOT NULL,
  step_name       TEXT NOT NULL,
  persona         TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','succeeded','failed','skipped')),
  started_at      INTEGER,
  ended_at        INTEGER,
  log_path        TEXT,
  output_summary  TEXT,
  error_message   TEXT,
  UNIQUE(run_id, step_index)
);

CREATE INDEX idx_run_steps_run ON run_steps(run_id);
CREATE INDEX idx_run_steps_status ON run_steps(status);

----------------------------------------------------------------------
-- pending_questions: +prime onay kuyruğu
----------------------------------------------------------------------
CREATE TABLE pending_questions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          INTEGER REFERENCES runs(id) ON DELETE CASCADE,
  step_id         INTEGER REFERENCES run_steps(id) ON DELETE SET NULL,
  question        TEXT NOT NULL,
  choices         TEXT NOT NULL DEFAULT '[]',          -- JSON array; empty = free-form
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','answered','expired','cancelled')),
  answer          TEXT,
  answered_by     TEXT,
  answered_at     INTEGER,
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_pending_q_status ON pending_questions(status);
CREATE INDEX idx_pending_q_run ON pending_questions(run_id);

----------------------------------------------------------------------
-- runtime_artifacts: worktree, log, diff snapshot
----------------------------------------------------------------------
CREATE TABLE runtime_artifacts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          INTEGER REFERENCES runs(id) ON DELETE CASCADE,
  step_id         INTEGER REFERENCES run_steps(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('worktree','log','diff','stdout','stderr','file','screenshot')),
  path            TEXT NOT NULL,
  bytes           INTEGER,
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_artifacts_run ON runtime_artifacts(run_id);
CREATE INDEX idx_artifacts_kind ON runtime_artifacts(kind);

----------------------------------------------------------------------
-- notifications_sent: bildirim deduplication
----------------------------------------------------------------------
CREATE TABLE notifications_sent (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  channel         TEXT NOT NULL CHECK (channel IN ('slack','telegram','ui','email')),
  event_key       TEXT NOT NULL,                       -- dedup key per channel+event
  payload         TEXT NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'sent'
                    CHECK (status IN ('sent','failed','suppressed')),
  error_message   TEXT,
  created_at      INTEGER NOT NULL,
  UNIQUE(channel, event_key)
);

CREATE INDEX idx_notif_created_at ON notifications_sent(created_at);

----------------------------------------------------------------------
-- secrets_scan_results: secret-scanner bulguları
----------------------------------------------------------------------
CREATE TABLE secrets_scan_results (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          INTEGER REFERENCES runs(id) ON DELETE SET NULL,
  scanned_path    TEXT NOT NULL,
  finding_type    TEXT NOT NULL,                       -- e.g. 'aws_access_key','generic_api_key'
  severity        TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  line_number     INTEGER,
  context         TEXT,
  masked_snippet  TEXT,
  resolved        INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0,1)),
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_secrets_severity ON secrets_scan_results(severity);
CREATE INDEX idx_secrets_resolved ON secrets_scan_results(resolved);
CREATE INDEX idx_secrets_run ON secrets_scan_results(run_id);

----------------------------------------------------------------------
-- audit_log: tüm aksiyonların append-only kaydı
----------------------------------------------------------------------
CREATE TABLE audit_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  actor           TEXT NOT NULL,                       -- persona, 'user', 'system'
  action          TEXT NOT NULL,                       -- e.g. 'backlog.item.created'
  resource_type   TEXT,
  resource_id     TEXT,
  payload         TEXT NOT NULL DEFAULT '{}',
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_audit_actor ON audit_log(actor);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_created_at ON audit_log(created_at);
