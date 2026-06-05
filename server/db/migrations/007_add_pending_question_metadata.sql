-- Kortext v3.1 — pending_questions artifact metadata (gate UI contract)
-- When an onboarding analysis step finishes and opens a +prime gate, the
-- dashboard needs to show WHICH artifact is awaiting approval (and from whom).
-- These nullable columns carry that context from the gate into GET /api/questions.
--   artifact_path: the step's first declared output (e.g. .kortext/references/LEGAL.md)
--   persona:       the persona that produced it (e.g. +compliance-expert)
--   phase:         the gate's phase name
-- All nullable — pre-existing rows and non-gate questions simply leave them NULL.

ALTER TABLE pending_questions ADD COLUMN artifact_path TEXT;
ALTER TABLE pending_questions ADD COLUMN persona TEXT;
ALTER TABLE pending_questions ADD COLUMN phase TEXT;
