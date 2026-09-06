# Changelog

## [3.1.0] — 2026-09-06

The first public release.

> **The history starts here.** What was published under this name before 3.1.0 was a different
> tool — an orchestration engine that ran the development itself — built and used personally,
> never announced. Kortext as described below is a new product that kept only the name, so its
> record begins with this release rather than continuing that one.

Kortext turns a brief, or an existing codebase, into an approved analysis foundation. It drives
the agent CLI you already have — `claude`, `codex` or `gemini` — headlessly, inside your own
repository, one document at a time and in dependency order. Each document lands as a draft; you
approve it, ask its author about a line, or send it back with notes, and the chain moves on your
approvals. When every document is settled, Kortext retires: the documents become the project's
contract, `AGENTS.md` hands your agent the terms, and the code is written by your agent, not by
Kortext.

- **No key, no API.** Kortext calls no model of its own. It spends the subscription behind the
  CLI you installed, and that CLI is chosen per project.
- **Nothing is written from nothing.** A gate reads the brief before the first step runs: a brief
  that does not say what is being built, for whom, in which language, or what is out of scope
  comes back with those questions instead of producing invented documents.
- **The documents are yours.** They live in your repository as plain markdown under `.kortext/`,
  with `foundation/` for the BRD, PRD, TRD and PFD. Frontmatter `status` is the source of truth.
- **The panel is the whole surface.** Approvals, line-anchored questions to the authoring
  persona, revision requests between documents, and the handshake that ends the analysis.
- **One process, one port.** Express and SQLite behind a React panel on `localhost:3441`; the
  registry is a single global database at `~/.kortext/kortext.db`.

Requires Node 22 and one agent CLI on the `PATH`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Kortext
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).