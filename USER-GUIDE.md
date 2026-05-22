# Kortext User Guide

This guide is for the **person running Kortext on a project** — not the
person hacking on Kortext itself. It assumes you can use a terminal, but not
that you know TypeScript.

For migrating from v2, read [MIGRATION-v2-to-v3.md](./MIGRATION-v2-to-v3.md)
first. For the architecture under the hood, see
[docs/architecture.md](./docs/architecture.md).

## Table of contents

1. [The mental model](#the-mental-model)
2. [Setup](#setup)
3. [Writing a blueprint](#writing-a-blueprint)
4. [Starting the runtime](#starting-the-runtime)
5. [The dashboard, screen by screen](#the-dashboard-screen-by-screen)
6. [Approving and rejecting agent decisions](#approving-and-rejecting-agent-decisions)
7. [Editing personas and workflows](#editing-personas-and-workflows)
8. [Using Kortext from Claude Code or Cursor (MCP)](#using-kortext-from-claude-code-or-cursor-mcp)
9. [Notifications (Slack, Telegram)](#notifications-slack-telegram)
10. [CLI cheat sheet](#cli-cheat-sheet)
11. [Troubleshooting](#troubleshooting)

---

## The mental model

Kortext sits between **you** and a team of AI agents. You give it three
things:

1. **A blueprint** — what you want to build, who it's for, what success looks
   like. Plain markdown.
2. **Personas** (preloaded by `kortext init`) — 14 roles like `+architect`,
   `+developer`, `+reviewer`, `+pm`. Each has its own system prompt.
3. **Workflows** (also preloaded) — 12 pipelines like `analysis`, `planning`,
   `development`, `testing`, `deployment`. Each is a DAG of steps, with each
   step assigned to a persona.

You flip `status: approved` on the blueprint. The orchestrator triggers the
first workflow. Each step picks the right persona, opens a git worktree,
calls the right CLI (Claude Code / Codex / Gemini), captures the output,
runs safety checks, and either advances or pauses for your approval at a
gate.

You watch the dashboard, answer the prompts that surface, and merge what
ships. The agents handle the rest.

---

## Setup

### Install

```bash
npm install -g kortext
kortext --version    # → 3.0.0
```

### Initialize a project

```bash
mkdir my-product
cd my-product
git init
kortext init
```

`kortext init` is idempotent — every file is created only if missing. Re-run
it safely. If you really want to overwrite local edits with shipped
templates, use `kortext init --force`.

After init you'll have:

```
my-product/
├── .kortext/
│   ├── kortext.db                  # SQLite state
│   └── worktrees/                  # per-run git worktrees
├── workspace/references/blueprint.md   # ← edit this
├── agents/*.md                     # 14 persona definitions
├── workflows/*.md                  # 12 workflow pipelines
├── rules/                          # behavior, branching, commands
└── AGENTS.md                       # pointer file for AI runtimes
```

### Install at least one AI CLI

Kortext can drive Claude Code, Codex, or Gemini CLI. Install whichever you
have access to:

```bash
# Claude Code
npm install -g @anthropic/claude-code

# (Codex / Gemini — follow their respective install instructions)
```

Verify the binary is on your `$PATH`:

```bash
which claude    # or: which codex / which gemini
```

If none is installed, you can still smoke-test the pipeline with the mock
executor — see [Troubleshooting](#troubleshooting).

---

## Writing a blueprint

The blueprint lives at `workspace/references/blueprint.md`. Its YAML
frontmatter holds the lifecycle flag; the body holds the human content.

```markdown
---
status: draft
project: Acme CRM
owner: +eray
---

# Blueprint — Acme CRM

## What we're building
A B2B CRM for small sales teams. Auth via Auth0, billing via Stripe.

## Personas
- Sales rep — tracks pipeline, logs calls
- Sales manager — sees team performance

## Success
- 100 pilot users in 30 days
- 80% week-2 retention

## Tech constraints
- Next.js 15, Node 22, PostgreSQL 16
- Hosted on Vercel
```

When you're ready, change the frontmatter:

```diff
- status: draft
+ status: approved
```

Save the file. The orchestrator picks up the change within a few seconds
and triggers the first workflow.

> You can also approve from the dashboard (Board view → "Approve blueprint")
> or via the MCP tool `approve_blueprint`. All three paths write the same
> frontmatter.

---

## Starting the runtime

```bash
kortext serve
```

This starts:

- **Backend** on `http://localhost:3200` (Express + SQLite)
- **Dashboard** on `http://localhost:5173` (Vite + React)

In production builds, both are served on the same port:

```bash
npm run build
kortext serve --mode=prod
```

Pick a different port with `--port=8080`. Backend port is also configurable
via `KORTEXT_PORT=8080`.

Stop everything with `Ctrl-C`. Kortext propagates SIGINT to the child
processes, so neither the backend nor the dashboard is left running.

---

## The dashboard, screen by screen

Open `http://localhost:5173`.

### Dashboard

Live runs (refreshes every 3 seconds) and the doctor badge (refreshes every
10 seconds). The doctor badge turns red if any consistency check fails —
click it to see why.

### Board

Backlog items grouped by status (To do · In progress · Blocked · Review ·
Done). Click an item to open its detail drawer; the **Approve blueprint**
button appears here when the blueprint is in draft.

### Memory

The `workspace/memory/` markdown files (decisions, learned, handovers),
rendered safely (marked + DOMPurify). Read-only.

### Reports

Generated artifacts under `workspace/reports/`. Each report has a markdown
body and is linked to a run via `runtime_artifacts`.

### References

Your `workspace/references/*.md` — the blueprint, ADRs, anything else you
add. Same allow-listed `/api/docs/:scope` route as Memory and Reports.

### Settings

Eight sub-panes. The two you'll touch most:

- **Agents** — inline markdown editor for personas. Edit, save, see the
  registry hot-reload. Validate-before-write means a broken edit is rejected
  before the file is touched.
- **Workflows** — read-only for now (UI editing lands in v3.1+). Use your
  editor for the markdown.

### Overlays

- **Bell** (top right) — pending questions. Red dot when something needs
  you. Click for the popup.
- **Toasts** — auto-dismiss after 8 seconds. Shows new approvals as they
  arrive.
- **Terminal panel** (`>_` toggle, top right) — bottom drawer. Live step
  output for runs in progress.
- **Timeline drawer** (right edge) — reverse-chronological runs and
  handovers.

---

## Approving and rejecting agent decisions

Gates appear when a workflow hits a step marked `gate: true` in the
workflow markdown. The step pauses, a row appears in `pending_questions`,
the bell turns red, and a toast pops.

**To approve:**

- **Dashboard:** click the bell → "Approve" → optional comment → submit.
- **CLI:** `kortext approve <run-id>` (with an optional message).
- **MCP:** call `respond_to_question` with `{ decision: "approve" }`.

The run resumes from the same git worktree, picks up where it paused, and
continues.

**To reject:**

- **Dashboard:** click the bell → "Reject" → reason → submit.
- **CLI:** `kortext approve <run-id> rejected: <reason>`.
- **MCP:** call `respond_to_question` with `{ decision: "reject", reason }`.

A rejected run flips to `cancelled` with `error_message: rejected: <reason>`.
The worktree is moved to quarantine for postmortem. Nothing else
downstream runs.

> **Tip:** if you're not sure what the gate is asking, click into the run
> from the Dashboard. The drawer shows the step log, the persona's
> reasoning, and the proposed next action.

---

## Editing personas and workflows

### Personas

```
agents/+architect.md
agents/+developer.md
…
```

Each file is markdown with YAML frontmatter:

```markdown
---
handle: +developer
model: claude-sonnet-4
executor: claude
escalate_to: [+architect, +prime]
---

# +developer

You are a senior software engineer …
```

Edit either in your editor or in **Settings → Agents** in the dashboard. The
registry hot-reloads — no restart needed. The `executor:` field decides
which CLI runs steps assigned to this persona.

### Workflows

```
workflows/01-analysis.md
workflows/02-planning.md
…
```

Each is a step list with declared inputs / outputs. The engine builds the
DAG from `outputs:` → `inputs:` matching; you don't write dependencies by
hand.

```markdown
---
id: planning
nextWorkflowId: development
gates:
  - after: spec_review
---

## Steps

### gather_requirements
- persona: +pm
- inputs: [blueprint.md]
- outputs: [requirements.md]

### draft_spec
- persona: +architect
- inputs: [requirements.md]
- outputs: [spec.md]

### spec_review
- persona: +reviewer
- inputs: [spec.md]
- outputs: [review.md]
- gate: true
```

The `gate: true` line is what pauses the run for your approval.

---

## Using Kortext from Claude Code or Cursor (MCP)

Add Kortext as an MCP server:

```bash
# Claude Code
claude mcp add kortext -- npx kortext mcp

# Cursor — add to ~/.cursor/mcp.json
{
  "mcpServers": {
    "kortext": {
      "command": "npx",
      "args": ["kortext", "mcp"]
    }
  }
}
```

The 15 tools you'll have access to:

| Group | Tools |
|---|---|
| **Workflow** | `list_workflows`, `list_personas`, `list_pipelines`, `get_pipeline`, `start_pipeline` |
| **Backlog** | `list_backlog`, `add_backlog_item`, `transition_item` |
| **Approval** | `list_pending_questions`, `respond_to_question` |
| **Context** | `get_context`, `handover`, `get_logs` |
| **Blueprint** | `read_blueprint`, `approve_blueprint` |
| **Health** | `get_runtime_status` |

From inside Claude Code:

> Use the `kortext` MCP server: list pending questions, summarize them, and
> approve any that look safe to me.

---

## Notifications (Slack, Telegram)

Set environment variables, then restart `kortext serve`:

```bash
# Slack
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../...

# Telegram
export TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
export TELEGRAM_CHAT_ID=-100123456789
```

The dispatcher posts on:

- Blueprint approval
- Pipeline start / completion
- Step failure
- Pending question waiting for `+prime` (you)

Notifications are deduplicated by `(channel, kind, resource_id)` — restarting
the runtime won't replay every old event.

---

## CLI cheat sheet

```bash
kortext init [--force]                    # scaffold project
kortext serve [--mode=…] [--port=N]       # backend + dashboard
kortext start <workflow-id> [--executor=mock|claude|codex|gemini]
kortext approve <run-id> [answer]         # respond to a pending question
kortext status                            # recent runs + open questions
kortext logs [--limit=N] [--actor=…] [--action=…] [--resource-type/-id=…]
kortext cleanup [--quarantine-older-than=Nd] [--branches] [--dry-run]
kortext doctor                            # workflow / persona / lock consistency
kortext mcp                               # stdio MCP server
kortext --help | --version
```

---

## Troubleshooting

### "Blueprint approved but nothing happened"

- Check `workspace/references/blueprint.md` frontmatter — the orchestrator
  parses `status:` from YAML, not from a markdown comment.
- Tail the logs: `kortext logs --action=blueprint.watcher --limit=20`.
- Confirm the runtime is actually running: `curl localhost:3200/api/health`.

### "A run is stuck in `running` after I restarted the backend"

That run is **orphaned**. On the next server boot the resume layer marks it
`cancelled` with `error_message: orphaned: server restarted` and lets you
retry it from the same worktree:

```bash
# Find the orphaned run
kortext status
# Retry it
kortext start <workflow-id> --retry <run-id>
```

### "I want to dry-run without burning AI tokens"

```bash
kortext start <workflow-id> --executor=mock
```

Mock executor runs everything in-process, fills in placeholder outputs, and
exercises the worker pool, gate, safety, and approval surfaces without
calling any real CLI.

### "Worktrees are piling up in `.kortext/worktrees/`"

Failed runs intentionally leave their worktree under
`.kortext/worktrees/quarantine/run-<id>-<timestamp>/` plus the
`kortext/run-<id>` branch — for postmortem. Once you've reviewed them, clean
up:

```bash
# Preview
kortext cleanup --quarantine-older-than=7d --branches --dry-run
# Actually delete
kortext cleanup --quarantine-older-than=7d --branches
```

### "The dashboard shows stale data"

Polling is 3s for runs and 10s for the doctor. A hard reload
(`Cmd-Shift-R` / `Ctrl-Shift-R`) clears the TanStack Router cache too — use
that after any router-shape changes.

### "MCP stdio server is dropping the connection"

The stdio transport uses **stdout for JSONRPC frames**. A single rogue
`console.log` anywhere in the server tree breaks the protocol. v3 patches
this at startup (`bin/kortext.ts mcp` re-routes `console.log` →
`console.error`), but a downstream library that writes to stdout directly
can still break it. Run with `KORTEXT_MCP_DEBUG=1` to see stderr in the
host's log.

### "`npx kortext` is slow to start"

In dev (no `dist/` present), `bin/kortext.js` falls back to `tsx`, which
adds a ~200ms hop. After `npm run build` the shim prefers the compiled
`dist/bin/kortext.js` and skips the hop. CI publishes pre-built artifacts,
so installed users always get the fast path.

### "Where's the database?"

`.kortext/kortext.db`. Set `KORTEXT_DB_PATH` to override. The schema is
documented in [docs/architecture.md](./docs/architecture.md).

### "I edited a persona but the change didn't apply"

The PersonaRegistry mutates its map in-place — readers see the new content
immediately. If you suspect a stale cache, hit `GET /api/personas/<handle>`
and confirm the body matches the file. If it does, the runtime has the
update; if it doesn't, your edit failed validation (the PUT route
validates parsing before writing).

---

## Where next

- [Architecture](./docs/architecture.md) — schema, engine internals
- [Roadmap](./ROADMAP-v3.md) — what's done, what's coming in v3.1+
- [Changelog](./CHANGELOG.md) — release notes
- [Migration Guide](./MIGRATION-v2-to-v3.md) — upgrading from v2

For bug reports and feature requests, open an issue on
[GitHub](https://github.com/erayendes/kortext-framework/issues).
