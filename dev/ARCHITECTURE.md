# Kortext v3.1 — Architecture

The canonical reference for what the code does today. Behaviour changes here first.

> v3.1 is the first public release. Everything before it was an unpublished personal version
> and is not referenced in this document.

---

## 1 · In one line

Kortext drives the user's own installed agent CLI (`claude` · `codex` · `antigravity` · `gemini`, and
six more prepared from their documentation) headlessly
to write a project's analysis documents in dependency order. Each lands as `draft`; prime
approves, revises or questions it in the panel. When every document is settled, kortext is
done — the documents become the project's contract and the user's own agent writes the code.
Kortext never calls an LLM API, holds no key, writes no code.

---

## 2 · Components

```
kortext (npm package, installed globally)
├─ bin/kortext.js ──► dist/index.js — parseArgs, detach, openDb, buildApp, listen, open browser
│
├─ server/ (Express 5 + better-sqlite3, TS ESM → dist/)
│   ├─ index.ts      131  entry, CLI flags (--port --db --no-open --no-detach --stop --help)
│   ├─ daemon.ts      47  detached respawn + health probe (start/stop from the terminal)
│   ├─ update.ts      68  npm registry check + self-update (the panel's update strip)
│   ├─ db.ts          96  SQLite schema + column migration + Project type
│   ├─ app.ts        891  every REST route + static panel
│   ├─ projects.ts   243  registry, code derivation, scaffold, handover contract
│   ├─ docs.ts       885  frontmatter, request parsing, dependency ordering
│   ├─ runner.ts     956  chain, step run, revision, recheck, planning
│   ├─ design-preview.ts 586  DESIGN.md tokens → .kortext/DESIGN.html (swatches, contrast, light/dark)
│   ├─ readiness.ts  326  the single gate ahead of the chain
│   ├─ engines.ts    277  one spec per CLI: flags, prompt route, model, detection
│   ├─ cli-spawn.ts  300  shell-free spawn, abort, logging, failure classification
│   └─ pick-directory.ts 40  macOS folder chooser (osascript)
│
├─ ui/ (React 19 + Vite 8 → ui/dist/, served by the same Express)
│   ├─ App.tsx  project list · project screen · engine badge · theme · update strip · status bar · Milowda strip · TransferPanel
│   ├─ DocDrawer.tsx  read, line-anchored chat, requests, edit, approve
│   ├─ Drawer.tsx · api.ts · markdown.ts · highlight.ts · index.css (see DESIGN.md)
│
├─ package content (embedded in prompts / scaffolded)
│   workflows/ 3 · templates/ AGENTS.md + docs/ 15 skeletons (14 analysis + BRIEF) · agents/ 10 personas
│
└─ macos-app/ (SwiftUI, not in the npm package — see § 11)
    Kortext/  KortextApp.swift · StatusItem.swift · Model.swift · Api.swift · Theme.swift
    project.yml (xcodegen) · appcast.xml (Sparkle feed) · script/gen_appcast_item.py
```

One process, one port (default **3441**), and it outlives the terminal: `kortext` respawns
itself detached (`KORTEXT_CHILD=1`, stdio to `<db>.log`) and the parent exits, so closing the
window leaves the panel up. `--no-detach` is the foreground mode `npm run dev` uses; `--stop`
and the panel's ⏻ button are the two ways down, both refusing while a step runs. In dev the
panel runs on Vite :3442 and proxies
`/api` to 3441; in production `ui/dist` is served by Express, with SPA fallback for every
non-`/api` path.

---

## 3 · Where data lives

**Global — `~/.kortext/`** (one per machine, shared by all projects):
`kortext.db` (SQLite, WAL, `foreign_keys = ON`) and `kortext.db.logs/p<id>-<doc>.log` (raw CLI output).
With `--db /path/name.sqlite`, logs live in `/path/name.sqlite.logs/`; sibling databases stay isolated.

| Table | Columns |
| --- | --- |
| `projects` | `id · name · repo_path (UNIQUE) · kind (new\|existing) · code · paused · archived · doc_lang · engine · model · effort · created_at` |
| `settings` | `key/value` — today just the selected engine |
| `jobs` | `project_id · doc_rel · kind (doc\|plan\|recheck) · status (running\|done\|failed\|stopped) · error · notes (JSON) · started_at · finished_at` |
| `pending_rechecks` | `project_id · source_rel · reader_rel · generation` — durable work, unique per source/reader pair |
| `doc_versions` | `project_id · rel · sha · content · source (agent\|prime\|proposal\|pre-existing) · job_id` — what the drawer diffs against |

**The diff always has a baseline.** `listVersions` reports a `bodySha` beside the file `sha`:
approving rewrites `status:` and nothing else, so two versions can differ as files and be the same
document. The drawer takes the head (which must match the file on disk, or something edited it
outside the panel and no baseline is trustworthy) and walks back to the first version whose *body*
differs — otherwise approving would show "nothing changed" over a whole rewrite. Approval records a
version for that reason: without it the head stops matching the file and the diff vanishes the
moment prime approves. A picker in the diff bar reaches the older versions.

`code` is the task-id prefix (`ACME-T001`), 2–8 letters A–Z, unique across projects. No migration
framework: `openDb` creates tables `IF NOT EXISTS` and adds missing columns with `ALTER TABLE`.

**Inside the repo** — the documents themselves, under the user's version control:

```
AGENTS.md          the handover contract, as a marked block
CLAUDE.md          if it exists: a one-line pointer (the file is not kortext's)
.kortext/
├── BRIEF PRODUCT STACK STRUCTURE ARCHITECTURE SECURITY ENVIRONMENT
│   DATABASE API DESIGN GROWTH LEGAL CONTENT ENGINEERING TEST  (.md)
├── .readiness.json                    the gate's standing verdict
└── .proposal.txt · .recheck-*.json    scratch; read once, deleted
.kopeng/           only after "Transfer to Kopeng"
```

Workflows and personas are **not** copied into the repo — they go into the prompt during the
analysis, and afterwards the documents are the contract. `scaffoldProject` is idempotent and
runs whenever the panel looks at a project, so anything missing comes back. Nothing is
migrated: 3.1.0 is the first public release, so there is no project on disk written against an
older layout.

**The contract is a block, not a file.** A repo may already carry the user's own `AGENTS.md`,
so `templates/AGENTS.md` goes in between `<!-- kortext:start -->` and `<!-- kortext:end -->`:
appended when the file exists, refreshed in place when the block is already there, skipped
entirely when it is unchanged (the panel re-scaffolds on every poll). Claude Code reads
`CLAUDE.md` rather than `AGENTS.md`, so an existing `CLAUDE.md` gets one pointer line —
never a second copy of the contract, and never a file kortext invented. Cancel
(`uninstallContract`) takes back exactly that: the block and the pointer. A file that held
anything else survives; a file kortext never wrote is left alone.

---

## 4 · Document model

The file is the source of truth — no document state is kept in the database.

**`status`:** `uninitialized` → `draft` (engine wrote it) → `approved` (prime, and only prime:
an agent that writes `approved` is set back to `draft`; any other status fails the run and the
previous text is restored). Side exits:
`not-applicable` (the step judged it irrelevant; satisfies a dependency like `approved`), `log`.
The agent never writes `not-applicable` into effect: a run that ends with it is turned into a
`draft` carrying `applies: no` (`setApplies`), shown as `n/a?`, and prime's Approve — the same
button, reading *Approve n/a* — settles it as `not-applicable`. A rewrite that produces a real
document drops the key. So an n/a is a decision prime made, not one the agent slipped past.

**Three sections are machine-read, two of them as work.** `## Questions for Prime` — non-empty
means the document is waiting on a human. `## Change Requests` — one heading, two directions,
told apart by one word. `` - `TARGET.md` — reason `` is what this document asks of another; the
agent writes it while drafting, the panel lists it under Outgoing Requests, and prime presses
Accept or Discard — Accept moves it (`deliverRequests`) into the target as `` - [ ] from `THIS.md` —
reason `` with `` - accepted on THIS.md `` under it; Discard deletes it. `parseIncoming` reads
that trailer as `presumed: 'accept'`, and the panel opens the target with the row ticked — the
one person who could accept it there already did — but still unticks on request. Nothing is
rewritten until the target's own Apply, so everything owed there goes into one rewrite. An
undecided outgoing request holds approval, like an open question. (Documents approved before
requests travelled are swept on listing and land without the trailer, decided at the target.)
Accepted and written, the line is removed — the text now says what it asked for, and git keeps
the history.
Refused, it leaves the mailbox for `## Decisions`: `` - `FROM.md` — reason `` with
`prime: why · date` beneath, no box and no word like "denied" — the ledger is the word. It is
the one outcome the next writer cannot infer from the text, and the only reason it does not ask
again. (Older shapes — a ticked `denied` line under Change Requests, a `## Conflicts` section —
are still read as decisions.) Questions and requests are two groups of one list,
and one button settles them together, because both rewrite the same document and a document is
rewritten once.

The `from` lines and the `## Decisions` ledger are not the agent's to touch. The prompt says
so, and `restoreRequests` makes it so: after every agent write, any such line the rewrite
dropped is appended again, state and outcome intact. A document nobody has written yet can already hold some — they are handed to
its first write and removed afterwards, like any request that was done.

`## Findings` is read but carries no work — a problem in a file no document owns. A record for
the next writer, no buttons, no gate on the handshake.

**The dependency graph** comes from `inputs:` / `outputs:` / `approver:` in `workflows/*.md`
(`parseWorkflowSteps`). Per document, `listDocs` computes `blocked` (an input is not settled),
`dependentOn` (approved, but an input is moving), `revisionRequests` / `sentRequests` (both ends
of a demand) and `hasProducingStep` (the brief has none — it is prime's own). Panel order is
dependency depth (`1 + max(inputs)`), memoized, with the cycle guard on the path being walked
so the diamond graph does not collapse into traversal order.

`analysisComplete` = every mapped document `approved | not-applicable`, no open questions, no
standing requests (plus a settled brief on a new project).

**On request.** A step marked `- on request: yes` in the workflow (`DocStep.optional`) is one
the chain never starts: `producibleSteps` skips it, and `analysisComplete` and the project's
`docCounts` leave it out until it is *asked for* — `asked()`: a job exists for it, running,
stopped or failed, whether or not the file has been written yet, so a run paused before its
first line holds the handshake like any other document. It is scaffolded only on a project
whose workflow has the step; a project from before the step existed gets the skeleton when
`GET …/handshake` is read (`scaffoldOptional`, never a required one). It sits in To do as
`waiting · on request`. Once every other document is settled, `GET …/handshake` lists it under
`onRequest` (unless one of its inputs was ruled `not-applicable`, or it was already asked for) and the handshake card offers it with the engine control beside the button — the head's
control left with the handshake, and this one step still picks its CLI, model and effort;
`POST …/docs/request` runs the
step (refused while the project is paused — the offer's button says so), and from then on it
gates the handshake like any other document. Today there
is one: `EXPERIENCE.md`, the brief and prompts a design AI works from — new projects only,
after `CONTENT.md`; after the handshake it belongs to the project's owner.

---

## 5 · The engine

**Selection (`engines.ts`).** One `EngineSpec` per CLI: binary, headless args, how the prompt
travels (stdin, after a flag, or last and alone), the model flag or variable, a cwd flag, extra
env, a model list for the panel, and `untested` for the ones prepared from documentation only.
Detected with `which`, then `~/.local/bin`. They are equals — nothing ranks them —
so the choice belongs to the project, not the app: the **Add project** form carries a dropdown
beside Initialize, and the answer is stored in `projects.engine`. `engineFor` honours it as long
as that CLI is still installed and otherwise falls back to anything that is, so uninstalling a
CLI does not strand a project. The project screen carries a quieter copy of the dropdown next to
Start — the day a quota runs out, the rest of the analysis continues on another CLI; a running
step finishes on the old one. Beside it, the model: `projects.model`, passed after the spec's
flag (or in its variable) on every spawn, read from the row each time. cwd is the project.

| id | command | prompt |
| --- | --- | --- |
| `claude` | `claude --print --dangerously-skip-permissions` | stdin |
| `codex` | `codex exec --sandbox workspace-write --skip-git-repo-check` | stdin |
| `antigravity` | `agy --dangerously-skip-permissions --print-timeout 30m --add-dir <repo>` | `--print <prompt>` |
| `gemini` | `gemini --yolo` | stdin |
| prepared, untested | `cursor` `copilot` `opencode` `amp` `droid` `goose` `qwen` `cline` — see `engines.ts` | as each spec says |

**Spawn (`cli-spawn.ts`).** Never a command string — `binary + args`, no shell, so prompt text
can never be read as a shell metacharacter (a spec that wants the prompt as an argument gets it
only on POSIX, where no shell is involved). The child's env is the server's plus the spec's. Own process group so an abort kills the tree
(SIGTERM → 1s → SIGKILL, which has to land before restart and cancel wipe the directory). A
failed spawn emits `error` **and** `close`; the first one settles the run and the second is
ignored, because ending the log twice raised an unhandled stream error that killed the server. On SIGTERM / SIGINT the server aborts every live run before it exits — each CLI sits
in its own process group and would otherwise outlive the server and write into a document the
next server has already marked failed. Output goes to the log and to a 64 KiB rolling tail.
`isTransientCliFailure` / `isRecoverableCliFailure` separate retryable failures (429, quota,
network, overload, exit-0-with-no-output) from deterministic ones.

**The gate (`readiness.ts`).** No evidence, no steps.
*New project:* a **floor** first — ≥ 240 chars of real prose outside the skeleton, and which
template sections are still empty. Cheap, deterministic, un-gameable by an eager persona. Then
one engine **judgment**, cached per brief hash: one run per edit of the brief, not per approval.
*Existing project:* no brief; the code is the evidence — at least 3 source files
(`node_modules`, `dist`, `.git` and friends excluded), recounted every time.
A refused brief is demoted `approved → draft`: a document waiting on a human belongs under
"Action needed", not sitting approved next to "I cannot start".

**The chain (`runner.ts:advance`).** One loop per project. Each turn it fills a pool of
**3**: pending rechecks first, then the producible steps (unwritten, inputs settled, not
running); room is what the database shows running, so a revision started from the panel takes a
slot too, and `reviseDoc` waits for one instead of running as a fourth CLI — the wait is a
tracked run, so Pause aborts it and it lands `stopped` with its notes. The engine and model
are read from the project row at every spawn, so a switch in the panel reaches the next step and
the next recheck alike. The loop runs once with rechecks alone before the readiness gate — a
reader owes its verdict whatever the brief says — then with steps once the gate has passed, and
waits on `Promise.race` for either a completion or a wake. Approval routes call the same `advance`; a
running loop is woken rather than duplicated, so an approval does not wait for the next
completion while the pool has room. Pause stops new steps and aborts active runs. The
loop is claimed before the gate is awaited, so two approvals landing in the same second wake one
chain rather than starting two pools.

**Stopping is two moves, in this order.** Pause, restart and cancel all set `paused` in the
database *before* they abort the live runs. Aborting alone is not enough: the stopped steps
settle, the loop wakes, finds the same documents still unwritten and starts them again — inside
the very window the route is waiting through, leaving CLIs running for a project that is about
to be wiped. Cancel aborts once more after the row is gone, when nothing can pause the loop any
more.

**One step (`runStep`).** Open a `jobs` row → build the prompt (the workflow step verbatim +
persona body + any revision notes) → run the CLI (15 min) → validate: exit code, file actually
written, frontmatter `draft` or `not-applicable`. Otherwise `failed`, with Retry in the panel.
A restart mid-step is settled at boot by `failStaleJobs`. Revision notes are stored with the job;
Retry repeats that document and those notes, and settles matching demands only after success.

**Standing prompt rules:** write that one file and nothing else · keep the skeleton's headings
verbatim · never write `approved` · never assume what the inputs do not say — ask under
`## Questions for Prime` · a change another document needs is a `## Change Requests`
line, not prose · prose in the document's language, every name in English.

Two of them guard the record rather than the prose. **Ticked lines are load-bearing:** a `- [x]`
line and its outcome trailer must be reproduced exactly, wherever the rewrite goes — they are the
only thing that stops a settled question from being re-opened, and nothing but the prompt protects
them. **The loop brake:** a ticked line is a decision prime already made, so the same request is
not raised again unless the evidence changed, and the new line has to say what changed.

**A change request aimed at a document nobody has written yet** is not dropped and is not prime's
to decide — there is nothing to decide it against. `listDocs` still attaches it to the unwritten
target, the panel does not show it there, and `buildStepPrompt` hands it to that document's first
write. A successful write settles it in the document that asked, as `folded into the first draft`.

| Run outside a step | What it does | What it writes |
| --- | --- | --- |
| `reviseDoc` | re-runs the producing step with notes | the document (back to `draft`) |
| `proposeRevision` | drafts a change for a document no step owns (the brief) | `.proposal.txt` — read once, deleted |
| `runRecheck` | judges an approved reader against an input that moved | a verdict JSON; the server writes the demand |
| `explainDoc` | line-anchored Q&A with the author persona | nothing — the answer lives in the panel |

`recheckDependents` queues every approved reader when its source is edited or approved.
The chain runs `pending_rechecks` inside its pool, up to three at once, never two on one reader. Pause and server restarts retain unfinished
checks; Continue/Retry resumes them. A newer source change increments the generation so an older
verdict cannot clear it. Pending checks prevent analysis completion.

**Planning (`runPlanning`).** "Transfer to Kopeng": one long run (30 min) producing
`.kopeng/project.yaml` + `versions/` + `epics/` + `tasks/`; missing `project.yaml` or zero tasks
is a failure. **Approve plan** is the last signature of the handshake.

---

## 6 · REST surface

No fs-watch — the panel polls (docs 3s, transfer 4s, handshake 5s).

| Route | Does |
| --- | --- |
| `GET /api/health` | ok · db path · the version actually **running** (the status bar's dot polls it) · `companion`, true while the menu bar app has polled in the last 30 s |
| `GET /api/version` | current · newest on npm · whether the update strip shows |
| `POST /api/version/update` | run `npm install -g kortext@latest` — or `@beta` with `{tag: "beta"}`; `latest` also walks a beta back to the release; 409 while a step runs — and while it runs, every other route but `/health` answers 409, so nothing reads or writes under a package being replaced |
| `POST /api/quit` | stop the server (⏻ button, `--stop`); 409 while a step runs |
| `GET \| POST /api/projects` | list (with per-group progress) · add (born paused; takes `model` and `effort` from the picker, checked against the CLI's spec) |
| `DELETE /api/projects/:id` | unregister only; files untouched |
| `GET \| PUT /api/engines` | detect the installed CLIs · the global fallback choice |
| `POST /api/pick-directory` | macOS chooser; `null` elsewhere |
| `PUT …/engine` | the CLI this project runs on |
| `PUT …/model` | the model that CLI is told to use (`--model` / `-m`); empty = the CLI's default |
| `PUT …/effort` | reasoning effort, from the spec's `efforts`; a flag (`--effort`) or a config override (`-c model_reasoning_effort=`) |
| `GET /api/projects/:id/jobs` | last 50 + the running one + `paused`, so a panel learns of a pause made elsewhere |
| `POST …/run-next` | nudge the chain by hand |
| `GET …/readiness` | the gate's standing verdict + whether a check is out |
| `POST …/pause` | pause / continue (continue kicks the chain) |
| `POST …/restart` | pause, abort, clear `.kortext/` except `BRIEF.md` (kept verbatim), re-scaffold, land paused; preserve `.kopeng/` |
| `POST …/cancel` | pause, abort, remove all of `.kortext/` (including the brief and manual edits), the Kortext `AGENTS.md` block, `CLAUDE.md` pointer, project logs and registry row; preserve `.kopeng/` and other project files |
| `POST …/archive` | shelve — row and repo both stay |
| `GET …/docs` | document list (+ idempotent self-heal scaffold) |
| `GET \| PUT …/docs/content` | read content + SHA-256 version · write with `expectedVersion` (409 on conflict or active writer; approved edits queue reader checks) |
| `POST …/docs/approve` | `draft → approved` with `expectedVersion`; refuses open questions, stale text and active writers; refuses template lines left verbatim (409 with `placeholders`) unless `force` — the drawer lists them, each a jump to its block, and **Approve anyway** waits in the drawer's foot beside Request revision; records a version and queues reader checks |
| `GET …/docs/history[/:id]` | the recorded versions of one document · the text of one of them |
| `POST …/docs/propose` | returns a drafted revision for the brief |
| `POST …/docs/retry` | repeats the latest failed/stopped document job with its saved notes, or resumes pending rechecks |
| `POST …/docs/revise` | re-runs the producing step with notes (fire-and-forget, 202) |
| `POST …/docs/settle-requests` | one press: the answers, the accepted requests and the denials of one document, in one rewrite |
| `POST …/docs/explain` | line-anchored Q&A (synchronous, writes nothing; the thread is drawer state — a click on it reopens its box, × drops it) |
| `POST …/transfer` · `GET \| POST …/kopeng[/approve]` | split the work · plan summary · approve |
| `GET …/handshake` | analysis done? kopeng installed? already transferred? which on-request documents can be asked for? |
| `POST …/docs/request` | starts an on-request document (`EXPERIENCE.md`) — 202, the chain carries on after it |

An unknown `/api` path returns JSON 404 rather than falling through to the SPA (which surfaced
as `Unexpected token '<'`). Anything a fire-and-forget route (`revise`, `settle-requests`) could
refuse is answered **at call time** — otherwise the panel reports success, clears the notes and
the answers are gone.

---

## 7 · Panel

**Project list** (per-card progress, archive group) → **project screen**
(Start/Continue/Pause · the engine line `codex · default · high ›`, which is the control that
opens the picker · ⚙ beside the name, which unfolds Restart/Archive/Remove under the path, each
arming in place · Documents · handshake card · TransferPanel when kopeng is installed) →
**DocDrawer**: read (own markdown, mermaid and highlighting), select a line to talk to the
persona, decide incoming and outgoing requests one by one, edit directly, Approve. Destructive
buttons arm in place — browsers silently suppress repeated `confirm()`. Once every document is
settled the engine line and its controls go: kortext has retired from that project.

Two URLs reach into the panel: `/?project=<id>` opens a project, `/?project=<id>&doc=<rel>`
opens it on a document (the drawer). The menu bar app and its notifications link there; the
`doc` part is consumed on arrival so a reload lands on the project, not the drawer.

**Add project** picks the engine the way the project screen does — the same picker, with no
project yet: picks stay local and go with Initialize (`model` and `effort` in the create body).

The chrome around it. The **header** carries the wordmark (one PNG per theme), the no-CLI
warning when there is nothing on the `PATH`, and at the far right one cycling **theme** button
(auto → light → dark, remembered in `localStorage`, no attribute meaning auto). Under the heading of either screen the
**update strip** appears only when npm carries a newer version on the running channel and
kortext runs from a global install — one check owned by `App` (`useUpdate`), asked of
`/api/version` on open and hourly, while the server asks the registry's dist-tags at most
hourly; **Update now** calls `/api/version/update`, and afterwards the strip offers **Quit**
(`/api/quit`), because the process on screen is still the old one. The channel is read from
the running version — a pre-release is beta, anything else stable — and `isNewer` orders
`beta.3 < beta.4 < 3.2.0`. The same slot carries the **companion strip** — "Kortext can live in your menu
bar", **Download for macOS**, × — on a Mac, only while `/api/health` reports no companion, and
never beside the update strip: one strip at a time, the update first. At the bottom, an application
**status bar** (34px, never wrapping), two lines. The first names the running channel —
*Stable version 3.1.2* or *Beta version 3.2-beta3*, the short form of `pretty()`; a press
asks `/api/version?fresh=1` and says *up to date* for three seconds or raises the strip — and
the ⏻ button: green while `/api/health` answers, red the moment it stops and green again on
its own when it comes back, two clicks to stop, no `confirm()`; the restart command follows as
a click-to-copy chip once the server is down. The second line starts with the other channel —
*Try beta version 3.2-beta3* or *Use stable version 3.1.2*, or *No beta version right now* — a
press installs it (`{tag}`) and the strip takes it from there, downgrades included; then the
bug report and the support link. Opposite, the Milowda credit, a popover that lists the other
tools only when clicked.

The **Milowda strip** names those tools once more where there is room: six cards under the
project list, and on a project screen one full-width slide under the documents that advances
every seven seconds and holds while the pointer is on it. Its × hides both for good (`localStorage`, two clicks —
the second is not undoable from the panel, so it asks in red).

The vocabulary splits in two: **status** (where the document is) and **badge** (what wants
attention — open question, standing request, moving input). Visual language: [DESIGN.md](./DESIGN.md).

---

## 8 · Package content

- **`workflows/` (3)** — `new-project-analysis` (13 workflow entries, expanded into 14 document runs: PRODUCT · STACK+STRUCTURE ·
  ARCHITECTURE · SECURITY · ENVIRONMENT · DATABASE · API · DESIGN · GROWTH · LEGAL · CONTENT ·
  ENGINEERING · TEST) · `existing-project-analysis` (no brief, the code is the evidence) ·
  `planning-pipeline` (the Version → Epic → Task split contract).
- **`templates/`** — `AGENTS.md` · `docs/` 15 skeletons, `BRIEF.md` among them.
- **`agents/` (10)** — architect, compliance-expert, copywriter, db-admin, designer,
  devops-engineer, growth-expert, product-manager, qa-engineer, security-engineer.

Each persona's `Upstream:` line must match its step's `inputs:` exactly; `test/order.test.ts`
enforces that and the ordering.

---

## 9 · Verification

`npm test` → `node:test`, **86 tests**, nine files: `daemon` (health probe, detached respawn) ·
`update` (release order, the self-update lock) · `release` (concurrent edits, approval, durable rechecks, retry, aliases and log isolation),
`order` (a step cannot read a document
written after it; personas match their step; skeletons keep both required sections) · `docs`
(frontmatter, request parsing, open questions, ordering) · `runner` (producibility, prompt
assembly, job lifecycle, nothing starts after an abort) · `readiness` (floor threshold, template recognition, source counting)
· `projects` (code derivation and collision, scaffold, contract block: install · refresh ·
uninstall, archive/remove) · `highlight`.

CI (`.github/workflows/kortext-ci.yml`, `main` + `v*`) on Node 22: typecheck both sides → test →
build → `node dist/index.js --help` smoke.

---

## 10 · Deliberate absences

- **No orchestration** — no worker pool, chainer, gate engine, worktrees, model assignment,
  Slack/Telegram. Kortext runs the analysis; the user's own agent writes the code.
- **No MCP server, no request queue, no report generation.** During the analysis no external
  agent talks to kortext.
- **No LLM API call, no key** — the user's own CLI and their own subscription.
- **No dependency on Kopeng** — just `which kopeng`; the transfer button hides when it is absent.
- **No fs-watch** — polling costs a few seconds and avoids per-platform event behaviour.
- **No authentication** — `localhost` only, one user's machine.

---

## 11 · macOS companion

A menu bar app, `macos-app/`, that is a plain client of the REST surface above — the server gained
`companion` on `/api/health` and `paused` on `/jobs` for it, nothing else. It is not in the npm
package; it ships as a notarized `Kortext.zip` on the GitHub release and keeps itself current
through Sparkle (the feed is `appcast.xml` on the orphan branch `appcast`, written by the
release workflow; `macos-app/appcast.xml` is the empty channel it starts from). Without it kortext
works in full; without kortext it says so and copies `npm i -g kortext`. Opening the app starts the
server when it is down, without opening a browser; stopping the server never quits the app.

**What it shows.** The K mark in the menu bar, dimmed while the server is down, with a count
of decisions waiting. Its panel — `NSPanel` under the icon, centred, `hudWindow` / `popover`
material, closed by a click elsewhere or Esc — is one card per project with rows for the
documents the panel would list under *Action needed* and *Doing*, wearing the panel's own
badges from the server's `section · state · detail`: `approve`, `review`, `recheck`, `failed`,
`writing…`, `reading…`. A row that needs you opens the panel on that document; a row in flight
is grey and inert. The list scrolls once its estimated height would outgrow the screen — the
panel is sized when it opens, so the height is counted, not measured. The status bar is the
panel's: ⏻ (green up, grey down; first press arms, second stops the server — the app stays;
down, it starts the server without opening a browser; while the command runs and health has
not answered, a spinner and *starting…* / *stopping…* stand in, disabled — the command runs off
the main thread so the panel never freezes), *open panel*, and the credit. The message cards
act: *not running* starts the server, *no project* and *nothing waiting* open the panel. Settings,
behind the wordmark or ⚙, one card of rows: launch at login,
notifications, **Stable version** and **Try beta version** (each row shows npm's newest for
its dist-tag — `latest`, `beta` — and whether that is what runs here: *up to date* / *not
installed* / *No beta version right now*; pressing a row installs its version through the
daemon, downgrades included, restarts the server, then asks Sparkle about the app — Sparkle
allows the `beta` channel only while the running package is a pre-release, so the app follows
the package's channel and never needs a switch of its own), report an issue, support, quit. Under it the bar's twin: the theme cycles
auto → light → dark where ⏻ was, the credit opposite. Everything pressable shows the hand
cursor; SwiftUI's `Link` is inert in a non-activating panel, so links open by hand. After an
install the app stops and restarts the server itself and waits for `/api/health` to answer.

**Notifications.** `UNUserNotificationCenter`, from poll deltas, in the project's `doc_lang`:
a step `running → done` (ready — awaiting approval), `running → failed`, a brief the gate sent
back, a chain that settled. Each carries `project` and `doc` and opens the panel there. Nothing
on start, revision, recheck or the server going up or down — those live in the icon.

**Finding kortext.** A GUI app's `PATH` knows nothing of npm; the app runs `kortext` through
`zsh -lic` so `.zprofile` (Homebrew) and `.zshrc` (nvm, fnm, volta) both count. Every request
carries `User-Agent: Kortext-mac/<version>`; that is the companion signal.

**Release.** `.github/workflows/macos-release.yml`, on the same `v*` tag as npm: xcodegen →
Release build → Developer ID signature inside-out (Sparkle's XPCs first, no `--deep`) →
notarize and staple → `Kortext.zip` → `sign_update` → a new item in `appcast.xml` on the
`appcast` branch → attached to the tag's release. A pre-release tag (`v3.2.0-beta.1`) goes to
npm's `beta` dist-tag and a GitHub pre-release; its build number sits under the final's. Secrets: the Developer ID p12, the App
Store Connect API key, the Sparkle private key. Build number `major·10⁶ + minor·10³ + patch`.
