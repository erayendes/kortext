# Kortext — Guide

🇹🇷 [For Turkish press 1](tr/GUIDE.md)

Installation and the overview are in the [README](../README.md); this is what to do once a project is on screen.

---

## The mental model

Kortext runs **your** agent CLI inside your repo. Each analysis run produces one document and marks it as a draft.
Only you approve drafts.

- **Every document has a status.** `waiting` (its turn has not come, or it is written and waiting for your approval) → `writing` (being written now) → `approved`. Stop a run and it is `paused`, to be continued; a run that hits an error is `failed`, to be retried. A document the author judges the project has no use for comes to you as `n/a?` — approve it and it settles as `n/a`; disagree, and a note sends the author back to write it.
- **A badge may sit beside the status.** `approve` (waiting for your approval), `review` (it has questions or requests), `recheck` (a document it reads changed; it will be read again), `revision` (a rewrite, not a first draft).
- **The order is not a preference.** A document is written only after everything it depends on is settled. `SECURITY` waiting for `ARCHITECTURE`, say. That is why approving one document starts another.
- **The panel is the only place you work.**

![The project list — one card per project, with what is settled in each](assets/panel-projects.png)

## Starting

**A new project** is created from the brief you write. If the brief does not say what is being built, who it is for, which language the product speaks, how you will know it worked, and what is out of scope, the analysis does not begin — questions come back and the brief drops to **Action needed**.
Answer them in the brief and approve it. It is judged again.


**This gate exists for one reason.** An agent asked to write a product requirements document from three sentences will write one — it will simply invent the product. A question costs a minute; an invented product costs the whole analysis.

Or, for an **existing project**, point Kortext at its repo. It starts by reading the code.

## Reviewing a document

Open any document from the list.

![A document in the drawer: its status, its author, and the questions it asks](assets/panel-document.png)

**Approve** — the document becomes ground for the ones after it, and the chain moves on.

**Ask** — select a line and ask your question. The persona that wrote the document answers about that passage.
Questions are for understanding, not for changing. That is why they are not saved: the thread lives in the panel, a click elsewhere folds its box away and a click on the answer opens it again for a follow-up, and **×** on the thread closes it for good. On one of the document's own questions, or on a request, **Suggest** asks the author what it would do without typing, and under every answer **Use this answer** takes it as your note — a question settled in two presses. A plain line of the document has nothing to suggest, so there the buttons are Ask and Add note.

**Add note** — your notes get the document rewritten. A note left on one of the document's open questions counts as the answer: the question disappears and the fact it established becomes part of the document.

**Edit** — for a number or a sentence that does not need the agent, write the file yourself. It only updates the text; it does not close change requests or clear open questions. While requests stand, a second button appears: **Save, requests done** — it saves the text and closes them.

**Preview** — on `DESIGN.md` only. The tokens the designer wrote — colours, typefaces and scale, spacing, radii, shadows — made real and drawn. Seeing a button's colour and corners beats reading a HEX and a radius. Light and dark mode both. The same page also sits in your repo as `.kortext/DESIGN.html`.

**Action Needed** — at the top of the document. Everything this document expects from you, in two groups.

*Questions* — what the document asks you. Click one, answer it, Add note. The document cannot be approved until they are answered.

*Change Requests* — revision requests other documents sent to this one. `ENVIRONMENT` might say the log lines contradict the no-logs decision, for instance. Select the row, **Accept** or **Deny**. On Deny, write why. If the request is unclear, **Ask** the document that made it.

On the brief there is no Accept — no persona wrote it, you did. The row offers **Draft the change** instead: the engine drafts the brief with the change made and opens it in the editor; **Save** keeps it and closes the request.

**Apply** sends the lot at once. Your answers and the requests you accepted go into one rewrite. The ones you denied are written to the document's `## Decisions`, with your reason.

**A document can ask another document for a change.** While the asking document is still a draft, the request sits under *Outgoing Requests*: **Accept** or **Discard**. A document with an undecided request cannot be approved. Accepted, it travels to the target and waits there under *Incoming Requests* — already ticked, marked *accepted there*. You decided once; you can still untick it. It goes into the target's next rewrite with everything else owed there, in one pass. Denied, it goes to `## Decisions` with your reason. You are not asked again; the agent writing the code reads it there.

**Findings** — problems in files no document owns (a missing `.gitignore` entry, say), written into the document for your information. It asks nothing of you.

**Related documents** — the documents that read this one. Change this one and they are read again. The ones not yet written are struck through.

**Recheck** — the document is approved, but a document it reads changed. Not your job; when its turn comes it is read again, and only a real contradiction becomes a request for you.

## The groups

`Action needed` · `Doing` · `To do` · `Done`. The last is collapsed.

Any document carrying a failure or something waiting on you rises to **Action needed**.

## Running, pausing, changing the engine

The engine — `claude`, `codex`, `antigravity` and the others in the list. At the right, beside Start, a line says what runs it — `claude · sonnet · high ›` — and pressing it opens the picker: the CLI (what is installed), its model with a line about each, its effort. Every pick saves at once. The same line sits on the Add project form, so you choose before Initialize; and you can change it whenever you like. When a quota runs out, changing it is all there is to do.

The second section of the picker is the **model**. `default` uses the CLI's own setting. Pick a model and it is passed to the CLI on every run (`claude --model`, `codex -m`).

A third, **effort**, appears for the CLIs that have the notion — `claude --effort`, codex's `model_reasoning_effort`, `agy --effort` — with the levels that CLI's own picker offers. Like the model, it reaches the runs that start after you set it, and a level the next CLI does not take is dropped when you switch.

- **Pause** stops new steps from starting; the running step stops too.
- **Continue** picks up where it left off.

The rest sit behind the ⚙ beside the project's name; press it and they unfold under the path, each asking once more before it acts:

- **Restart** deletes the analysis documents and keeps `BRIEF.md` as it is. The project comes back paused; **Start** begins again.
- **Archive** puts a finished project on the shelf. The repo is untouched.
- **Remove** deletes the `.kortext/` folder (brief included), the Kortext block in `AGENTS.md`, the pointer line in `CLAUDE.md` and the project's logs, then takes the project off the list. What you wrote yourself in `AGENTS.md` and `CLAUDE.md` stays.

Once every document is settled the engine line and its buttons go — Kortext has nothing left to run there.

## The handshake

![The handshake card — three starter commands, copied on click](assets/panel-handshake.png)

When every document is approved, the analysis is over. The card gives you three starter commands; copy one into your own agent. The agent begins by reading `AGENTS.md` and the `.kortext/` documents.

One more document is on offer here, not in the chain: **EXPERIENCE.md**, for the AI that will design the product. It carries the journeys, every screen with its states, the copy word for word, and the prompts to paste — one master prompt, one per journey, for any design tool. Pick the engine and model beside it — a design brief earns a strong one — press **Write EXPERIENCE.md** and the designer writes it; approve it like the rest. Skip it if the design is already in hand — the documents say enough for a designer who is a person. After the handshake the document is yours: tell your own agent to update it when the product moves.

From here on, Kortext is not in the loop.

## The panel itself

**The status bar**, at the bottom. The first line names what runs — **Stable version 3.1.2**, or **Beta version 3.2-beta3** — and the ⏻ button, green while the server is up, red once it stops; two presses stop it, never while a document is being written. Press the version to check for updates: *up to date*, or the strip below. The second line offers the other channel — **Try beta version**, or **Use stable version** to come back — a press installs it, and the strip takes over.

**The update strip**, under the heading of either screen, in blue, only when npm has a newer version on your channel — the panel looks once when opened and then every hour, so a release lands while it sits open. **Update now** installs it; then the strip offers **Quit** — press it, start kortext again, and the new version takes over.

**Theme.** The button at the top right cycles auto → light → dark.

## The menu bar app

On a Mac, Kortext can live in the menu bar. The panel offers it under the heading — **Download for macOS** — until a copy is running; or fetch `Kortext.zip` from the latest release. It needs kortext installed; without it, it says so and copies the install command for you.

Opening the app starts the server if it is not running — quietly, no browser window. The K in the menu bar shows how many documents wait on you. Open it: one card per project, the documents that need a decision in white with the panel's badges, the ones being written in grey. A row opens the panel on that document. At the bottom, ⏻ starts the server, or — pressed twice — stops it; the app stays. *open panel* beside it opens the panel in your browser.

It tells you when something changes: a document landed and waits for approval, a step failed, a brief came back with questions, a chain settled. The notification opens the panel where it happened. Settings, behind the logo: launch at login, notifications on or off, and two version rows — **Stable version** and **Try beta version**. Each shows the newest of its kind and whether it is what you run: *up to date* or *not installed*. Press one and it is installed, the server restarts, and the app follows to the same channel. Press the other to go back. The package still updates from the panel as before.

## When something goes wrong

**A step failed.** The row says why. The most common cause is a CLI that is installed but not signed in: run it once in a terminal, then **Retry**.

**The panel says no CLI was found.** None is on your `PATH`. Install one and reload the page.

**A step is taking too long.** Steps take minutes; at fifteen they are stopped.

**Kortext restarted in the middle of a step.** The step is marked "kortext restarted mid-step — retry". Press Retry.

**A document will not leave Action needed.** There is an open question, a pending request or a failed run.

## Where things live

| | |
| --- | --- |
| `~/.kortext/kortext.db` | the project registry |
| `~/.kortext/kortext.db.logs/` | raw output of every CLI run |
| `~/.kortext/kortext.db.log` | what the background server prints |
| `<repo>/AGENTS.md` | the agent's contract, inside a marked block |
| `<repo>/.kortext/` | the analysis documents; a new project's `BRIEF.md` is here too |
| `<repo>/.kortext/DESIGN.html` | `DESIGN.md`, drawn |

The documents are plain markdown. Commit them: they are the project's memory, and the next agent to open the repo reads them before writing a line.
