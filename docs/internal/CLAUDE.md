# Kortext v3 — Project Context for Claude

## What this is

Kortext v3 is a **TypeScript runtime + React dashboard + SQLite + worker pool** that runs autonomous AI agent teams (Claude Code, Codex CLI, Gemini CLI) on software projects. It's the v2 → v3 reincarnation of the markdown methodology framework (v2 archived in `tr` and `en` branches).

## User profile

- **Eray (+prime)** — non-coder. Communicates in **Turkish**. Code, variables, comments, commits in **English**. UI strings in **English** (i18n layer added later for TR).
- Address Eray as a product/founder collaborator, not as a developer.
- Show progress with concrete artifacts (screenshots, file paths, working previews) rather than code-heavy explanations.

## Active plan

- **Roadmap:** [ROADMAP-v3.md](./ROADMAP-v3.md) — 10 phases, ~25-36 day effort estimate.
- **Current phase:** Faz 0 — TypeScript stack iskeleti (TypeScript + Express + React 19 + Vite + Tailwind v4 + better-sqlite3 + Zod + Vitest).
- **Phases pending:** Faz 1 (SQLite schema), Faz 2 (engine + worker pool + git worktree), Faz 3 (autonomous orchestrator), Faz 4 (persona/workflow TS port), Faz 5 (MCP server), Faz 6 (React dashboard), Faz 7 (CLI), Faz 8 (tests + CI), Faz 9 (publish + docs).

## Design system (approved)

- **UI reference:** [docs/design/wireframe-v4-final.html](./docs/design/wireframe-v4-final.html) — 2400+ lines, all 6 routes + 9 settings sub-panes + drawers + modal + terminal panel + timeline sidebar
- **Palette:** [docs/design/PALETTE-v3.md](./docs/design/PALETTE-v3.md) — vibrant purple+pink + professional/enterprise discipline. Background `#0A0814` purple-tinted black. Accent `#A855F7` (purple), Signal `#EC4899` (pink). +prime amber `#F59E0B`.
- **Design decisions log:** [docs/design/DECISIONS.md](./docs/design/DECISIONS.md) (v2 era) + iterations from v4 session (see git log).
- **Design philosophy:** Vercel discipline — zero card fill, border-only regions, mono ID/timestamp, status = dot+text (no fill), one primary CTA per screen, 200ms ease-out only. No glow, no constant pulse, no fancy graphs.

## Navigation (final)

```
WORKSPACE
  Dashboard / Board / Memory / Reports / References
PROJECT (Settings sub-panes — merged into main sidebar)
  Project settings / Agents (+models merged) / Rules / Workflows
SYSTEM
  Hooks / Integrations / Environment
  Danger zone
```

Header right: terminal toggle (`>_`), inbox bell (red badge dot → popup notification on new approval), `+p` avatar.
Footer: `● Acme CRM | ● 6 active | ● 2 idle | ● 1 blocked | ⚡ ~1.2K tkn/s | $4.30 today | ⎇ feature/auth-42 | workflow: 04-development 4/7`

## Key architectural decisions

1. **Hybrid data layer:** Markdown for human sources (blueprint, ADR, references, persona/workflow definitions); SQLite for state (backlog items, contexts, locks, handovers, runs, audit log, pending questions).
2. **Full autonomy + approval queue:** Blueprint approved → analysis → planning → dev → test → deploy chain auto-fires. Critical gates (architecture, blueprint, production deploy) post to pending_questions, surfaced via header bell + popup toast.
3. **Git worktree isolation:** Each task runs in its own worktree (`.kortext/worktrees/<run-id>`). File locks deprecated.
4. **TypeScript everywhere:** Old Python+Bash kept under `legacy/` as reference until characterization tests pin behavior; new code in TS.
5. **MCP server:** Programmatic interface for all runtime ops (start_pipeline, add_backlog_item, list_pending_questions, respond_to_question, etc.). Stdio + SSE transport.
6. **Persona definitions = markdown:** `agents/*.md` is the single source of truth. UI Agents tab renders inline markdown editor (Profile drawer + Library tab).

## Folder layout

```
kortext/
├── src/                      # React frontend (Vite)
├── server/                   # Express + engine + executor
│   ├── db/                   # SQLite schema, migrations
│   ├── engine/               # Pipeline runner, worker pool, worktree
│   ├── executor/             # Claude/Codex/Gemini adapters
│   ├── routes/               # REST API
│   ├── services/             # Business logic
│   ├── notifications/        # Slack/Telegram
│   └── safety/               # Output guards
├── mcp/                      # MCP server (stdio + SSE)
├── bin/                      # CLI entry (kortext init/start/mcp/etc.)
├── workspace/                # Markdown human sources
│   └── references/blueprint.md
├── agents/                   # 14 persona .md
├── workflows/                # 12 workflow .md
├── rules/                    # behavior, branching, commands, emergency, models
├── docs/
│   └── design/               # wireframe-v4-final.html + design docs
├── legacy/                   # Old Python+Bash (reference only)
└── tests/
```

## v2 archive references

- **v2 final state:** tag `tr-archive` (commit `942a83c`)
- **v2 original main:** tag `v2-original` (commit `0594741`)
- **English translation:** branch `en` (tag `en-archive`)
- **WIP refactor:** branch `wip/v2-refactor`

## Sample data ("Acme CRM")

B2B SaaS CRM — Next.js 15 / Node 22 / PostgreSQL 16 / Vercel / Stripe / Auth0. 4 epics (E-001 Authentication, E-002 Billing, E-003 Dashboard, E-004 Admin) + 13 task/bug/debt items. Used across all UI screens.

## Working style

- **Always provide `★ Insight` blocks** when writing code (explanatory output style — see [SessionStart hook]).
- **Eray approves big decisions** via AskUserQuestion. Don't make architectural choices unilaterally.
- **Verify before claiming done:** screenshot the result, run the test, show the file path.
- **Use TaskCreate/TaskUpdate** for multi-step phases. Track active phase status.
- **Reference docs/design/wireframe-v4-final.html** as visual spec for any UI code in Faz 6.

## Servers

- **Wireframe preview:** `npx serve -l 8092 /Users/erayendes/Documents/_codebase/kortext/docs/design` (configured in `.claude/launch.json`). Open http://localhost:8092/wireframe-v4-final.html.
- **Future dev server (Faz 0):** `npm run dev` → frontend on `PORT` (default 3200), backend on `PORT+1`.

## Memory

- [Klasör konvansiyonu](../../.claude/projects/-Users-erayendes-Documents--docbase-kortext/memory/folder_convention.md): `_docbase/` = docs, `_codebase/` = code projects. **v3 lives in `_codebase/kortext/`**.
- [User role](../../.claude/projects/-Users-erayendes-Documents--docbase-kortext/memory/user_role.md): Eray is non-coder; Kortext exists to let AI agents run projects autonomously.
