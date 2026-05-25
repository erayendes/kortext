# Kortext v3 — Developer Brief (code side)

## What this folder is

This is the **code/repo side** of Kortext v3 — the npm package source (`erayendes/kortext`) and the GitHub repo. TypeScript runtime + React dashboard + SQLite + worker pool for autonomous AI agent teams.

**Eray (the founder) does not edit anything in this folder.** All `.md` content (agents, rules, workflows, skills, workspace, docs) lives in `_docbase/kortext/` and is synced here only so npm publish can ship it.

## Repo split (READ FIRST)

```
_docbase/kortext/   ← Eray's workspace. Source of truth for all .md content.
_codebase/kortext/  ← THIS folder. Git + npm. Code + SYNCED md copy.
```

**Sync rule (one-way, _docbase → _codebase):**
- Eray edits `.md` files in `_docbase/kortext/`.
- When Eray says **"sync md"** (or similar), Claude runs:
  ```bash
  cd /Users/erayendes/Documents/_codebase/kortext
  for d in agents rules workflows skills workspace docs; do
    rsync -av --delete "/Users/erayendes/Documents/_docbase/kortext/$d/" "./$d/"
  done
  ```
- Never edit `agents/ rules/ workflows/ skills/ workspace/ docs/` here directly — they get wiped on next sync.
- The `_docbase/kortext/CLAUDE.md` is Eray's master context (plan, roadmap). This file is developer-only and stays independent.

## User profile

Eray is a non-coder, communicates in Turkish, code/commits/comments in English. Treat as product/founder collaborator, not as developer. Show progress with concrete artifacts (file paths, screenshots, working previews).

## Active plan

Plan, roadmap, and design specs live in `_docbase/kortext/`:
- [ROADMAP-v3.md](../../_docbase/kortext/ROADMAP-v3.md) — 10 phases, ~25-36 day estimate
- [HANDOVER-v3.md](../../_docbase/kortext/HANDOVER-v3.md) — current phase state
- [Wireframe v4](../../_docbase/kortext/docs/design/wireframe-v4-final.html) — UI spec, 1:1 binding
- [Palette](../../_docbase/kortext/docs/design/PALETTE-v3.md) — `#0A0814` bg, `#A855F7` accent, `#EC4899` signal

## Architecture (technical)

1. **Hybrid data layer:** Markdown for human sources (blueprint, ADR, personas, workflows); SQLite for state (backlog, contexts, locks, handovers, runs, audit log, pending questions).
2. **Full autonomy + approval queue:** Blueprint approved → analysis → planning → dev → test → deploy chain auto-fires. Critical gates post to `pending_questions`, surfaced via header bell.
3. **Git worktree isolation:** Each task runs in `.kortext/worktrees/<run-id>`. File locks deprecated.
4. **TypeScript only:** Old Python+Bash kept under `legacy/` as reference until characterization tests pin behavior.
5. **MCP server:** Programmatic interface for all runtime ops. Stdio + SSE transport.
6. **Persona definitions = markdown:** `agents/*.md` is single source of truth (master in `_docbase/`, copy here for npm). UI Agents tab renders inline markdown editor.

## Folder layout (this side)

```
_codebase/kortext/
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
├── tests/
├── legacy/                   # Old Python+Bash (reference only)
├── package.json, tsconfig.json, vite.config.ts, eslint.config.js
└── agents/ workflows/ rules/ skills/ workspace/ docs/
    ↑ SYNCED COPY from _docbase/kortext/. Do not edit directly.
```

## Build / dev / test commands

```bash
npm install                   # install deps
npm run dev                   # vite frontend + express backend (concurrent)
npm test                      # vitest
npm run build                 # production build
npm run typecheck             # tsc --noEmit
npm pack                      # build .tgz
```

## Working style (for Claude on code side)

- Always provide `★ Insight` blocks when writing code (explanatory output style).
- Eray approves big architectural decisions via AskUserQuestion — don't choose unilaterally.
- Verify before claiming done: screenshot, run tests, show file paths.
- Reference [_docbase/kortext/docs/design/wireframe-v4-final.html](../../_docbase/kortext/docs/design/wireframe-v4-final.html) as visual spec for any UI code.
- **Never edit `agents/ rules/ workflows/ skills/ workspace/ docs/` in this folder.** Those are synced from `_docbase`.

## v2 archive references

- v2 final state: tag `tr-archive` (commit `942a83c`)
- v2 original main: tag `v2-original` (commit `0594741`)
- English translation: branch `en` (tag `en-archive`)
- WIP refactor: branch `wip/v2-refactor`

## Sample data ("Acme CRM")

B2B SaaS CRM — Next.js 15 / Node 22 / PostgreSQL 16 / Vercel / Stripe / Auth0. 4 epics (E-001 Authentication, E-002 Billing, E-003 Dashboard, E-004 Admin) + 13 task/bug/debt items. Used across all UI screens.
