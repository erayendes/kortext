# Kortext — Test

One document, two jobs: a step-by-step trace of what the code actually does on a real run, and
the checklist that says whether the run passed. Every step names the file behind it, so a
surprise on screen can be read back to the line that caused it.

Replaces the old UAT + SIMULATION pair, both of which described the archived v3 engine
(bootstrap wizard on `:3199`, one daemon per project, `kortext init/serve/purge`, worktrees,
Board, deploy gates). None of that exists.

**Example project:** *Acme CRM*, code `ACME`.

---

## 0 · Before you start

- **Node ≥ 22** and **at least one agent CLI** on the PATH: `claude`, `codex`, `antigravity`
  (`agy`) or `gemini`. The ones marked *untested* in the dropdown are prepared from their
  documentation; a pass on one of them is a finding either way.
  Kortext has no LLM key of its own; it spends the subscription behind that CLI.
- **A real run costs real money and real minutes.** Each step is one headless CLI call; a step
  is killed at 15 minutes, the planning run at 30. Keep the first pass small — a brief with
  5–8 features, not a platform.
- **You are prime.** Nothing is approved without you. That is the whole point of the flow.

```bash
npm run build && npm pack && npm install -g ./kortext-3.1.0.tgz
```

---

## 1 · Start

```bash
kortext
```

**Expect:** two lines — `kortext panel: http://localhost:3441` and `db: ~/.kortext/kortext.db`
— then the prompt comes back: the server has gone to the background, and the browser opens the
panel. Closing the terminal changes nothing. `--port` moves it, `--db` moves the database,
`--no-open` keeps the browser shut, `--no-detach` keeps the server in the terminal (Ctrl+C
stops it), `--stop` brings a background server down, `--version` prints the version. What the
background server prints goes to `~/.kortext/kortext.db.log`.
→ [server/index.ts](../server/index.ts) · [server/daemon.ts](../server/daemon.ts)

**Expect in the header:** the wordmark, the theme button at the right — and, when no agent CLI
is on the `PATH` at all, the warning that says so. The engine itself is not chosen here: it
belongs to a project.
→ [server/engines.ts](../server/engines.ts)

**Expect in the status bar:** a green dot, `kortext v3.1.0`, the ⏻ button, the Milowda credit.

- [ ] The panel opens, the dot is green, the bar says `v3.1.0`.
- [ ] With no CLI installed the header warns; with one installed it stays quiet.
- [ ] A second `kortext` does not start a second server: it says `kortext is already running`
      and opens the panel of the one that is.
- [ ] ⏻ once arms it (*click again to stop*); twice stops it: the dot goes red and the bar
      shows `kortext` as the command to start again. `kortext --stop` does the same from a
      terminal.
- [ ] While a step is writing, ⏻ and `--stop` both refuse — the analysis is never cut off
      mid-document.
- [ ] Start `kortext` again with the tab still open: the dot turns green by itself.
- [ ] The theme button cycles auto → light → dark, and the choice survives a reload.
- [ ] No update strip while the running version is the newest on npm, and never from a dev
      checkout. Install an older version globally to see it; **Update now** ends with *quit
      kortext and start it again*, and every other call is refused while it runs.
- [ ] The Milowda credit opens a popover; a click elsewhere or Escape closes it.
- [ ] The × on *Also from Milowda* asks once, then hides it for good — on the project list and
      on the project screen both, and across reloads.

---

## 2 · Add a project

**Add project** takes: name, code (2–8 letters, `ACME`; derived from the name when left
empty, digits dropped — *365 Tracker* becomes `TRACK`), *New* or *Existing*, the folder (Browse
opens the macOS chooser; other platforms take a typed path), an optional document language, the
**agent CLI** (the dropdown beside Initialize — the choice is the project's, not the app's), and
— for a new project — the brief, written in the form or uploaded.

**Expect on disk:** `AGENTS.md` at the repo root carrying kortext's block between
`<!-- kortext:start -->` and `<!-- kortext:end -->`, a `CLAUDE.md` pointer line if that file
already existed, and `.kortext/` with fourteen analysis skeletons. A new project also has
`BRIEF.md`; a submitted brief starts approved, while an empty brief starts as a draft.
→ [server/projects.ts](../server/projects.ts)

**Expect on screen:** the project lands **paused**. Nothing runs until you press **Start**.

- [ ] A hand-written `AGENTS.md` in that folder survived, with the block appended.
- [ ] In a fresh folder, a new project with a submitted brief shows `1/15` settled; with an
      empty brief it shows `0/15`. An existing project without a brief shows `0/14`.
- [ ] Adding the same folder twice is refused by name, and so is a duplicate code.
- [ ] The CLI picked in the form is the one the steps run on, and a second project can be added
      on a different one without disturbing the first.

---

## 3 · The gate

**Start** does not start the chain — it asks the gate first.
→ [server/readiness.ts](../server/readiness.ts)

| project | what is judged |
| --- | --- |
| new | the brief: ≥ 240 characters of real prose outside the skeleton (floor), then one engine judgment cached per brief hash |
| existing | the code: at least 3 source files that are not `node_modules`, `dist`, `.git`… |

**Expect when the brief is thin:** a blue band with up to six questions, and the brief demoted
from `approved` back to `draft` — it moves to **Action needed**, which is where a document waiting
on a human belongs. Editing the brief and approving it again re-asks the gate.

- [ ] A one-line brief produces questions, not documents.
- [ ] With no agent CLI installed, the gate says exactly that instead of failing silently.
- [ ] Answering the questions in the brief opens the gate on the next Start.

---

## 4 · The chain

Steps run in dependency order, at most **three in parallel**, and every document lands as
`draft` written by its persona. A step whose inputs are not settled never runs.
→ [server/runner.ts](../server/runner.ts)

The order for a new project: `PRODUCT` · `STACK`+`STRUCTURE` · `ARCHITECTURE` · `SECURITY` ·
`ENVIRONMENT` · `DATABASE` · `API` · `DESIGN` · `GROWTH` · `LEGAL` · `CONTENT` · `ENGINEERING` ·
`TEST`. An existing project starts from the code and follows the same shelf.

- [ ] Documents appear in dependency order, three at most in flight.
- [ ] Approving one wakes the chain immediately — it does not wait for another step to finish.
- [ ] **Pause** stops new steps and kills the running one — `pgrep -f "claude --print"` (or
      your engine) is empty a few seconds later, and the row says stopped, not failed.
      **Continue** picks the chain back up; the stopped step is retried from the row.
- [ ] Switching the CLI from the dropdown next to Start moves the steps **and the rechecks**
      that begin after it; the running one finishes on the old CLI.
- [ ] The model dropdown beside it: pick one and the next run's log header carries it
      (`# args: [... "-m", "<model>"]`); `default` carries nothing.
- [ ] A running recheck sits in **Doing** as `reading`, blue and pulsing; a queued one waits in
      To do. Two rechecks on two readers run at once, never two on one.
- [ ] A revision started from the drawer takes a slot: with three runs in flight it starts when
      one lands, not as a fourth CLI.
- [ ] A failed step stays visible with its reason **in the row** and can be retried; a Retry the
      server refuses writes its reason there too.
- [ ] Editing server files under `tsx watch` restarts the server and kills every running CLI
      (`pgrep -f agy` / `-f "claude --print"` empty a second later); the rows say restarted.
- [ ] Raw CLI output is in `~/.kortext/kortext.db.logs/`, or `<db-path>.logs/` when using `--db`.

---

## 5 · Review in the drawer

Open any document. Everything you can do to it is here:

| action | what happens |
| --- | --- |
| **Approve** | `draft → approved`; the chain advances, this document's outgoing requests travel to their targets, and every approved reader of it is re-judged |
| select a row in **Action Needed** | the row's moves open under it — a question takes **Ask** · **Add note**; an incoming request **Ask** · **Accept** · **Deny**; an outgoing one **Ask** · **Accept** · **Discard** |
| **Ask** | the author persona answers, in the panel only — nothing is written |
| **Apply** | one press sends everything the tray collected: answers and accepted requests go into one rewrite, denials into `## Decisions`, sent requests to their target now, discards out of the file |
| select a line of the body → **Add note** | a revision note on that line; **Request revision** (or Apply) re-runs the author with it |
| **Edit** | saves your text; an ordinary save does not close requests or remove open questions. With requests standing, a second button — **Save, requests done** — saves and closes them without a rewrite |
| `not-applicable` | the step judged the document irrelevant and said why; it satisfies dependencies like an approval |

- [ ] Ask answers about the selected row and writes nothing to disk — hash the file before and after.
- [ ] Open questions block approval (the button says so on hover); outgoing requests still undecided block it too.
- [ ] After Apply the drawer stays open: the tray goes read-only and says *sent; the document is being rewritten*, Approve / Edit / Apply are locked, and when the rewrite lands the body reloads and the tray empties.
- [ ] A revision comes back with the answered questions **gone** from `## Questions for Prime`, the facts folded into the body, and the unanswered ones kept — the author may add new ones.
- [ ] **Accept** on an outgoing request moves it out of this document and rewrites the target with it at once — no second Accept there. A target not yet written keeps the `- [ ] from \`SOURCE.md\` — …` line for its first draft; a target being rewritten keeps it under *Incoming Requests* for you.
- [ ] **Deny** with a reason removes the `from` line and writes the request and the reason under `## Decisions`; **Accept** re-runs the author with it and the line is gone afterwards.
- [ ] `## Decisions` and every `from` line survive the next rewrite untouched — the agent is told they are not its to drop, and kortext restores them if it drops them anyway.
- [ ] The diff picker beside the name shows recorded versions; a rewritten block wears `[+]` and unfolds its old text; a run of new blocks says `new` once.
- [ ] The brief has no producing step: **Edit** is the only way to change it.
- [ ] **Edit** works while a recheck reads the document; only a run that writes it locks the drawer.
- [ ] Notes in the tray keep their label (`#3` for a question, `#1` for a line) after Accept moves
      the text under them.

## 6 · Handshake

When every mapped document is `approved` or `not-applicable`, with no open questions and no
standing demands, analysis is complete.
→ `analysisComplete` in [server/docs.ts](../server/docs.ts)

**Expect:** the completion card — *"Analysis complete — handshake done"* — with three starter
commands that copy on click. Kortext's job is over; the documents are the contract and
`AGENTS.md` hands your agent the terms.

- [ ] The card appears only when the last document settles.
- [ ] A starter command pasted into your own agent gets it reading `.kortext/` first.

---

## 7 · Kopeng — optional

With `kopeng` on the PATH, **Transfer to Kopeng** splits the work in one long run into
`.kopeng/project.yaml` + `versions/` + `epics/` + `tasks/`, with ids carrying the project code
(`ACME-E01`, `ACME-T001`). The panel summarises the plan; **Approve plan** is the last signature
of the handshake. Without kopeng installed, the button is replaced by an install card.

- [ ] Transfer is refused while the analysis is incomplete.
- [ ] A finished run leaves `project.yaml` plus at least one task, or it fails loudly.

---

## 8 · Lifecycle

| action | what it touches |
| --- | --- |
| **Pause / Continue** | Pause stops new steps and aborts the running one; Continue kicks the chain |
| **Restart** | clears `.kortext/` except `BRIEF.md`, re-scaffolds, lands paused; preserves `.kopeng/` |
| **Archive** | a shelf: the row and the repo both stay, the card folds away |
| **Cancel** | removes `.kortext/` including the brief and manual edits, the Kortext `AGENTS.md` block, `CLAUDE.md` pointer, project logs and registry row. Preserves `.kopeng/`, other project files and user content outside those contract entries |
| **Delete** (list) | unregisters only; the repo is untouched |

- [ ] Restart preserves the brief byte for byte, including draft/approved status, and lands paused.
- [ ] Restart on an existing project does not create a brief.
- [ ] Restart and Cancel both preserve existing `.kopeng/` tasks.
- [ ] Cancel leaves a hand-written `AGENTS.md` in place, minus the block.
- [ ] Restart and Cancel both arm in place before they act.
- [ ] **Cancel while a step is running leaves no CLI behind.** `pgrep -f "claude --print"`
      (or your engine) must come back empty a few seconds later — the route pauses the project
      before it aborts, so the chain cannot restart what it just stopped.

---

## 9 · Traps worth knowing

1. **A CLI that is installed is not a CLI that is authenticated.** Kortext only runs `which`; a
   logged-out CLI fails inside the step, and the reason lands on the job row.
2. **Steps are long.** Minutes each, and a stuck one is killed at 15. Pause aborts the whole
   process group rather than waiting.
3. **A restart mid-step** settles the orphaned `running` rows at boot — they show as failed with
   "kortext restarted mid-step — retry", which is the truth, not a bug.
4. **The panel polls** (documents every 3s), so a change made on disk shows up a beat later.
5. **An older kortext left running is a second writer.** A global install from before
   (`kortext` in the background, `~/.kortext/kortext.db`) keeps polling every project it
   registered; clear a project's `.kortext/` and it re-scaffolds the skeletons from **its**
   templates before the new server gets there — old headings, old placeholder text, and the
   agent fills what it finds. Before a test pass: `pgrep -fl kortext`, and `kortext --stop` (or
   kill the pid) for anything that is not the server under test.
6. **Antigravity reads the whole repository every run.** A one-sentence revision took five
   minutes where codex took one; that is the CLI, not the chain. Without `--add-dir` it would
   also hunt for the repository in its own home — the spec passes it.

---

## 10 · Cleanup

Cancel each test project from its own screen (that is the tested path), then:

```bash
npm uninstall -g kortext
rm -rf ~/.kortext
```

`~/.kortext` holds the registry and the logs for **every** project — remove it only when you
are done with all of them.

---

## Session prompt

To run a test pass in a fresh Claude Code session, paste this:

> This session is a Kortext test pass — not development. Read `dev/TEST.md` first, then give me
> one paragraph on where we are.
>
> I am Eray: non-coder, Turkish, GUI-first. Explain plainly, show concretely (screen, file path,
> state). Ask before any architectural decision.
>
> Your job: build and install the current package, start it, and watch the logs and the database
> from the side while I drive the panel. Tell me what is happening in plain words. Collect every
> finding — UX flaw, confusion, bug. Fix the small and obvious ones with my approval; write the
> big ones down and do not refactor without asking. No push to `origin/main` unless I say push.
