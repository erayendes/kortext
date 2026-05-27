# Changelog

All notable changes to Kortext are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Kortext adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Targeting **v3.1.0 — onboarding overhaul + CLI redesign**. Single large release
that bundles Phases 11-13 (already merged on `main`, never published because
`kortext@3.0.0` is broken with an EADDRINUSE silent-fail bug) plus the v3.1 CLI
redesign decided in [development/DECISIONS.md Bölüm 0](development/DECISIONS.md).
Implementation queue: [development/TODO.md](development/TODO.md).

### Added

- **`.kortext/` encapsulation** (Faz 12.1). All framework files live under
  `.kortext/` (`.git/`-style), keeping the project root clean — only
  `AGENTS.md`, `.env*`, `.gitignore` remain at the top level.
- **Global runtime** (Faz 12.2). `agents/`, `workflows/`, `rules/` are now read
  directly from the installed `node_modules/kortext/` package, no longer copied
  per project. `kortext init` only seeds `templates/` content. Package upgrade
  automatically propagates updated personas/workflows.
- **`templates/` package** (Faz 12.3). 38 skeleton files seeded by `init`:
  `AGENTS.md`, `.env.example`, `.gitignore`, `foundation/{BRD,PRD,TRD,PFD}.md`,
  `backlogs/{B,D,E,H,S,T}XX-*.md` (6 templates), `memory/{handover,decisions,
  learned}.md`, `references/` (13 ALL-CAPS files), `reports/` (8 scope
  templates).
- **`.kortext/foundation/` category** (Faz 13). New directory for analysis
  phase's frozen outputs: `BRD.md` (Business Requirements / blueprint),
  `PRD.md` (Product Requirements), `TRD.md` (Technical Requirements), and
  `PFD.md` (Product Foundation — consolidated analysis report). Separate from
  `references/` (canonical, lived-with) and `reports/` (per-run records).
- **ALL-CAPS references rename** (Faz 13). 13 reference files now use the
  canonical-source signal pattern: `ACCESS.md`, `API.md`, `CONTENT.md`,
  `DATABASE.md`, `DESIGN.md`, `ENVIRONMENT.md`, `GLOSSARY.md`, `GROWTH.md`,
  `LEGAL.md`, `SECURITY.md`, `STACK.md`, `STRUCTURE.md`, `TEST.md`. ALL-CAPS
  matches AGENTS.md / README.md / LICENSE convention.
- **Per-file reports + `reports_index`** (Faz 12.5). Monolithic
  `test-reports.md`, `delivery-reports.md`, etc. split into per-file
  `<scope>_<slug>_<YYYY-MM-DD-HHMM>.md`. SQL table `reports_index`
  (`id, scope, slug, file_path, author, status, tags, related_item,
  created_at`) backs filter/sort/search. `outputIndexer` automatically
  populates the index on every successful step.
- **Output placeholder syntax** (Faz 13). Workflow body can declare
  `outputs: .kortext/reports/test-reports_<slug>_<ts>.md`;
  `server/engine/output-resolver.ts` resolves `<slug>` → `[a-z0-9][a-z0-9-]*`
  and `<ts>` → `\d{4}-\d{2}-\d{2}-\d{4}` at runtime. 4 CLI executors and
  worker-pool safety guards wire through the resolver.
- **Workflow/persona SQL index** (Faz 12.8). New tables `workflow_steps`
  (with `step_index, phase, persona_handle, approver, parallel_with_json`)
  and `personas` (with `handle, source_path, body_md`). Markdown remains the
  source of truth; engine boot parses and upserts. Parse-time FK validation:
  unknown `+ajan` reference is a fatal throw. `+prime` synthetic row added
  at boot (no `agents/prime.md` file).
- **Handover rotation + TOC engine** (Faz 12.6). `handover.md` rotates at 5
  entries or 30 KB threshold; previous content moves to
  `handover-<YYYY-MM-DD-HHMM>.md` in the same directory. TOC engine
  (`markdown-sync.writeDecision/writeLearned` → `toc-updater.updateToc()`)
  maintains `## İçindekiler` sections atomically. `kortext archive handover`
  CLI for manual trigger.
- **Prompt cache discipline** (Faz 12.7). `claude-cli-executor.ts` sends the
  persona body via `--append-system-prompt` (stable prefix) and per-step
  runtime data (runId, stepId, timestamp) via user message. Net effect:
  ~90% input-token reduction on cache hits.
  `--exclude-dynamic-system-prompt-sections` skips the user's global
  `~/.claude/settings.json` dynamic prompt.
- **Onboarding wizard** (Faz 11). Single-page form in the dashboard: project
  name, project code (slug A-Z0-9, 2-6), project type (new/existing), target
  platform chips, blueprint markdown dropzone (≤100KB), GitHub repo
  (optional), executor selection (Mock/Claude/AGY + binary path). Submit
  posts to `/api/blueprint` → writes `.kortext/foundation/BRD.md` +
  `.kortext/project.json` → triggers the workflow chain.
- **Backlog UI + readonly editors** (Faz 12.9). Board screen with 6 status
  columns (Epic / To Do / In Progress / Test / Review / Done) and
  `+ New Item` modal. Settings panes (Agents/Rules/Workflows) render markdown
  read-only (writable editor deferred to v3.2).
- **`kortext archive` subcommand** (Faz 12.6). Manual handover rotation
  trigger; complements the automatic rotation in the maintenance cycle.
- **Per-step output safety wiring** (Faz 13). `outputIndexer` callback slot
  in `SafetyGuards` keeps the engine-adapter boundary clean: worker-pool
  doesn't import the reports indexer directly; `server/index.ts` boot wires
  the optional callback.

### Changed

- **Workflow gate detection** (Faz 13). Replaced `> [!NOTE] RAPOR HAZIR`
  callout-based gates with approver-based detection. Parser now reads
  `step.approver === '+prime'` from the step's sub-bullets and auto-generates
  the gate in `flushStep()`. Callout blocks are consumed and ignored
  (backward-compat shim) but no longer produce gates. Result: single signal
  source (sub-bullet only), less prompt-token noise, callout-cosmetic-vs-gate
  ambiguity resolved.
- **`docs/` → `development/` rename** (Faz 13). Internal docs folder renamed
  to reflect "developer-side documentation" intent. 22 old files consolidated
  into 6 canonical docs + `concepts/`: `ARCHITECTURE.md`, `DECISIONS.md`,
  `DESIGN.md`, `HANDOVER.md`, `TODO.md`, `UAT-GUIDE.md`. `development/` is
  codebase-only — excluded from the npm package via `.npmignore`.
- **Frontmatter standards** (v3.1 spec §5). 4 separate frontmatter standards
  by file nature: References (`status, author, reviewer, approver`), Reports
  (`status, author, reviewer, updated_at`), Handover (entry-level frontmatter
  per `## Handover: <id>` block), ADR + Learned (section-level header + TOC
  auto-update).
- **`reviewer:` workflow lines removed** (Faz 13). 2 pre-existing `reviewer:
  +X` lines (design-system, api-reference) were passive metadata — engine
  doesn't run reviewers at runtime. Removed to clear noise. Agent-to-agent
  review pattern deferred to v3.2.
- **`approver:` discipline tightened** (Faz 13). Gate-producing files
  (blueprint, LEGAL, GROWTH, PRD, CONTENT, STACK, DESIGN, PFD, etc.) keep
  `approver: +prime`. Metadata-only files (SECURITY, DATABASE, API, TRD,
  TEST) had `approver:` removed entirely — engineering-manager records them
  without a `+prime` gate.

### Removed

- **`skills/` category** (Faz 11.4). Persona body's `capabilities` field
  covers the same ground — removed `templates/skills/` and
  `required-skills.md`.
- **v2 Python+Bash migration script** (Faz 11.4). `bin/migrate-legacy-backlog.ts`
  removed — no v2 users to migrate.
- **`> [!INFO]` callouts** (Faz 11.4). Unified to single YAML frontmatter
  standard. Duplicate metadata signal eliminated.
- **`> [!NOTE] RAPOR HAZIR` callouts** (Faz 13). Replaced by approver-based
  gate detection. Backward-compat shim consumes these blocks silently.
- **Repo-root `/AGENTS.md`** (Faz 13). Was stale with v3.0 paths. Removed —
  `templates/AGENTS.md` is the canonical version (gets copied to project
  root at `init` time).
- **`HANDOVER-v3.md` from npm package** (Faz 13). Now lives at
  `development/HANDOVER.md` and is excluded from publish (`.npmignore`).
- **Repo-root `/.env.example`** (Faz 13). Duplicate + stale path. Removed —
  `templates/.env.example` is canonical.

### Known issues (carried from 3.0.0)

- **`app.listen()` EADDRINUSE silent fail** (HANDOVER #51). When port 3200
  is in use, Express silently skips the listening callback and exits.
  `kortext serve` shows no error and "Cannot GET /" appears in the browser.
  v3.0.1 debt — must be fixed before v3.1.0 publish. Workaround:
  `lsof -ti:3200 | xargs kill` before running `serve`.

### Deferred to v3.2+ (intentional)

- Light theme variant
- Mobile responsive (currently 1280px+ optimized)
- A11y aria attributes (focus states exist; aria missing)
- i18n implementation (Settings has selection but it's static)
- LocalStorage persistence
- ⌘K command palette (currently disabled, "soon" badge)
- Reviewer-as-step runtime (agent-to-agent review pattern)
- Settings/Agents/Workflows/Rules write editor (currently read-only)
- `learned.md` topical split (single file for now; v3.2 splits at 50KB+)

---

## [3.0.0] — 2026-05-22

First public release of Kortext: a TypeScript runtime that lets AI agent teams
(Claude Code, Codex, Gemini CLI) run software projects autonomously. SQLite
state store, React dashboard, per-task git worktrees, and a built-in Model
Context Protocol server.

### Added

- **TypeScript runtime** (Node 22+). Single package, ESM, `better-sqlite3`,
  Express 5, Zod, Vitest. Strict mode across the board.
- **SQLite state store** (`server/db/`). 13 tables — `backlog_items`,
  `contexts`, `locks`, `handovers`, `sessions`, `decisions_index`,
  `pending_questions`, `audit_log`, `runs`, `run_steps`, `runtime_artifacts`,
  `notifications_sent`, `secrets_scan_results`. Migrations live in
  `server/db/migrations/*.sql` and are copied into `dist/` at build time.
- **Pipeline engine** (`server/engine/`). Parses `workflows/*.md` into a typed
  DAG, performs Kahn-style cycle detection, runs steps through a pull-ready
  worker pool with configurable concurrency (default 3), and short-circuits
  the remainder of the graph on first failure.
- **Per-task git worktrees** (`server/engine/worktree.ts`). Every run gets its
  own `.kortext/worktrees/run-<id>` branch namespaced as `kortext/run-<id>`.
  Successes can be merged and the worktree removed; failures are moved to a
  timestamped quarantine directory and the branch is preserved for postmortem.
- **CLI executors for Claude Code, Codex, and Gemini**
  (`server/engine/executors/`). Each has its own file (no shared abstract
  base); all spawn shell-free, pipe the persona prompt via stdin, and write
  per-step logs with declared `outputs:` verification.
- **Output safety**. `server/safety/secret-scanner.ts` runs on every successful
  step's declared outputs and log; findings flip the step to `failed`.
  `harmful-output-filter.ts` ships as a configurable placeholder for v3.1+.
- **Autonomous orchestrator** (`server/orchestrator/`). Pipeline chaining via
  `nextWorkflowId`, blueprint watcher (`status: approved` → trigger),
  multi-channel notification dispatcher (Slack + Telegram, deduped), and an
  approval queue surfaced to the dashboard.
- **Mid-run gate pause/resume**. Workers stop at workflow gates; the queue
  resolves the gate with `decision: approve | reject` and the run resumes
  from the same worktree.
- **Persona + workflow content layer** (`server/engine/persona-registry.ts`,
  `server/engine/workflow-loader.ts`). 14 personas and 12 workflows are
  authored as markdown — runtime parses them in-memory. Hot reload on disk
  change.
- **Doctor / consistency checks**. `kortext doctor` validates workflow ↔
  persona references, lock state, and backlog health. Exposed as
  `GET /api/doctor` and an MCP tool.
- **Item lifecycle**. `kortext-item-start`, `kortext-item-transition`, and
  `kortext-backlog-add` as TypeScript commands; every status change writes
  an audit row and a `chore(kortext): <action> <id>` commit.
- **React 19 dashboard** (Vite + Tailwind v4 + TanStack Router). Six main
  routes (Dashboard, Board, Memory, Reports, References) plus eight settings
  sub-panes. Bell, toast notifications, terminal panel, and timeline drawer
  are global overlays. Persona Markdown editor is inline (PUT + hot reload).
- **REST API**. `GET /api/runs`, `/api/handovers`, `/api/backlog`,
  `/api/personas` (GET/PUT), `/api/workflows`, `/api/doctor`,
  `/api/docs/:scope[/:file]` with an allow-listed scope
  (`references | reports | memory | rules | workflows`).
- **MCP server**. 16 tools registered through a `createKortextMcpServer(deps)`
  factory. Stdio transport for Claude Code / Cursor; SSE transport mounted on
  the same Express instance under `/mcp/sse` + `/mcp/messages` with
  per-session `McpServer` instances.
- **CLI**. `kortext init | serve | start | approve | status | logs | cleanup |
  doctor | mcp` with `--help` and `--version`. `bin/kortext.js` is a dual-mode
  shim that prefers compiled `dist/bin/kortext.js` and falls back to `tsx` in
  development.
- **CI**. GitHub Actions workflow (`.github/workflows/kortext-ci.yml`) running
  Node 22 lint → typecheck → test → build → compiled CLI smoke on every push
  and PR to `main`, with `cancel-in-progress` concurrency.

### Compatibility

- **Node** ≥ 22.0.0. `better-sqlite3` ≥ 12 requires the Node 26 V8 ABI, which
  is included in Node 22+.
- **TypeScript** ≥ 5.7 for `allowImportingTsExtensions` +
  `rewriteRelativeImportExtensions`.
- **Git** ≥ 2.30 (worktree subcommands).
