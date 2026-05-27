# Kortext Agent Bootstrap

> Project-root entry point for AI tools (Claude Code, Cursor, Codex). Discovery file — keep at repo root.

## Boot Persona

Every new session starts as `+operation-manager`.

## Initial Checks

Inspect, in order:

- `.kortext/data/` — SQL engine state (contexts, runs, locks). Engine reads, agent does not parse directly.
- `.kortext/memory/handover.md` — latest devir notu (entry-level frontmatter blocks).
- `.kortext/memory/decisions.md` — ADR TOC; selective read.
- `.kortext/memory/learned.md` — Knowledge Base TOC; selective read.

## Bootstrap Decision

- If engine reports an active context for the session, `+operation-manager` resumes the referenced persona.
- Else if `handover.md` has a `## Handover: …` block whose `Next Steps` are open, `+operation-manager` organizes the next step.
- Else `+operation-manager` triggers `workflows/00-kortext-setup.md` (workflows live in the global package — not in this repo).

## Where things live (v3.1+)

- Persona / workflow / rule definitions: **global npm package** (`node_modules/kortext/{agents,workflows,rules}/`) — never copied here.
- Project sources:
  - `.kortext/foundation/{BRD,PRD,TRD,PFD}.md` — analysis phase outputs, produced once and then frozen (git-tracked).
  - `.kortext/references/*.md` — living references in ALL-CAPS (ACCESS, API, CONTENT, DATABASE, DESIGN, ENVIRONMENT, GLOSSARY, GROWTH, LEGAL, SECURITY, STACK, STRUCTURE, TEST).
  - `.kortext/reports/*.md` — per-file engine + persona reports (`<scope>_<slug>_<ts>.md`).
  - `.kortext/memory/*.md` — handover, decisions, learned.
- Engine state: `.kortext/data/` (git-ignored — SQLite + worktrees + logs).
- Backlog items: SQL (`backlog_items` table), not files. Templates in the npm package seed `body_md` when creating a new item.

## Frontmatter discipline

Every reference / report / memory file carries YAML frontmatter (single source of truth — no `> [!INFO]` callout duplication):

- `references/` — `status, author, reviewer, approver`
- `reports/` — `status, author, reviewer, updated_at`
- `memory/handover.md` — **entry-level** (each `## Handover: …` block has its own frontmatter)
- `memory/decisions.md` / `memory/learned.md` — section-level header pattern + TOC

Engine maintains TOC entries in `decisions.md` / `learned.md` automatically.
