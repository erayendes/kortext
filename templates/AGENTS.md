# AGENTS.md — Handover Constitution (Kortext v3.1)

> This project was analyzed with **Kortext**: every analysis document was produced from the
> brief, +prime (the human) approved each one individually, and Kortext completed its job
> and stepped away. This file is the constitution of the development relationship from here
> on — EVERY agent working on the project follows it.

## 1. The sacred guideline — `.kortext/`

Make your decisions by reading from here, not by guessing from the code:

- **`.kortext/*.md`** — every document, in one place, in the order they were written:
  `BRIEF` (why this exists) · `PRODUCT` (what it is) · `STACK` (technology + tools) ·
  `STRUCTURE` (standards + folders + terminology) · `ARCHITECTURE` (the shape of the system) ·
  `SECURITY` · `ENVIRONMENT` · `DATABASE` · `API` · `DESIGN` · `GROWTH` · `LEGAL` · `CONTENT` ·
  `ENGINEERING` (the technical contract) · `TEST`. Follow them when producing code and content.
  A file marked `status: not-applicable` was considered and deliberately left empty for this
  project. `PRODUCT` is where the project came from — read it for context, and do not change it
  at will. `BRIEF` sits beside it when the project started from one; a project analysed from an
  existing codebase has none, because the code was the brief.
- **`.kopeng/`** (if present) — the task structure: Version → Epic → Task files. Task
  tracking is Kopeng's job; if it is set up, take your next piece of work from there and
  update its status there.

## 2. Working rules

- **Follow the document — or update the document.** If you see that a decision conflicts
  with the guideline, do not silently deviate: either follow the decision, or talk to +prime
  and update the RELEVANT DOCUMENT too. Document and code must not drift apart — that is
  the entire value of this project memory.
- **Tasks:** if `.kopeng/` exists, work from there. Otherwise work from +prime's
  instructions; if they ask, first split the work into tasks and show the list.
- **Work that falls to +prime** (opening accounts, API keys, purchases, approvals): you
  cannot do it — report it, and if it creates a wait, make it visible.
- **Read-before-Write:** read the current version of a shared file before writing to it.

## 3. Behavior constitution (essentials)

- **Language:** communicate with +prime in +prime's language. The prose in the `.kortext/`
  documents is written in the language of the brief — keep it that way when you update one.
  Their section headings stay English, as do code, identifiers, file names, commands, commits
  and comments, always, whatever the document language. In-product copy follows the interface
  language the brief names (`CONTENT.md` § Localization).
- **Secrets:** API keys/passwords/tokens are never written into code, documents, or
  templates — only in `.env` (outside the repo) + key names in `.env.example`. If you notice
  a leak: stop, report to +prime, suggest revoking the key; cleaning git history is +prime's
  decision.
- **Getting stuck (3-attempt rule):** if 3 different approaches fail on the same blocker,
  STOP; tell +prime what you tried and what you suggest. No moving on with a silent
  workaround.
- **Conflict:** if you see a conflict between documents, stop producing and ask +prime; do
  not choose silently.
- **Test discipline:** meet the quality bar in TEST.md; saying "done" means meeting the
  criteria there.
