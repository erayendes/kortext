# Design + Plan — Backlog file-ingestion bridge

**Date:** 2026-06-04 · **Status:** Approved (Eray chose "dosya köprüsü") · supersedes the MCP approach in `2026-06-04-mcp-headless-executor-design.md`.

## Why
Live UAT proved headless agents deliver work as **files** (the Write-tool contract), not MCP calls. The planning agent already writes a complete, structured backlog (47 items with type/priority/description/acceptance_criteria/review_gates/blocks/blocked_by). So: define a strict backlog file, parse it, and create real backlog rows from it. Works *with* the file-based grain. Low blast radius.

## Approach
1. The `planning-pipeline` step that defines the backlog writes a **single YAML file** at a fixed path with a strict schema (replaces the `add_backlog_item` MCP instruction).
2. A pure parser turns that YAML into validated item payloads.
3. An ingester creates rows via `repos.backlog.create` — **idempotent** (skip ids that already exist), validating + **reporting** anything skipped (never silently lost).
4. A post-step hook in the engine runs the ingester when the backlog file is produced.

## Canonical file: `.kortext/foundation/backlog.yaml`
```yaml
items:
  - id: INFRA-001            # unique, stable
    type: task               # task|bug|debt|epic|spike|hotfix
    title: "..."
    priority: P0             # free-form (P0..P3); stored in frontmatter
    description: "..."
    acceptance_criteria: ["...", "..."]   # stored in frontmatter
    review_gates: [code_review]            # subset of: code_review, quality_control, security_control, design_review, uat
    blocks: [INFRA-002]                    # stored in frontmatter
    blocked_by: []                         # stored in frontmatter
```

## Field mapping → `BacklogItemInsert`
- `id`→id, `type`→type (validate against enum; invalid → skip+report), `title`→title, `status`='to_do'.
- `review_gates`→review_gates (drop any value not in the Gate enum; report dropped).
- `description`→`body_md`.
- `priority`, `acceptance_criteria`, `blocks`, `blocked_by`→`frontmatter` (preserve for the board/gates UI which already reads frontmatter).
- `owner`/`parent_id`/`version`→null (set by later steps; out of scope v1).

## Components / files
- Create `server/engine/backlog-ingest.ts`:
  - `parseBacklogYaml(text: string): { items: ParsedBacklogItem[]; errors: string[] }` — pure; uses `js-yaml`.
  - `ingestBacklogItems(repos, parsed): { created: string[]; skipped: { id: string; reason: string }[] }` — idempotent; audit-logs each create.
  - `ingestBacklogFile(repos, absolutePath): result` — read file, parse, ingest, log summary.
- Modify `server/engine/worker-pool.ts`: add `backlogIngester?: (input:{absolutePath;step;runId}) => void` to `SafetyGuards`; call it in the post-step block for each output file (best-effort, but it logs/audits results so nothing is silent).
- Modify `server/index.ts`: wire `backlogIngester` into `safetyGuards`, calling `ingestBacklogFile(repos, absolutePath)` only when `basename(absolutePath) === 'backlog.yaml'`.
- Modify `workflows/planning-pipeline.md`: step 1 (+engineering-manager) — replace "`add_backlog_item` MCP tool" with "write `.kortext/foundation/backlog.yaml` as a single YAML doc with an `items:` list per the schema above"; set `outputs: .kortext/foundation/backlog.yaml`. (Later steps that refine gates remain, but step 1 is the authoritative producer for v1.)

## Tasks (TDD)
- **B1 — parser+ingester** (`backlog-ingest.ts` + `tests/backlog-ingest.test.ts`): parse valid YAML → items; bad type skipped+reported; invalid gates dropped+reported; ingest creates rows; **idempotent** (second run creates 0, skips existing); priority/acceptance/deps land in frontmatter; review_gates first-class.
- **B2 — engine hook** (`worker-pool.ts` SafetyGuards.backlogIngester + `server/index.ts` wiring): post-step, on `backlog.yaml`, ingest. Test: a SafetyGuards with a stub ingester is invoked for the matching output file.
- **B3 — workflow update** (`planning-pipeline.md`): step 1 writes `.kortext/foundation/backlog.yaml` with the schema; output path updated. (Doc change; verify the file still parses via the workflow loader test if one exists.)
- **B4 — LIVE UAT acceptance:** run planning (executor=claude) in the UAT sandbox → `GET /api/backlog` returns >0 items with acceptance_criteria + gates; Board shows them. Sandbox only.

## Risks / mitigations
- **Format drift:** the agent may deviate from the schema. Mitigation: strict parse + per-item validation; `ingest*` returns/logs `skipped` with reasons; a summary audit entry records created vs skipped so an empty/partial backlog is visible, never silent.
- **Double-ingest on re-run:** idempotent by id (skip existing).
- **Later refinement steps** (qa acceptance/security gates) still write their own files; v1 ignores them because step 1 already emits gates+acceptance. Future: ingest updates by id.
