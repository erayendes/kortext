-- Kortext v3.1 — Faz 12.8 — Workflow / persona SQL index.
--
-- Markdown remains the source of truth (`agents/*.md`, `workflows/*.md` —
-- both inside the npm package, see `runtimeLayout()`). At engine boot the
-- parser upserts a denormalized projection of every persona + every
-- workflow step into the two tables below. The projection is what the
-- dashboard queries for cross-cut views ("how many steps does this persona
-- own?", "which references does this workflow touch?") and what enforces
-- foreign-key consistency: a workflow step that names an unknown
-- `+persona` handle is rejected at boot — no more silent `+placeholder`
-- references leaking through.
--
-- Discipline (matches the v3.0 schema):
--   - Timestamps are Unix milliseconds (INTEGER).
--   - JSON columns are TEXT, stringified at write, parsed at read.
--   - All upserts happen inside a single transaction at boot so a partial
--     parse can never leave the index half-populated.

PRAGMA defer_foreign_keys = ON;

----------------------------------------------------------------------
-- personas: handle-indexed projection of agents/*.md
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS personas (
  handle         TEXT PRIMARY KEY,                       -- e.g. '+backend-developer'
  purpose        TEXT,                                   -- '## purpose' body, trimmed
  capabilities   TEXT NOT NULL DEFAULT '[]',             -- JSON array (future use)
  when_to_use    TEXT,                                   -- '## when to use' body, trimmed
  model_default  TEXT,                                   -- 'claude' | 'agy' | 'codex' | null
  source_path    TEXT NOT NULL,                          -- e.g. 'agents/+backend-developer.md'
  updated_at     INTEGER NOT NULL
);

----------------------------------------------------------------------
-- workflow_steps: step-by-step projection of workflows/*.md
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_steps (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id     TEXT NOT NULL,                         -- e.g. '04-development-cycle'
  step_no         INTEGER NOT NULL,                      -- 0-based, matches WorkflowStep.index
  step_name       TEXT,                                  -- WorkflowStep.key (phase.idx slug)
  persona_handle  TEXT NOT NULL,                         -- FK -> personas.handle
  inputs          TEXT NOT NULL DEFAULT '[]',            -- JSON array of file paths
  outputs         TEXT NOT NULL DEFAULT '[]',            -- JSON array of file paths
  gate_kind       TEXT,                                  -- 'blueprint'|'architecture'|'deploy'|null
  parallel_with   TEXT NOT NULL DEFAULT '[]',            -- JSON array of step_no's
  source_path     TEXT NOT NULL,                         -- e.g. 'workflows/04-development-cycle.md'
  FOREIGN KEY (persona_handle) REFERENCES personas(handle)
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_id
  ON workflow_steps(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_persona
  ON workflow_steps(persona_handle);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_steps_uniq
  ON workflow_steps(workflow_id, step_no);
