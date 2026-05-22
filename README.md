# Kortext

**Autonomous AI agent runtime — TypeScript + SQLite + React + MCP**

[![CI](https://github.com/erayendes/kortext/actions/workflows/kortext-ci.yml/badge.svg)](https://github.com/erayendes/kortext/actions/workflows/kortext-ci.yml)
[![npm](https://img.shields.io/npm/v/kortext.svg)](https://www.npmjs.com/package/kortext)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Kortext lets AI agent teams (Claude Code, Codex, Gemini CLI) run software
projects autonomously. You write a blueprint and approve the gates that
matter; the agents pick up tasks, write code, run tests, hand off between
each other, and ship — with a real-time dashboard showing what they're
doing.

> **Migrating from v2?** Start with the [Migration Guide](./MIGRATION-v2-to-v3.md).

---

## What v3 gives you

- **A TypeScript runtime**. Single `kortext` binary. Express 5 backend, React
  19 + Tailwind v4 dashboard, `better-sqlite3` state store.
- **A worker pool with per-task git worktrees**. Every task runs in its own
  `.kortext/worktrees/run-<id>` branch. Failures get quarantined for
  postmortem; successes can be merged.
- **A blueprint-driven pipeline**. Flip `status: draft` → `status: approved`
  in `workspace/references/blueprint.md` and the analysis → planning →
  development → testing chain starts on its own.
- **First-class approvals**. Critical gates queue into `pending_questions`;
  the dashboard rings a bell, a toast pops, Slack / Telegram fires. Answer
  from the UI, the CLI, or an MCP client.
- **An MCP server**. 15 tools over stdio (for Claude Code / Cursor) and SSE
  (for the dashboard or remote clients).
- **263 tests**, GitHub Actions CI on every push and PR.

---

## Quick start

Requires **Node ≥ 22** and **Git ≥ 2.30**.

```bash
# Install
npm install -g kortext

# Scaffold a v3 project (idempotent — safe to re-run)
mkdir my-product && cd my-product
kortext init

# Edit the blueprint
$EDITOR workspace/references/blueprint.md
# (set `status: approved` in the YAML frontmatter when ready)

# Start the runtime (backend + dashboard)
kortext serve
# → backend: http://localhost:3200
# → dashboard: http://localhost:5173
```

When the blueprint flips to `approved`, the orchestrator triggers the
analysis workflow automatically. Watch the dashboard, answer any approval
prompts that surface in the bell menu, and the rest runs on its own.

---

## CLI surface

```
kortext init [--force]                  scaffold .kortext/, agents/, workflows/, rules/, workspace/
kortext serve [--mode=auto|dev|prod]    backend + dashboard
kortext start <workflow-id> [--executor=mock|claude|codex|gemini]
kortext approve <run-id> [answer]       respond to a pending question
kortext status                          recent runs + open questions
kortext logs [--limit=N] [--actor=…] [--action=…]
kortext cleanup [--quarantine-older-than=Nd] [--branches] [--dry-run]
kortext doctor                          workflow / persona / lock consistency
kortext mcp                             stdio MCP server (for Claude Code / Cursor)
kortext --help | --version
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  React Dashboard (Vite + TanStack Router + Tailwind v4)              │
│  Dashboard · Board · Memory · Reports · References · Settings        │
└────────────────────┬─────────────────────────────────────────────────┘
                     │  HTTP / WebSocket
┌────────────────────▼─────────────────────────────────────────────────┐
│  Express 5 backend                                                    │
│  /api/runs · /api/handovers · /api/backlog · /api/personas (GET/PUT)  │
│  /api/workflows · /api/doctor · /api/docs/:scope · /api/questions     │
│  /mcp/sse · /mcp/messages         ┌──────────────────────────┐        │
└─────────────────┬─────────────────┤  MCP server (15 tools)   │        │
                  │                 │  stdio · SSE             │        │
                  │                 └──────────────────────────┘        │
┌─────────────────▼─────────────────────────────────────────────────────┐
│  Orchestrator                                                          │
│  Blueprint watcher · Pipeline chainer · Approval queue · Dispatcher    │
└─────────────────┬──────────────────────────────────────────────────────┘
                  │
┌─────────────────▼─────────────────────────────────────────────────────┐
│  Pipeline engine                                                       │
│  Workflow parser · DAG builder · Worker pool · Gate enforcer · Safety  │
└──────┬─────────────────────────────────────────────────────┬───────────┘
       │                                                     │
┌──────▼──────────────────────┐               ┌──────────────▼──────────┐
│  Per-run git worktrees      │               │  SQLite state           │
│  .kortext/worktrees/run-<id>│               │  .kortext/kortext.db    │
│  branch kortext/run-<id>    │               │  13 tables · WAL mode   │
└──────┬──────────────────────┘               └─────────────────────────┘
       │
┌──────▼─────────────────────────────────────────────────────────────────┐
│  CLI executors                                                          │
│  Claude Code · Codex · Gemini CLI (shell-free spawn, stdin prompts)     │
└─────────────────────────────────────────────────────────────────────────┘
```

See [docs/architecture.md](./docs/architecture.md) for the long form (SQLite
schema, DAG semantics, worker-pool concurrency rules).

---

## Project layout

```
your-project/
├── AGENTS.md                       # AI runtime pointer (generated)
├── .kortext/
│   ├── kortext.db                  # SQLite state
│   └── worktrees/                  # per-run git worktrees
├── workspace/
│   └── references/
│       └── blueprint.md            # ← you fill this in
├── agents/                         # 14 persona markdowns
├── workflows/                      # 12 workflow markdowns
└── rules/                          # behavior, branching, commands, emergency, models
```

Personas, workflows, and rules are **markdown** — edit them in any editor or
in the dashboard. SQLite holds the runtime state (runs, backlog, audit log,
approvals).

---

## Integrations

### Claude Code

```bash
claude mcp add kortext -- npx kortext mcp
```

Once added, Claude Code can call `start_pipeline`, `list_pending_questions`,
`approve_blueprint`, and 12 other tools directly.

### Slack / Telegram

Set `SLACK_WEBHOOK_URL` and / or `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` in
your environment. The dispatcher dedupes notifications and posts on:

- Blueprint approval
- Pipeline start / completion
- Step failure
- Pending question waiting for `+prime`

---

## Documentation

- [User Guide](./USER-GUIDE.md) — full walkthrough of the autonomous flow
- [Architecture](./docs/architecture.md) — schema, engine, MCP, dashboard
- [Migration Guide](./MIGRATION-v2-to-v3.md) — v2 → v3 upgrade
- [Changelog](./CHANGELOG.md) — release notes
- [Roadmap](./ROADMAP-v3.md) — phases 0–10

---

## Requirements

- Node ≥ 22.0.0
- Git ≥ 2.30 (worktree subcommands)
- One of: Claude Code, Codex, or Gemini CLI installed and on `$PATH`
  (or use `--executor=mock` for dry runs)

---

## License

MIT © Eray Endes
