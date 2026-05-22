# Changelog

All notable changes to Kortext are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Kortext adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] — 2026-05-22

Kortext v3 is a full rewrite. The v2 line was a markdown methodology framework
driven by Python and Bash scripts; v3 is a TypeScript runtime with a SQLite
state store, a React dashboard, a worker pool with per-task git worktrees, and
a built-in Model Context Protocol (MCP) server.

If you used v2, read the [Migration Guide](./MIGRATION-v2-to-v3.md) before
upgrading — the workspace layout, runtime entrypoints, and command surface all
changed.

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
  worker pool with configurable concurrency (default 3), and short-circuits the
  remainder of the graph on first failure.
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
  resolves the gate with `decision: approve | reject` and the run resumes from
  the same worktree.
- **Persona + workflow content layer** (`server/engine/persona-registry.ts`,
  `server/engine/workflow-loader.ts`). 14 personas and 12 workflows are
  authored as markdown — runtime parses them in-memory. Hot reload on disk
  change.
- **Doctor / consistency checks**. `kortext doctor` validates workflow ↔
  persona references, lock state, and backlog health. Exposed as
  `GET /api/doctor` and an MCP tool.
- **Item lifecycle**. `kortext-item-start`, `kortext-item-transition`, and
  `kortext-backlog-add` ported from v2 Python scripts to TypeScript; every
  status change writes an audit row and a `chore(kortext): <action> <id>`
  commit.
- **React 19 dashboard** (Vite + Tailwind v4 + TanStack Router). Six main
  routes (Dashboard, Board, Memory, Reports, References) plus eight settings
  sub-panes. Bell, toast notifications, terminal panel, and timeline drawer
  are global overlays. Persona Markdown editor is inline (PUT + hot reload).
- **REST API**. `GET /api/runs`, `/api/handovers`, `/api/backlog`,
  `/api/personas` (GET/PUT), `/api/workflows`, `/api/doctor`, `/api/docs/:scope[/:file]`
  with an allow-listed scope (`references | reports | memory | rules |
  workflows`).
- **MCP server**. 15 tools registered through a `createKortextMcpServer(deps)`
  factory. Stdio transport for Claude Code / Cursor; SSE transport mounted on
  the same Express instance under `/mcp/sse` + `/mcp/messages` with per-session
  `McpServer` instances.
- **CLI**. `kortext init | serve | start | approve | status | logs | cleanup |
  doctor | mcp` with `--help` and `--version`. `bin/kortext.js` is a dual-mode
  shim that prefers compiled `dist/bin/kortext.js` and falls back to `tsx` in
  development.
- **CI**. GitHub Actions workflow (`.github/workflows/kortext-ci.yml`) running
  Node 22 lint → typecheck → test → build → compiled CLI smoke on every push
  and PR to `main`, with `cancel-in-progress` concurrency.
- **Migration tool**. `bin/migrate-legacy-backlog.ts` ports `workspace/memory/backlog/*.md`
  items into the v3 `backlog_items` table. Idempotent; supports `--dry-run`.

### Changed

- **Runtime entrypoint**. v2 expected `AGENTS.md` plus a runtime adapter file
  per host CLI. v3 ships a single `kortext` binary; `AGENTS.md` is now a thin
  pointer file generated by `kortext init`.
- **Workspace layout**. v2 stored everything under `workspace/memory/`
  (backlog, context, sessions). v3 keeps human-authored markdown
  (`workspace/references/blueprint.md`, `rules/*.md`, `agents/*.md`,
  `workflows/*.md`) on disk; runtime state moves into SQLite.
- **Locking model**. v2 used a Bash `auto-locker.sh` and a `locks/` directory.
  v3 relies on per-task git worktrees for isolation; the `locks` table remains
  for advisory locks but is rarely needed.
- **Approval flow**. v2 surfaced critical gates as TODO comments in markdown
  context files. v3 has a first-class `pending_questions` table, a REST and
  MCP surface for answering, and a dashboard bell with toast notifications.
- **Audit log**. v2 wrote line-based JSON to disk via `audit-logger.sh`. v3
  writes structured rows to the `audit_log` table; the CLI `kortext logs`
  tail formats them.

### Removed

- **Python scripts under `kortext/scripts/`**. All 13 scripts have been ported
  to TypeScript. The originals stay in `legacy/` as reference until v3.1.
- **Bash hook scripts under `kortext/hooks/`**. Output safety, secret scanning,
  audit logging, and gate enforcement now live in the engine.
- **`PORT` environment variable**. Replaced by `KORTEXT_PORT` to avoid
  collisions with editor / preview tooling that inject `PORT=…`.
- **`workspace/memory/sessions/`**. Session lifecycle moved into the `sessions`
  SQLite table.

### Migration

See [MIGRATION-v2-to-v3.md](./MIGRATION-v2-to-v3.md) for:

- A one-command path from a v2 repo to a v3-compatible layout
- How `bin/migrate-legacy-backlog.ts` translates markdown backlog into SQLite
- The `legacy/` folder policy and when to delete it
- Environment-variable renames (`PORT` → `KORTEXT_PORT`)

### Compatibility

- **Node** ≥ 22.0.0 (was ≥ 14 in v2). `better-sqlite3` ≥ 12 requires the Node
  26 V8 ABI, which is included in Node 22+.
- **TypeScript** ≥ 5.7 for `allowImportingTsExtensions` +
  `rewriteRelativeImportExtensions`.
- **Git** ≥ 2.30 (worktree subcommands).

---

## [2.2.3] — 2026-04 (final v2)

Final release of the markdown + Python + Bash methodology framework.
The v2 line is archived under the `tr-archive` and `en-archive` tags. Future
v2 bug fixes are not planned; see the [Migration Guide](./MIGRATION-v2-to-v3.md)
to move to v3.

For pre-v3 history, see the git log on the `tr-archive` and `en-archive` tags.
