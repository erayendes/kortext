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

- **Node ≥ 22** and **at least one agent CLI** on the PATH: `claude`, `codex` or `gemini`.
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
— and the browser opening the panel. `--port` moves it, `--db` moves the database, `--no-open`
keeps the browser shut. There are no subcommands: `kortext` is the whole CLI.
→ [server/index.ts](../server/index.ts)

**Expect in the header:** `Kortext | project brain` — and, when no agent CLI is on the `PATH`
at all, the warning that says so. The engine itself is not chosen here: it belongs to a project.
→ [server/engines.ts](../server/engines.ts)

- [ ] The panel opens and the footer says `v3.1.0`.
- [ ] With no CLI installed the header warns; with one installed it stays quiet.

---

## 2 · Add a project

**Add project** takes: name, code (2–8 chars, `ACME`), *New* or *Existing*, the folder (Browse
opens the macOS chooser; other platforms take a typed path), an optional document language, the
**agent CLI** (the dropdown beside Initialize — the choice is the project's, not the app's), and
— for a new project — the brief, written in the form or uploaded.

**Expect on disk:** `AGENTS.md` at the repo root carrying kortext's block between
`<!-- kortext:start -->` and `<!-- kortext:end -->`, a `CLAUDE.md` pointer line if that file
already existed, and `.kortext/` with fifteen document skeletons on one shelf.
→ [server/projects.ts](../server/projects.ts)

**Expect on screen:** the project lands **paused**. Nothing runs until you press **Start**.

- [ ] A hand-written `AGENTS.md` in that folder survived, with the block appended.
- [ ] The card shows `0/15 documents settled`.
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
from `approved` back to `draft` — it moves to **Needs you**, which is where a document waiting
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
- [ ] **Pause** stops new steps; a running one finishes. **Continue** picks it back up.
- [ ] Switching the CLI from the dropdown next to Start moves the steps that begin after it;
      the running one finishes on the old CLI.
- [ ] A failed step stays visible with its reason and can be retried.
- [ ] The raw output is in `~/.kortext/logs/p<id>-<doc>.log`.

---

## 5 · Review in the drawer

Open any document. Everything you can do to it is here:

| action | what happens |
| --- | --- |
| **Approve** | `draft → approved`; the chain advances and every approved reader of it is re-judged |
| select a line → **Ask** | the author persona answers, in the panel only — nothing is written |
| **Add note** → revise | the producing step re-runs with your notes; the document returns as `draft` |
| **Edit** | you write the file yourself; saving settles the demands that produced it |
| a demand (`change request`) | **Apply** re-runs the author with it, **Dismiss** closes it with your reason — decidable from either end, the document that asked or the one asked |
| `not-applicable` | the step judged the document irrelevant and said why; it satisfies dependencies like an approval |

- [ ] Ask answers about the selected passage and writes nothing to disk.
- [ ] A revision request comes back as a rewritten draft, with the answered question **gone**
      from `## Open Questions for prime` rather than restated.
- [ ] A demand ticked `- [x]` in the source document carries the outcome line beneath it.
- [ ] The brief has no producing step, so **Propose** drafts the change and you apply it.
- [ ] Approving a rewritten document raises demands on the approved documents that read it —
      or stays silent when there is nothing wrong.

---

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
| **Pause / Continue** | only whether new steps start |
| **Restart** | wipes `.kortext/` and `.kopeng/`, re-scaffolds, lands paused |
| **Archive** | a shelf: the row and the repo both stay, the card folds away |
| **Cancel** | removes what kortext wrote — `.kortext/`, `.kopeng/`, the `AGENTS.md` block, the `CLAUDE.md` pointer — and the registry row. Your own files survive |
| **Delete** (list) | unregisters only; the repo is untouched |

- [ ] Restart wipes and lands ready, not running.
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
