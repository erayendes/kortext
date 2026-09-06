# Kortext — Guide

The panel, explained. Installation and the five-step overview are in the
[README](../README.md); this is what to do once a project is on screen.

---

## The mental model

Kortext runs **your** agent CLI inside your repo. Each analysis run produces one document,
with up to three documents being written in parallel per project when their inputs are settled.
You approve the drafts; a document marked `n/a` also satisfies dependencies.

Three things follow from that.

- **Every document has a status.** `waiting` (its turn has not come) → `writing` (your CLI is
  producing it now) → `pending` (written, waiting for you) → `approved`. A document can also
  settle as `n/a` — the step read the inputs and judged that this project does not need it, and
  said why.
- **The order is not a preference.** A document is written only after everything it depends on
  is settled. That is why `SECURITY` waits for `ARCHITECTURE`, and why approving one document
  often starts three others at once.
- **The panel is the only place you work.** Nothing needs a terminal after `kortext`.

![The project list — one card per project, with what is settled in each](assets/panel-projects.png)

## Starting: the gate

Press **Start** and Kortext checks your evidence before producing analysis documents. The initial
content check is local. For a new project that passes it, the brief is then judged by your agent
CLI; that call consumes the CLI's quota or billing and is cached for the same brief.

A **new project** is judged on its brief. If the brief does not say what you are building, who
it is for, which language the product speaks, how you will know it worked, and what is out of
scope, the analysis does not begin — you get questions back and the brief moves to **Needs you**.
The local check uses fixed English questions; the CLI is asked to use the brief's language.
Answer them in the brief, approve it again, and press Start if the project is paused.

An **existing project** is judged on its code: a folder with almost nothing in it has nothing to
analyse.

This gate exists for one reason. An agent asked to write a product requirements document from
three sentences will write one — it will simply invent the product. A question costs you a
minute; an invented product costs you the whole analysis.

## Reviewing a document

Open any document from the list. Everything happens in the drawer.

![A document in the drawer: its status, its author, and the questions it is asking you](assets/panel-document.png)

**Approve** — the document becomes ground for the ones after it, and the chain moves on.

**Ask** — select a line, ask its author. The persona that wrote the document answers about that
passage. Nothing is saved: this is for understanding what you are approving, not for changing it.

**Add note → Request revision** — your notes go back to the step that wrote the document, and it
is rewritten with them. A note left on one of the document's own open questions is read as the
answer to it: the question disappears and the fact it established becomes part of the text.

**Edit** — write the file yourself. A normal save updates the text; it does not automatically
close change requests or clear open questions. Resolve the questions in the text and handle
standing requests separately. When you use **Propose** to draft a requested change to the brief,
saving that proposal also closes the incoming requests it answers.

**Preview** — on `DESIGN.md` only, in the drawer itself: the button swaps the text for the page
and back. The tokens the designer wrote — colors, type scale, spacing,
radius, shadows — drawn as swatches, specimens and live buttons, with the WCAG contrast of each
color measured against the surface it actually sits on. A Light · Dark · System switch sits at
the top: it repaints the page, and where the document declares a dark palette (a `Dark` column,
a `## Dark mode` table, or `-dark` tokens) the swatches, components and contrast grades switch
with it. Where it does not, the page says so rather than implying the design has one. It is
rendered from the document itself, so it can never say something the document does not. The page
is its own document inside the drawer, so its palette and the panel's never mix — the panel can
be dark while the design is read in light. It is also left in your repository as
`.kortext/DESIGN.html`, which opens in any browser without the panel running.

**Open questions** — amber, numbered. The document is asking *you* something, and it cannot be
approved until you answer.

**Change requests** — pink. Another document found a problem in this one: `ENVIRONMENT` says the
access-log lines contradict the no-logs decision, say. Two moves: **Apply** (the author rewrites
the document with that demand) or **Dismiss** with your reason. Both are recorded inside the
document that raised it, ticked, with the outcome written underneath — so the record lives where
the demand was made, and every agent that opens the file later sees it.

You can settle a demand from either end: from the document that received it, or from the one
that sent it.

**Dependent** — hollow pink. This document is approved, but something it reads is moving. Not
work for you; when that input settles, this one is re-read against it and you are told only if
something actually broke.

## The groups

`Needs you` · `In progress` · `Next` · `Approved` · `Not applicable`. The last two are collapsed
— one is finished, the other was deliberately skipped.

Anything carrying a failure or an open demand climbs to **Needs you** no matter what its status
says. The one exception is `dependent`, which is news, not a task.

## Running, pausing, changing the engine

The engine — `claude`, `codex` or `gemini` — belongs to the project, not to Kortext. You pick it
when you add the project, and the dropdown next to Start changes it later. That is the move when
a quota runs out: switch, and the steps that start afterwards run on the other CLI. Whatever is
running at that moment finishes on the old one.

Two projects can sit on two different CLIs, and neither disturbs the other. If you uninstall the
one a project was using, that project does not stop — it falls back to whichever CLI is still
installed, and the dropdown shows you what it fell back to.

- **Pause** stops new steps from starting; a running step is stopped too.
- **Continue** picks the chain back up.
- **Restart** clears the analysis documents and readiness result, preserving `BRIEF.md`
  exactly as it is, including its approval status. The project lands paused; press **Start**
  when ready. `.kopeng/` is independent and stays untouched.
- **Archive** puts a finished project on a shelf. The row stays, the repo is untouched.
- **Cancel** removes Kortext's analysis — the entire `.kortext/` folder, including your brief
  and any manual edits inside it — its block in `AGENTS.md`, its pointer line in `CLAUDE.md`,
  and the project's logs, then unregisters the project. `.kopeng/` and other project files stay;
  your own content in `AGENTS.md` and `CLAUDE.md` stays too. It does not uninstall either tool.

## The handshake

![The handshake card — three starter commands, copied on click](assets/panel-handshake.png)

When every document is approved or `n/a`, with nothing left open, the analysis is complete and
Kortext is done. The completion card gives you three starter commands; copy one into your own
agent — CLI or app — and it begins by reading `AGENTS.md` and the `.kortext/` documents.

From here Kortext is not in the loop. The documents are the contract, and your agent works
against them.

## Transfer to Kopeng — optional

With `kopeng` on your `PATH`, the completion card gains **Transfer to Kopeng**: one long run
splits the approved documents into versions, epics and tasks under `.kopeng/`, with ids that
carry the project code (`ACME-E01`, `ACME-T001`). The panel shows the plan; **Approve plan** is
the last signature. Without kopeng installed the card shows an install note instead, and nothing
else changes — the handshake is complete either way.

## The panel's own controls

Kortext runs in the background: the terminal that started it can be closed, and the panel
stays. What the panel says about itself lives in two strips.

**The status bar**, at the bottom. A green dot means the server is answering; it turns red the
moment the server is gone, and green again by itself when you start `kortext` once more. Next
to it: the running version and the ⏻ button. Stopping takes two clicks — the first arms it and
says so, the second stops the server. It refuses while a step is writing, so an analysis is
never cut off mid-document; `kortext --stop` in a terminal follows the same rule. The credit on
the right opens a short list of the other Milowda tools.

**The update strip**, under the header, appears only when npm carries a newer version than the
one running. **Update now** runs the install for you; while it runs every other call to the
server is refused, and afterwards the strip says to quit kortext and start it again — the
process on screen is still the old one. If the install fails, the strip says so and gives the
command to run yourself.

**Theme.** The button at the right of the header cycles auto → light → dark. Auto follows the
operating system; the other two are remembered in this browser.

**Also from Milowda.** The cards under the project list, and the one-line slide on a project
screen, name the other Milowda tools. The × hides them for good in this browser; it asks once
before it does, and hiding them on one screen hides them on both.

## When something goes wrong

**A step failed.** The row says why, in the CLI's own words. The usual cause is an agent CLI that
is installed but not signed in — run it once on its own in a terminal, then Retry.

**The header says no agent CLI was found.** None of `claude`, `codex`, `gemini` is on your
`PATH`. Install one (see the [README](../README.md)) and reload.

**A step has been running for a long time.** Analysis steps take minutes; a stuck one is stopped
at fifteen. The optional Kopeng planning run has a thirty-minute limit. Raw CLI output is in
`~/.kortext/kortext.db.logs/` by default; with a custom `--db`, it is in `<db-path>.logs/`.

**Kortext restarted while a step was running.** That step is marked failed with "kortext
restarted mid-step — retry", which is exactly what to do.

**A document will not leave "Needs you".** Check for a failed run, an open question or a standing
change request. Open questions block approval. A change request alone does not block approval,
but approving does not close it: the document still needs attention, and analysis cannot finish
until the request is handled.

**Your changes on disk do not show.** The panel polls every few seconds; give it a moment.

## Where things live

| | |
| --- | --- |
| `~/.kortext/kortext.db` | the project registry — one database, every project |
| `~/.kortext/kortext.db.logs/` | raw output of every CLI run |
| `~/.kortext/kortext.db.log` | what the background server prints |
| `<repo>/AGENTS.md` | the handover contract, inside a marked block |
| `<repo>/.kortext/` | fourteen analysis documents; a new project also has `BRIEF.md`, for fifteen total |
| `<repo>/.kortext/DESIGN.html` | the design tokens drawn — regenerated from `DESIGN.md` |

With `--db /path/name.sqlite`, the registry is `/path/name.sqlite`, CLI logs are in
`/path/name.sqlite.logs/`, and the background server writes `/path/name.sqlite.log`.

The documents are plain markdown in your repository. Commit them: they are the project's
memory, and the next agent that opens the repo reads them before it writes a line.
