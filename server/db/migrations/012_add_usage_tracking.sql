-- UAT #10 Faz 1 — token/maliyet görünürlüğü.
-- Capture per-step token/cost telemetry from the executor CLIs (claude emits a
-- `usage` block + `total_cost_usd` via --output-format json). Stored as a JSON
-- blob so the shape can grow (cache tokens, per-executor fields) without further
-- migrations. Additive + nullable: every pre-existing row stays valid, NULL means
-- "no telemetry captured for this step" (older runs, or executors that report none).

ALTER TABLE run_steps ADD COLUMN usage_metadata TEXT;
ALTER TABLE gate_runs ADD COLUMN usage_metadata TEXT;
