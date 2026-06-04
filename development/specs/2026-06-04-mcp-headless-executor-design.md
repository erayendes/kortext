# Design — Wire Kortext MCP tools into the headless executors

> ## ⚠️ SUPERSEDED by the file-ingestion bridge (2026-06-04, after live UAT)
>
> The MCP approach below was implemented (Tasks 1–4) and **live-tested** with
> executor=claude. Result: **it does not work as-is.** The headless system
> prompt forces agents to deliver work via the **Write tool (files)**; the
> planning agent wrote all 47 backlog items to a file (`backlog-items-defined`)
> instead of calling `add_backlog_item` — so the DB stayed empty even with the
> MCP server wired in. Making MCP work would require rewriting the core headless
> contract + every persona + signal-output handling (large, against-the-grain).
>
> **Decision (Eray):** pivot to the **file-ingestion bridge** — the agent
> already emits a clean, structured backlog file; add a parser + ingester that
> turns it into real backlog rows. The MCP-wiring commits were reverted (the
> `busy_timeout` pragma was kept). See **`2026-06-04-backlog-ingest-bridge.md`**
> for the live design + plan. The text below is retained for the record only.

**Date:** 2026-06-04
**Status:** SUPERSEDED (see banner) — MCP wiring reverted; file-ingestion bridge adopted
**Author:** Claude (code side) with Eray
**Related:** [HANDOVER.md](../HANDOVER.md), [ARCHITECTURE.md](../ARCHITECTURE.md); discovered during the 2026-06-04 live UAT (HydroFlow, executor=claude)

## Problem

During the 2026-06-04 live UAT (real BRD → HydroFlow project, executor=claude), the
`new-project-analysis` pipeline ran end-to-end and produced the full foundation
(BRD/PRD/TRD/PFD) + 9 reference docs — but the **backlog stayed empty**, so the
Board had nothing for agents to build.

Root cause (confirmed at code level, not just observed):

1. `new-project-analysis` only writes **files** (via the agent's Write tool). The
   step that creates the backlog lives in the next workflow, `planning-pipeline`
   (`add_backlog_item` / `update_backlog_item` MCP tools).
2. The onboarding trigger (`startCommand`) ran a single workflow and did **not**
   follow `nextWorkflowId`, so `planning-pipeline` never started.
   *(Fixed separately this session — `chainThroughWorkflowId: 'planning-pipeline'`
   bounds the auto-chain to the setup phase. See cli-commands.ts.)*
3. **Even with chaining, the backlog can't be created**: the headless CLI
   executors (`ClaudeCliExecutor` et al.) spawn `<cli> --print …` with **no MCP
   configuration**. So pipeline agents have Claude's built-in tools (Write/Read/
   Bash) but **not** the Kortext MCP tools. There is no code path from a headless
   workflow agent to `repos.backlog.create`. The only ways to populate the
   backlog today are the dashboard "New item" UI or an external human-driven
   Claude session connected to `kortext mcp`.

This breaks the core autonomous loop **BRD → backlog → build** at the
"→ backlog" step.

## Goal & success criterion

Pipeline agents across **all four engines** (Claude, Codex, Gemini, Antigravity)
can call the Kortext MCP tools (`add_backlog_item`, `update_backlog_item`,
`transition_item`, `list_backlog`, and the rest of the existing toolset —
**general access**, per decision).

**Success:** With executor=claude, after onboarding the analysis→planning chain
runs and **real backlog items appear on the Board**. All MCP writes land in the
**main project DB** (`.kortext/data/kortext.db`), never the agent's worktree.

## Decisions (locked)

- **Scope:** general MCP access (all pipeline steps, full existing toolset) — not
  backlog-only.
- **Engines:** all four (Claude, Codex, Gemini, Antigravity).
- **Approach:** **A — stdio MCP per agent.** Each agent invocation registers a
  `kortext mcp` stdio server. Chosen over a shared SSE/HTTP server (extra
  always-on process, uneven cross-CLI SSE support) and over a file-ingestion
  bridge (contradicts "general access").

## Architecture

```
runWorkflow → <Cli>Executor.execute(step)
                 │  builds spawn args
                 ▼
        buildMcpServerConfig(projectRoot)   ← new: server/engine/executors/mcp-config.ts
                 │  returns { command, args, env: { KORTEXT_DB_PATH: <abs main db> }, allowedToolPattern }
                 ▼
        per-CLI injection (claude: --mcp-config + --allowedTools; codex/gemini/antigravity: own flag)
                 ▼
        spawnCli(<cli> --print … --mcp-config …)
                 │  agent calls mcp__kortext__add_backlog_item, …
                 ▼
        kortext mcp (stdio subprocess)  →  getDb() honors KORTEXT_DB_PATH  →  MAIN .kortext DB
```

### New component — `server/engine/executors/mcp-config.ts`
A single, pure helper that builds the MCP server registration for an agent run.
One clear purpose, testable in isolation:

- Input: the **project root** (the daemon's cwd, i.e. the real project — NOT the
  worktree) and the executor kind.
- Output: a normalized descriptor `{ command, args, env, allowedToolPattern }`:
  - `command`/`args`: invoke the packaged CLI's MCP server, e.g.
    `node <packageRoot>/bin/kortext.js mcp` (resolve `packageRoot` via the
    existing `packageRoot('kortext')` helper so it works installed or in source).
  - `env: { KORTEXT_DB_PATH: <absolute path to main .kortext/data/kortext.db> }`
    — **the critical bit**: agents run with `cwd=worktree`, so the MCP server
    must be told the absolute main-DB path or it would write to the worktree.
  - `allowedToolPattern`: `mcp__kortext__*` (or the per-CLI equivalent), so the
    tools are auto-permitted alongside `--dangerously-skip-permissions`.

### Per-CLI injection
Each executor maps the descriptor to its CLI's flags:
- **Claude:** `--mcp-config <inline-json-or-file>` + `--allowedTools "mcp__kortext__*"`.
- **Codex / Gemini / Antigravity:** each has its own stdio-MCP registration
  (a temp config file and/or a flag). **Exact current syntax for each CLI is
  verified against that CLI's up-to-date docs at implementation time**
  (context7 / official docs) — this is an explicit implementation task, one per
  engine, each with its own snapshot test.

Shared spawning (`cli-spawn.ts`) is unchanged; only each executor's arg list and
(if a temp config file is used) a cleanup step are added.

### DB targeting + concurrency
- MCP server env carries the **absolute** `KORTEXT_DB_PATH` → main project DB.
- WAL is already enabled (`journal_mode = WAL`). Add a `busy_timeout` pragma
  (e.g. 5000 ms) in `openDb` so concurrent writers (≤3 agent MCP subprocesses at
  worker-pool concurrency 3, plus the backend) retry instead of erroring
  `SQLITE_BUSY`.

## Data flow (happy path)
1. Onboarding triggers `new-project-analysis` (executor=claude), which chains to
   `planning-pipeline` (existing chaining fix).
2. A `planning-pipeline` step runs `+engineering-manager`; the agent calls
   `mcp__kortext__add_backlog_item` via its registered stdio MCP server.
3. The `kortext mcp` subprocess (env-targeted at the main DB) runs
   `repos.backlog.create(...)` + audit log.
4. Subsequent steps (`+qa-engineer` acceptance criteria, `+security-engineer`
   gates, …) call `update_backlog_item` the same way.
5. Run succeeds; the Board shows the derived backlog.

## Error handling
- **MCP server fails to start / wrong DB:** the agent's tool call errors; the
  step fails with that message (existing per-step failure path). Surfaced in the
  run row + audit log + dashboard. No silent empty backlog.
- **SQLITE_BUSY under concurrency:** mitigated by `busy_timeout`; if still hit,
  the tool call errors → step fails (visible), not corrupt.
- **Temp config files (Codex/Gemini/Antigravity):** written per run-step under
  `.kortext/data/` and cleaned up in a `finally`; failure to clean is swallowed
  (best-effort, mirrors existing log handling).

## Security
- Agents already run with `--dangerously-skip-permissions`; they now also hold
  **DB-mutation MCP tools**. Blast radius is **only the Kortext project DB**
  (backlog/refs/runs) — not arbitrary system access; the MCP server exposes a
  fixed, audited toolset.
- Existing safety stays: secret-scanner + harmful-filter run on each step's
  outputs/log; workflow gates (`approver: +prime`, `review_gates`) remain the
  human checkpoints; the autonomous **drive/build** phase stays locked behind
  `KORTEXT_DRIVE_ENABLED` (out of scope here).
- Every MCP mutation is written to `audit_log` (already implemented in
  `mcp/server.ts`).

## Testing
- **Unit:** `buildMcpServerConfig` produces the correct command/args/env
  (absolute DB path) and the correct per-CLI flags — one snapshot test per
  engine (4).
- **Unit:** `openDb` sets `busy_timeout`.
- **Integration:** a `planning-pipeline`-shaped run with a stub/real MCP results
  in `repos.backlog.create` being called and items appearing via
  `GET /api/backlog`.
- **Live acceptance (UAT):** executor=claude, onboarding HydroFlow → Board shows
  the derived backlog. Run in the UAT sandbox, never the kortext repo.

## Out of scope
- The drive/build phase (stays locked).
- Adding new MCP tools.
- SSE/HTTP MCP transport.
- Least-privilege per-step tool scoping (general access chosen; can tighten
  later).

## Open implementation tasks (carried into the plan)
1. Verify current stdio-MCP registration syntax for **each** CLI (Claude, Codex,
   Gemini, Antigravity) against up-to-date docs.
2. Confirm the packaged-CLI invocation path for the MCP server works both
   installed (`node_modules/.bin`) and in source (`bin/kortext.js`).
3. Decide inline-JSON vs temp-file for each CLI's MCP config (per CLI support).
