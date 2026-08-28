# Kortext

**The project brain for AI-driven development.** Kortext turns a brief into an
approved analysis foundation — then your own coding agent (Claude Code, Codex,
Gemini CLI…) does the work. Kortext never launches agents, never calls an LLM,
never holds an API key. It defines the process, watches the documents, queues
your requests, and shows you reports.

[![npm](https://img.shields.io/npm/v/kortext.svg)](https://www.npmjs.com/package/kortext)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

## How it works

1. **Brief.** Add a project in the panel — Kortext scaffolds `.kortext/` into
   the repo with a BRD (the brief), document skeletons, workflows, personas,
   and an `AGENTS.md` contract at the root. You fill the brief and approve it.
2. **Analysis.** Copy the one-liner from the Connect tab into your agent.
   The agent follows the contract: it writes each analysis document
   (PRD, STACK, SECURITY, API, DESIGN, …) in dependency order — a document
   whose inputs you haven't approved is never written. Every document lands
   as `draft`; you approve, annotate, or request revisions from the panel.
3. **Plan — only if you ask.** By default there are no tasks. Hit
   "Kopeng'e aktar" and the agent produces `backlog.yaml` (a frozen,
   machine-readable export contract) and a consolidated `TODO.md` you approve.
4. **Track.** Your agent develops from `TODO.md` (or from
   [kopeng](https://github.com/erayendes/kopeng), the kanban companion that
   consumes the same backlog format). Kortext stays the brain: documents and
   reports. Reports are user-triggered — a deterministic change report, plus
   risk and decision summaries written by your agent on request.

## Quick start

Requires **Node ≥ 22**.

```sh
npm install -g kortext
kortext
```

The server starts on port **4200** (`--port` to change) and opens the panel. Data lives in one global SQLite database at
`~/.kortext/kortext.db` (`--db` to override) — one database, multiple projects.

Connect your agent (once per machine):

```sh
claude mcp add --transport http kortext http://localhost:4200/mcp
```

Then, per project, paste the command the Connect tab gives you:

```sh
cd /path/to/project && claude "Read AGENTS.md and start the analysis."
```

## Concepts

- **Passive by design.** Kortext is a mirror and a queue, not an orchestrator.
  The agent reads state from files, you approve from the panel, and the two
  meet in the repo.
- **Files are the source of truth.** Documents live in the project repo under
  `.kortext/` with a `status` frontmatter (`uninitialized → draft → approved`).
  The panel and the agent read the same files; delete the Kortext registry and
  your project loses nothing.
- **Dependency-gated analysis.** Workflow steps declare `inputs`/`outputs`/
  `approver`; a document is written only after everything it builds on is
  approved by you.
- **Requests queue.** Revision notes, report asks, and the planning trigger
  wait in a queue the agent drains over MCP (`get_pending_requests` /
  `complete_request`) at the start of every step.
- **Tasks are opt-in.** Planning runs only when you ask for the Kopeng
  transfer. The `backlog.yaml` schema (versions → epics → tasks,
  `assignee: ai | prime`, `blocked_by`) is frozen so external tools — kopeng
  first — can consume it.

## Panel

- **Documents** — the analysis map with live statuses; open a document to
  read, annotate a line, request a revision, edit directly, or approve.
- **Plan** — the opt-in transfer: queue planning, then review and approve
  `TODO.md`.
- **Reports** — Change (instant, deterministic), Risk & Recommendations and
  Decision Summary (written by your agent on request), Progress (arrives with
  the live Kopeng integration).
- **Connect** — copy-paste commands for your agent and the pending-request
  queue.

## Development

```sh
npm install && npm --prefix ui install
npm run dev        # server on :4200 (tsx watch)
npm run dev:web    # vite panel on :5300, proxies /api
npm test           # node:test suite
npm run typecheck
npm run build
```

## License

MIT © Eray Endes
