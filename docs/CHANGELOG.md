# Changelog

> [!NOTE]
> [For Turkish press 9](tr/CHANGELOG.md)

## [Unreleased]

Findings from the first real project run through the panel end to end.

- **More engines.** `antigravity` (Google's `agy`) ran a real project; `cursor`, `copilot`,
  `opencode`, `amp`, `droid`, `goose`, `qwen` and `cline` are prepared from their CLI's
  documentation and appear in the dropdown, marked untested, the day they are installed. A CLI
  in `~/.local/bin` is found even when the server was started from an app without that PATH.
- **A model per project.** The dropdown beside the engine names the model the CLI is
  told to use — `claude --model`, `codex -m`, `gemini -m`. Empty keeps the CLI's own default.
- **Rechecks are pool work.** They run up to three at once alongside the steps, they follow an
  engine switch like every other run, and a running one shows as `reading` under Doing rather
  than waiting under To do. A recheck that fails says `failed · recheck`.
- **Three means three.** A revision or retry started from the panel takes a slot in the same
  pool as the chain instead of running as a fourth CLI.
- **The agent does not approve.** A document the agent marked `approved` is set back to
  draft and lands as one; any other stray status fails the run and puts the previous text back,
  so a failed write never opens the steps that read it.
- **Pause reaches a waiting revision.** A revision queued behind a full pool is aborted by
  Pause like a run in flight, and waits for Continue with its notes.
- **The version picker shows the real change.** A rewrite is recorded after the requests and
  decisions it dropped are put back, so the diff is against what is on disk.
- **A model belongs to its CLI.** Switching the engine drops a model the new CLI does not know
  back to its default instead of passing `-m sonnet` to codex.
- **An empty plan is not approvable.** Approve plan is refused, and greyed, when the last split
  failed or left no tasks; the failure is shown on the card instead of "Plan ready".
- **No CLI outlives the server.** Stopping kortext — `kortext --stop`, Ctrl-C, a dev restart —
  aborts every running CLI first; before, one could finish minutes later and write into a
  document the next server had already marked failed.
- **Edit while a recheck reads.** Prime's edits are refused only while a run is writing the
  document; a recheck only reads it.
- **Save, requests done.** When requests stand on a document, the editor offers to save your
  own text and close them — no rewrite by the agent for a number or a sentence.
- A draft with a recheck queued shows `approve` first; a failed Retry writes its reason into
  the row; the tray keeps a note's label once the document under it moves.

## [3.1.0] — 2026-09-06

The first public release.

> **The history starts here.** What was published under this name before 3.1.0 was a different
> tool — an orchestration engine that ran the development itself — built and used personally,
> never announced. Kortext as described below is a new product that kept only the name, so its
> record begins with this release rather than continuing that one.

Kortext turns a brief, or an existing codebase, into an approved analysis foundation. It drives
the agent CLI you already have — `claude`, `codex` or `gemini` — headlessly, inside your own
repository, one document per analysis run, with up to three runs in parallel per project when
dependencies allow. Each applicable document lands as a draft; you
approve it, ask its author about a line, or send it back with notes, and the chain moves on your
approvals. When every document is settled, Kortext retires: the documents become the project's
contract, `AGENTS.md` hands your agent the terms, and the code is written by your agent, not by
Kortext.

- **No key, no API.** Kortext calls no model of its own. It spends the subscription behind the
  CLI you installed, and that CLI is chosen per project.
- **Nothing is written from nothing.** A gate reads the brief before the first step runs: a brief
  that does not say what is being built, for whom, in which language, or what is out of scope
  comes back with those questions instead of producing invented documents.
- **The documents are yours.** Fourteen analysis documents live directly under `.kortext/` as
  plain markdown; new projects also have `BRIEF.md`. Frontmatter `status` is the source of truth.
- **The panel is the whole surface.** Approvals, line-anchored questions to the authoring
  persona, revision requests between documents, and the handshake that ends the analysis.
- **One process, one port.** Express and SQLite behind a React panel on `localhost:3441`; the
  registry is a single global database at `~/.kortext/kortext.db`.
- **It runs in the background.** `kortext` starts the server detached and opens the panel; the
  terminal can go. The status bar's ⏻ button, or `kortext --stop`, brings it down — never while
  a step is writing. The same panel says when a newer version is on npm, and installs it.

Requires Node 22 and one agent CLI on the `PATH`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Kortext
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
