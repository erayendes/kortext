# Kortext — Motor takibi + CLI sertleştirme + Teknik borç (sayfalama)

> Execute with `superpowers:subagent-driven-development` (TDD per task). Scoped by 3 parallel investigation agents (2026-06-07). Implementers MUST read cited files for exact APIs before coding. Work on `main`, no branch. ESM `.ts` imports, strict TS. Keep `npm run typecheck` + `npx vitest run` green; commit per task. **No new DB migrations needed** (deps live in frontmatter; epicId rides the existing `pending_questions.metadata` column from migration 007).

**Eray's decisions (2026-06-07):** blocker-clear = auto-block on ingest + auto-unblock on closure (honest board); staging = full chain (approve→record + version-completion→preprod-approval question; reject→open bug); pagination = small increment (total + offset + "N of M" + filter-first).

---

## STREAM CLI — CLI sertleştirme

### Task CLI1: Registry write-lock (parallel `start` race)
**Files:** `server/registry/projects.ts` (or new `server/registry/lock.ts`), `server/cli/cmd-start.ts` · Test: `tests/registry-lock.test.ts`
Two concurrent `kortext start` calls can read a stale registry and allocate the same port. Add a sync file lock around the read→allocate→write in `startProject`.
- Implement `withRegistryLock(dir, fn)`: acquire `<dir>/projects.json.lock` via `openSync(path, 'wx')` (O_EXCL) in a retry loop with a sync sleep (`Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)`), a deadline (~2s), and `unlinkSync` release in `finally`. Stale-lock breaker: if the lock file is older than the deadline, reclaim it.
- Wrap the read-modify-write in `startProject` (cmd-start.ts) with `withRegistryLock`.
- Tests: (1) `withRegistryLock` serializes two overlapping callbacks (second waits); (2) lock released after fn throws (finally); (3) stale lock (old mtime) is reclaimed. (Keep it sync — `startProject` is sync.)
- typecheck + commit `feat(cli): file lock around registry read-modify-write to prevent start races`

### Task CLI2: `allocatePort` exhaustion message + (optional) spawn-fail persist
**Files:** `server/registry/projects.ts`, `server/cli/cmd-start.ts` · Test: extend `tests/registry-projects.test.ts` / `tests/cmd-start.test.ts`
- `allocatePort` throw message → add recovery hint: mention `kortext list` / `kortext remove` (stale entries hold ports).
- (optional, low-risk) In `startProject` new-path branch: persist the registry right after `registerProject` (before spawn) so a spawn failure doesn't lose the registration — OR leave as-is if it complicates the lock; document the choice.
- Tests: exhausted pool → error message contains "kortext list"/"remove".
- typecheck + commit `feat(cli): actionable allocatePort exhaustion message + persist registration before spawn`

---

## STREAM M — Motor takibi

### Task M1: Blocker-clear (auto-block on ingest + auto-unblock on closure)
**Files:** new `server/orchestrator/blocker-clear.ts`, `server/engine/backlog-ingest.ts`, `server/orchestrator/closure.ts`, possibly `server/orchestrator/composition.ts` · Tests: `tests/blocker-clear.test.ts` + extend closure/ingest tests
Deps live in `frontmatter.blocks`/`blocked_by` (no DB column). `blocked` status today is only set manually (`server/orchestrator/block.ts` `blockItem`); `unblock` transition exists (`item-lifecycle.ts`). Nothing auto-blocks. Implement BOTH halves:
- **Auto-block on ingest:** in `ingestBacklogItems` (backlog-ingest.ts), after creating an item with unfinished `blocked_by` deps (any referenced dep not terminal done/cancelled), transition it to `blocked`. Needs an `ItemLifecycle` (or a direct status write + audit) available in the ingest path — read how ingest writes status; prefer the lifecycle transition for a clean audit, else direct write. Thread the lifecycle/dep if needed.
- **Auto-unblock on closure:** new pure helper `clearBlockedDependents(closedItemId, repos, lifecycle, by)`: list items; for each whose `frontmatter.blocked_by` includes the closed id AND status==='blocked' AND ALL its `blocked_by` deps are now terminal → `lifecycle.transition(id, 'unblock', by, ...)`. Call it best-effort in `runClosure` after a successful `done` transition (mirror handover/preview try/catch). Treat a dangling/missing dep as terminal. Cancelled counts as terminal.
- Tests: (M1a ingest) new item with unfinished blocked_by → status 'blocked'; with all-terminal deps → 'to_do'. (M1b closure) closing the last blocker of a 'blocked' item → it transitions to in_progress; a still-unfinished co-blocker keeps it blocked; a bounce (failed merge) does NOT clear. best-effort: a throwing transition on one candidate doesn't fail closure.
- typecheck + full suite + commit `feat(orchestrator): auto-block on unfinished deps (ingest) + auto-unblock dependents on closure`

### Task M2a: Real staging report files + carry epicId in question metadata
**Files:** `server/orchestrator/staging-approval.ts`, `server/orchestrator/composition.ts` (inject `MarkdownSyncService`) · Test: extend `tests/staging-approval.test.ts`
- Replace the synthetic `reports_index` pre-create with **real files** via `markdownSync.writeReport({ scope:'gate-staging', slug:`${epicId}--${persona}`, body_md:<stub: gate findings summary>, author:persona, status:'writing', tags:['gate-staging',epicId], related_item:epicId })`. Inject `MarkdownSyncService` through deps/composition.
- When enqueuing the staging-approval question, store `{ epicId, version }` in the question's **`metadata`** field (migration 007 added it — read `approval-queue.ts` enqueue + `pending_questions` schema to confirm the metadata field name/shape). This lets the consumer act without parsing text.
- Tests: after `runStagingApproval`, `.kortext/reports/` has one `gate-staging_*_*.md` per persona (no synthetic/`uninitialized` rows); the enqueued question's metadata contains `epicId`.
- typecheck + commit `feat(orchestrator): real gate-staging report files + epicId in staging-approval metadata`

### Task M2b: Staging-approval consumer (approve→record+version-check→preprod question; reject→bug)
**Files:** new `server/orchestrator/staging-approval-consumer.ts` (+ version-completion helper), `server/routes/approvals.ts`, export/replicate `nextId` for bug creation · Test: `tests/staging-approval-consumer.test.ts` + extend approvals route test
- `consumeStagingApproval(question, deps)`: read `epicId`/`version` from question metadata.
  - **approve:** mark this epic's `gate-staging` `reports_index` rows `status='approved'` (or a 'done' equivalent — read the reports repo). Then `checkVersionCompletion(version, repos)`: every `type='epic'` item with that `version` has an approved staging-approval. If complete → enqueue a `phase='preprod-approval'` question (persona '+prime', run_id=null, metadata {version}). (Actual preprod DEPLOY target does not exist yet — enqueue the question only; note the deploy substrate as a follow-up.)
  - **reject:** create a `type='bug'` item via `repos.backlog.create({ id: nextBugId, type:'bug', title:`Staging rejected: <reason>`, parent_id: epicId, body_md:<reason> })`. `nextId(repos,'bug')` is private in `server/routes/backlog.ts` — export it (or a small shared `nextBacklogId`) and reuse.
- Wire into `POST /api/questions/:id/answer` (approvals.ts): after `queue.answer(...)` succeeds, if `answered.phase==='staging-approval'` call `consumeStagingApproval(answered, deps)` (best-effort; the route must still return the answer even if the consumer errors — log it).
- Tests: (consumer unit) approve → reports approved + version-check called/preprod question enqueued when version complete; reject → one bug created `parent_id=epicId`, reports NOT approved. (route) POST answer reject on a staging-approval question → a bug exists.
- typecheck + full suite + commit `feat(orchestrator): consume staging-approval — approve→version-check/preprod, reject→open bug`

---

## STREAM P — Teknik borç (pagination, small increment)

### Task P1: Backlog `total` + `offset` + "showing N of M"
**Files:** `server/routes/backlog.ts`, `src/routes/board.tsx`, `src/routes/dashboard.tsx` · Tests: extend backlog route test
Backend already supports `offset` in the repo `list()` + has `countByStatus`; the route doesn't expose either. Smallest valuable increment (no new pagination UX — filter-first stays):
- Route `GET /api/backlog`: accept `?offset=`, and add `total` to the response (`{ items, total }`). `total` = count of all items matching the same filters (add a `count(filter)` repo method if only `countByStatus` exists — read `backlog.ts`). Keep `clampLimit` but raise cap to ~2000.
- Board/Dashboard: keep the existing full fetch (epic roll-up needs all items) but show "N / M gösteriliyor" using `total` from the response (so the operator sees when the set is truncated). The board already defaults to the active-version filter (`defaultActiveVersion`) — that's the filter-first behavior; verify it stays.
- Tests: `GET /api/backlog?offset=N&limit=M` returns the right slice; response includes `total` = full count.
- typecheck + full suite + commit `feat(backlog): expose total + offset; board shows "N of M" (filter-first pagination)`

---

## Wave plan (sequential subagents — shared git tree)
1. CLI1 → CLI2 (registry/cli, independent)
2. M1 (blocker-clear)
3. M2a (real reports + metadata) → M2b (consumer + route) — M2b depends on M2a's metadata
4. P1 (pagination)
5. Final: full suite + holistic review + docs update.
