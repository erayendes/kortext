-- Kortext v3.1 — per-item preview URL on backlog_items (task B4)
-- The URL of the local test-preview for runnable items (frontmatter.preview=true).
-- Set by the orchestrator after a successful development-cycle exit; cleared on
-- next closure (the item goes to done and the worktree is torn down).
-- SQLite: NULL-able ADD COLUMN always allowed (no table rebuild needed).

ALTER TABLE backlog_items ADD COLUMN preview_url TEXT;
