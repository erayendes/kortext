# Kortext — Faz-3 boşlukları + Motor dilimleri + İçerik kalibrasyonu

> **For agentic workers:** Execute with `superpowers:subagent-driven-development` (TDD per task). Steps use `- [ ]`. This plan was scoped by three parallel investigation agents (2026-06-06); seams + test assertions are grounded in real code. Implementers MUST read the cited files for exact signatures before coding.

**Goal:** Close the three areas Eray approved (2026-06-06): (A) dependency generation + epic-id, (B) all deferred engine slices except blocker-clear, (C) full content dead-tool cleanup.

**Decisions locked by Eray:**
- Dependencies: **agent-authored + engine-validated** (strengthen workflow instructions; engine enforces symmetry + flags dangling refs; engine does NOT invent dependencies).
- Engine slices: **all of 3,4,1,6,5**. Slice 2 (blocker-clear) stays deferred (needs schema migration + dependency model — separate decision).
- Content: **full** (mechanical dead-refs + remap `kortext-*.py` → real v3 mechanisms).

**Conventions:** TS ESM with `.ts` import extensions. Work on `main` (no branch). `npm run typecheck` + `npx vitest run` must stay green. Each task: TDD (red→green), then commit.

---

## STREAM A — Dependency generation + epic-id

### Task A1: Epic-id coded format (`<CODE>-E0N`) in the ingester
**Files:** `server/engine/backlog-ingest.ts`, `server/index.ts` · Test: `tests/backlog-ingest.test.ts`
Today `deriveSyntheticEpics` (backlog-ingest.ts ~L284) synthesizes `epic-${slug}`. Thread the project `code` so synthesized epics become `${code}-E${NN}` (E01, E02… within the batch, stable on re-ingest). `code` is read via `readProjectMeta` (already called in `server/index.ts` ~L188/245); pass it through `ingestBacklogItems`/`ingestBacklogFile` to `deriveSyntheticEpics`.
- [ ] Tests: (1) flat list with `epic: "Auth"` + code `TF` → epic id `TF-E01`; (2) two labels → `TF-E01`,`TF-E02`; (3) re-ingest idempotent (same ids); (4) no `code` → old `epic-${slug}` preserved (no regression).
- [ ] Implement: add optional `code` param to `deriveSyntheticEpics` + thread through `ingestBacklogItems(opts?:{code?})` + `ingestBacklogFile`; `server/index.ts` hook passes `meta?.code`.
- [ ] typecheck + commit `feat(backlog): coded epic ids (<CODE>-E0N) in synthetic epic derivation`

### Task A2: Strengthen planning-pipeline dependency instructions
**Files:** `workflows/planning-pipeline.md` (no code test)
The agent wrote zero deps in the live run. Step-1 already mentions `blocks`/`blocked_by` (~L26). Make it ZORUNLU: every item must include both fields (empty `[]` only if genuinely no dependency), and the example schema must show non-empty values. Add a Konsolidasyon (final step ~L113) check: flag items where deps look suspicious (e.g. a multi-step epic with all-empty deps).
- [ ] Edit workflow doc; keep DAG-acyclic guarantees intact (backlog.yaml is an extra output, not a pipeline input).
- [ ] commit `docs(workflow): require blocks/blocked_by in planning-pipeline step-1 + konsolidasyon check`

### Task A3: Engine symmetry enforcement for dependencies
**Files:** `server/engine/backlog-ingest.ts` · Test: `tests/backlog-ingest.test.ts`
Add pure `enforceSymmetricDeps(items)` run before the ingest loop: if `A.blocks` includes `B`, ensure `B.blocked_by` includes `A` (and inverse). Additive only (never removes an agent-authored entry).
- [ ] Tests: (1) `TF-001 blocks:[TF-002]`, `TF-002` no blocked_by → after ingest `TF-002.frontmatter.blocked_by` contains `TF-001`; (2) already-symmetric input → no duplicates; (3) inverse direction (`blocked_by` → adds `blocks`).
- [ ] Implement + wire into `ingestBacklogItems`.
- [ ] typecheck + commit `feat(backlog): enforce symmetric blocks/blocked_by on ingest`

### Task A4: Dangling-ref warning on ingest
**Files:** `server/engine/backlog-ingest.ts` · Test: `tests/backlog-ingest.test.ts`
After all rows ingested, scan each item's `blocks`/`blocked_by` for ids not present in the batch/DB; write an `audit_log` warning (no data mutation — warn only).
- [ ] Test: ingest YAML with `TF-001 blocked_by:[TF-999]` (absent) → audit_log has an entry naming `TF-999` / "dangling".
- [ ] Implement (reuse the audit repo already in scope).
- [ ] typecheck + commit `feat(backlog): warn on dangling dependency references during ingest`

---

## STREAM B — Engine deferred slices

### Task B1 (Slice 3): `gate_runs` UAT verdict
**Files:** `server/orchestrator/review-cycle.ts` · Test: `tests/review-cycle.test.ts` (or nearest)
`judgeReview` (review-cycle.ts ~L92) writes the UAT reject reason only to `audit_log`; it never creates a `gate_runs` row. The table already allows `gate='uat'` (migration 005) with `UNIQUE(item_id, attempt, gate)`. Derive the UAT attempt as **count of prior `uat` gate_run rows + 1** (avoids the 0-test-gate collision trap). On verdict, create + transition a `gate_runs` row (`status` pass/fail, `findings`=reason).
- [ ] Read `server/db/repositories/*` for the `gateRuns` repo API (`create`/`transition`/`listForItem`) and `review-cycle.ts` for `judgeReview` shape.
- [ ] Tests: (1) item with `review_gates:['uat']`, 0 test gates, reject verdict → one `gate_runs` row `gate='uat' status='fail'`; (2) second bounce → second row, attempt incremented, no UNIQUE collision; (3) approve verdict → row `status='pass'`.
- [ ] Implement (UAT-attempt = prior uat rows + 1).
- [ ] typecheck + commit `feat(orchestrator): record uat verdict as a gate_runs row`

### Task B2 (Slice 4): Epic-status-flip on completion
**Files:** `server/orchestrator/epic-completion.ts` · Test: `tests/epic-completion.test.ts`
After `complete` is detected (epic-completion.ts ~L60, before/around the deploy), set the epic item's own status to `done`. Use a **direct `repos.backlog` status write + explicit `audit_log` entry** (epics bypass the worker/review lifecycle; cleaner than inventing an `epic-done` transition). Keep deploy behavior unchanged.
- [ ] Read `epic-completion.ts` + the backlog repo for the status-set method + audit repo.
- [ ] Tests: (1) epic E, all children terminal & ≥1 done → after `runEpicCompletion`, `repos.backlog.get(E).status === 'done'` + audit entry; (2) incomplete epic → status untouched.
- [ ] typecheck + commit `feat(orchestrator): flip epic status to done on child completion`

### Task B3 (Slice 1): Handover-on-close
**Files:** `server/orchestrator/closure.ts`, `server/orchestrator/composition.ts` · Test: `tests/closure.test.ts`
`HandoverEngine` (server/engine/handover.ts) is fully built but never called from closure. Add `HandoverEngine` to `ClosureDeps`, wire it in `composition.ts`, and call `record()` inside `runClosure` after a successful merge (`merge.ok === true`).
**Content default (Eray to see):** `from` = item owner/assignee, `to` = `+prime`, `item_id` = itemId, `completed` = item title + "acceptance criteria met", `context` = brief run summary + merge commit SHA, `nextStep` = "review merged work / pick next item". Derive from `repos.backlog.get(itemId)`, `repos.runs.listSteps(runId)`, and the merge outcome.
- [ ] Read `server/engine/handover.ts` (`record`/`HandoverInput`), `closure.ts` (`runClosure`/`ClosureDeps`/merge result), `composition.ts`.
- [ ] Tests: (1) successful mock merge → `repos.handovers.list()` has one row `item_id===itemId`, `from_persona` set; markdown prepended to `.kortext/memory/handover.md`; (2) failed merge → no handover written.
- [ ] typecheck + commit `feat(orchestrator): write handover on successful closure`

### Task B4 (Slice 6): Preview URL persistence + exposure
**Files:** `server/db/migrations/009_add_preview_url.sql` (NEW), `server/db/schemas.ts`, `server/db/repositories/backlog.ts` (or wherever), `server/orchestrator/run-item.ts`, a route file · Tests: `tests/*`
Start/stop wiring already exists (run-item.ts ~L165 `startFor`; closure.ts ~L74 `stopFor`). Add persistence: **simplest model = `backlog_items.preview_url TEXT` column** (migration 009, `ALTER TABLE ADD COLUMN` — no CHECK rebuild). After `startFor` resolves, persist the URL on the item; expose via `GET /api/backlog/:id` (include `preview_url`) or a small dedicated route. Gate by a `preview` frontmatter flag (default off → only items explicitly marked runnable get a preview persisted).
- [ ] Migration 009 + schema field + repo setter/getter.
- [ ] Tests: (1) `runItem` success with mock preview server + item flagged runnable → `repos.backlog.get(itemId).preview_url` set; (2) item not flagged → no preview persisted; (3) API returns the url; (4) build-verification migration count test still green (8→9 migrations — UPDATE that assertion).
- [ ] typecheck + commit `feat(preview): persist + expose item preview URL (migration 009)`

### Task B5 (Slice 5): Gate-persona staging reports + prime staging approval
**Files:** NEW `server/orchestrator/staging-approval.ts`, `server/orchestrator/epic-completion.ts`, `server/orchestrator/approval-queue.ts` (type), `server/orchestrator/composition.ts` · Tests: `tests/staging-approval.test.ts`
After `deployStaging` succeeds in `runEpicCompletion`, run staging-approval:
**5a — gate-persona reports:** query `gate_runs` for all the epic's children, group by persona; for each persona that ran a gate, register a `reports_index` row (`scope='gate-staging'`, `author=<persona>`) — write via the existing `OutputIndexer`/reports repo. (Keep it a deterministic fan-out over gate_runs; the report body can be a short generated summary — no LLM needed for v1.)
**5b — prime approval:** loosen `ApprovalQueue.enqueue` input `runId: number` → `number | null` (the `pending_questions.run_id` column is already nullable). Enqueue a question `phase='staging-approval'`, `persona='+prime'`, `run_id=null`, referencing the epic.
- [ ] Read `server/orchestrator/approval-queue.ts`, `server/db/repositories/*` (gate_runs list, reports_index/OutputIndexer, pendingQuestions), `epic-completion.ts`.
- [ ] Tests: (5a) after staging deploy with 2 distinct gate personas on the epic's children → 2 `reports_index` rows `scope='gate-staging'`; (5b) → `pendingQuestions.listOpen()` has a `phase='staging-approval'`, `persona='+prime'`, `run_id=null` row; (enqueue type accepts null runId).
- [ ] Wire `runStagingApproval` into `runEpicCompletion` after `deploy.ok`. Keep it best-effort (a failed report fan-out must not throw the closure).
- [ ] typecheck + commit `feat(orchestrator): gate-persona staging reports + prime staging-approval`

> **Note (out of scope here):** the *consumer* of the staging-approval answer (prime approves → version advances; rejects → motor opens a bug) is a follow-up; this task only produces the reports + the approval question.

---

## STREAM C — Content dead-tool cleanup

### Task C1: Mechanical dead-ref removal (no design ambiguity)
**Files:** `workflows/hotfix-pipeline.md` (L30 `write_learned`), `workflows/rollback-pipeline.md` (L34 `write_learned`), `workflows/spike-pipeline.md` (L13 `write_decision`), `templates/AGENTS.md` (L30 `get_backlog_item`)
Replace fake MCP tools with the real mechanism: `write_learned` → "write to `workspace/memory/learned.md`"; `write_decision` → "write to `workspace/memory/decisions.md`"; remove `get_backlog_item` (keep `list_backlog`). Mirror how `planning-pipeline.md` was already cleaned. Do NOT touch the intentional negative guard in `planning-pipeline.md:5` (`update_backlog_item ... YOKTUR`).
- [ ] Apply edits; commit `docs(content): remove dead MCP tool refs (write_learned/write_decision/get_backlog_item)`

### Task C2: Remap `kortext-*.py` script references to v3 mechanisms
**Files:** `rules/commands.md`, `rules/behavior.md`, `agents/backend-developer.md`, `agents/frontend-developer.md`
The real allowlist (18 MCP tools, registered in `mcp/server.ts`): `list_workflows, list_personas, list_pipelines, list_backlog, add_backlog_item, transition_item, get_acceptance_criteria, mark_acceptance_criterion, get_pipeline, start_pipeline, list_pending_questions, respond_to_question, get_context, handover, get_logs, read_blueprint, approve_blueprint, get_runtime_status`. No `kortext-*.py` scripts exist.
Mappings: `kortext-item-start.py`/`kortext-item-transition.py` → `transition_item`; `kortext-handover.py` → `handover`; `kortext-item-check.py` → `get_acceptance_criteria` + `mark_acceptance_criterion` (self-verify); `kortext-backlog-done.py` → `transition_item` (to done); `kortext-backlog-sync.py` → remove (motor auto-syncs); consistency/health/context-check scripts → "motor/`get_runtime_status`" or `—` (manual) where no v3 equivalent. `rules/commands.md` "Çağrılan Script" column = full redesign to real tool / motor mechanism / `—`.
- [ ] `rules/behavior.md`: remap the 4 script calls (L38/43/44/46) to the MCP tools above; drop `backlog-sync` step.
- [ ] `rules/commands.md`: rewrite the script column per mapping.
- [ ] `agents/backend-developer.md` + `agents/frontend-developer.md`: `kortext-backlog-done.py` → `transition_item`.
- [ ] commit `docs(content): remap dead kortext-*.py refs to real v3 MCP tools/motor`

---

## Wave plan (subagent-driven-development)
- **Wave 1 (parallel-safe by area, run sequentially in one tree):** A1, A2, A3, A4 (Stream A — all backlog-ingest/workflow), C1, C2 (Stream C — content, independent).
- **Wave 2 (engine, independent files):** B1 (review-cycle), B2 (epic-completion), B4 (preview, migration 009).
- **Wave 3 (engine, shared/dependent):** B3 (closure — coordinate file with B5 path), B5 (epic-completion + new module; after B2 so the status-flip + report fan-out coexist cleanly).
- **Gate after each wave:** `npm run typecheck && npx vitest run` green.
- **Final:** full suite + holistic review + docs update (HANDOVER/TODO/DECISIONS).
