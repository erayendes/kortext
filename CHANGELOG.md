# Changelog

All notable changes to Kortext are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Kortext adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
