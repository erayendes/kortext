# Kortext

**The project brain for AI-driven development.** Kortext turns a brief (or an
existing codebase) into an approved analysis foundation — and it drives your
own coding agent (Claude Code, Codex, Gemini CLI…) to write it. You never
leave the panel during analysis: documents land as drafts, you approve,
annotate, or request revisions, and the chain advances on your approvals.
When every document is settled, Kortext retires — the docs become the
project's guideline and `AGENTS.md` hands your agent the contract.

[![npm](https://img.shields.io/npm/v/kortext.svg)](https://www.npmjs.com/package/kortext)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Kortext holds no API key and calls no LLM API of its own — it spawns the
agent CLI you already have installed and pay for, headlessly, inside your
repo.

## How it works

1. **Add a project.** Pick the repo folder. *New project* starts from a brief
   (BRD) you write or upload in the form; *existing project* starts straight
   from the code. Kortext scaffolds `AGENTS.md` at the repo root and
   `.kortext/` with document skeletons.
2. **Analysis.** Kortext runs your agent CLI step by step through a
   dependency-gated workflow. Each step writes one document
   (ARCHITECTURE, STACK, SECURITY, DATABASE, DESIGN, LEGAL, …) as a persona
   (engineering-manager, security-engineer, …) and lands it as `draft`.
   A document whose inputs you haven't approved is never written. Up to
   three independent steps run in parallel; your approval wakes the chain.
3. **Review in the panel.** Open any document: approve it, select a line and
   ask the author persona about it (ephemeral Q&A — nothing is saved), or
   drop notes and request a revision (the producing step re-runs with your
   notes). A document can also settle as `not-applicable` with reasoning.
4. **Handshake.** When every document is approved or not-applicable, analysis
   is complete. The docs are now the project's sacred guideline; `AGENTS.md`
   is the handover constitution. Copy one of the starter commands into your
   client (CLI or app) and build.
5. **Kopeng — optional.** With [kopeng](https://github.com/erayendes/kopeng)
   installed, "Kopeng'e aktar" splits the work into `.kopeng/` —
   Version → Epic → Task files with rich bodies (requirements, user flow,
   acceptance criteria) — and you approve the plan as the last act of the
   handshake. Your agent pulls tasks; you watch the board.

## Quick start

Requires **Node ≥ 22** and at least one agent CLI on your PATH
(`claude`, `codex`, or `gemini`).

```sh
npm install -g kortext
kortext
```

The server starts on port **4200** (`--port` to change) and opens the panel.
Data lives in one global SQLite database at `~/.kortext/kortext.db`
(`--db` to change); the documents live in your repo.

## What lands in your repo

```
AGENTS.md                  the agent's entry contract (handover constitution)
.kortext/
  ARCHITECTURE.md STACK.md STRUCTURE.md API.md DATABASE.md SECURITY.md
  DESIGN.md TEST.md LEGAL.md GROWTH.md CONTENT.md ENVIRONMENT.md
  DECISIONS.md             append-only decision log (status: log)
  foundation/              frozen starting docs: BRD, PRD, TRD, PFD
.kopeng/                   only after "Kopeng'e aktar"
  project.yaml  versions/  epics/  tasks/
```

Frontmatter `status` is the source of truth:
`uninitialized → draft → approved` (or `not-applicable`).

## Development

```sh
npm install && npm --prefix ui install
npm run dev        # server :4200 (tsx watch)
npm run dev:web    # vite panel :5300 (proxy /api → 4200)
npm test           # node:test suite
npm run build      # tsc → dist/ + vite → ui/dist/
```

## License

MIT © Eray Endes
