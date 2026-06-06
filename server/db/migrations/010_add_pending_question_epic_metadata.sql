-- Kortext v3.1 — pending_questions epic metadata (M2a)
-- Carries epicId + version so staging-approval consumers can act without
-- parsing question text. Stored as JSON TEXT, nullable — non-epic questions
-- leave this NULL.

ALTER TABLE pending_questions ADD COLUMN metadata TEXT;
