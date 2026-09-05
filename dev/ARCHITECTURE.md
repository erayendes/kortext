# Kortext v3.1 — Architecture

The canonical reference for what the code does today. Behaviour changes here first.

> v3.1 is the first public release. Everything before it was an unpublished personal version
> and is not referenced in this document.

---

## 1 · In one line

Kortext drives the user's own installed agent CLI (`claude` · `codex` · `gemini`) headlessly
to write a project's analysis documents in dependency order. Each lands as `draft`; prime
approves, revises or questions it in the panel. When every document is settled, kortext is
done — the documents become the project's contract and the user's own agent writes the code.
Kortext never calls an LLM API, holds no key, writes no code.

---

## 2 · Components

```
kortext (npm package, installed globally)
├─ bin/kortext.js ──► dist/index.js — parseArgs, openDb, buildApp, listen, open browser
│
├─ server/ (Express 5 + better-sqlite3, TS ESM → dist/)
│   ├─ index.ts       51  entry, CLI flags (--port --db --no-open --help)
│   ├─ db.ts          73  SQLite schema + column migration + Project type
│   ├─ app.ts        509  every REST route + static panel
│   ├─ projects.ts   262  registry, code derivation, scaffold, handover contract
│   ├─ docs.ts       322  frontmatter, request parsing, dependency ordering
│   ├─ runner.ts     598  chain, step run, revision, recheck, planning
│   ├─ readiness.ts  309  the single gate ahead of the chain
│   ├─ engines.ts     68  CLI detection + headless flags
│   ├─ cli-spawn.ts  327  shell-free spawn, abort, logging, failure classification
│   └─ pick-directory.ts 40  macOS folder chooser (osascript)
│
├─ ui/ (React 19 + Vite 7 → ui/dist/, served by the same Express)
│   ├─ App.tsx  project list · project screen · engine badge · theme · TransferPanel
│   ├─ DocDrawer.tsx  read, line-anchored chat, requests, edit, approve
│   ├─ Drawer.tsx · api.ts · markdown.ts · highlight.ts · index.css (see DESIGN.md)
│
└─ package content (embedded in prompts / scaffolded)
    workflows/ 3 · templates/ AGENTS.md + docs/ 15 skeletons · agents/ 10 personas
```

One process, one port (default **3441**). In dev the panel runs on Vite :3442 and proxies
`/api` to 3441; in production `ui/dist` is served by Express, with SPA fallback for every
non-`/api` path.

---

## 3 · Where data lives

**Global — `~/.kortext/`** (one per machine, shared by all projects):
`kortext.db` (SQLite, WAL, `foreign_keys = ON`) and `logs/p<id>-<doc>.log` (raw CLI output).

| Table | Columns |
| --- | --- |
| `projects` | `id · name · repo_path (UNIQUE) · kind (new\|existing) · code · paused · archived · doc_lang · engine · created_at` |
| `settings` | `key/value` — today just the selected engine |
| `jobs` | `project_id · doc_rel · kind (doc\|plan\|recheck) · status (running\|done\|failed\|stopped) · error · started_at · finished_at` |

`code` is the task-id prefix (`ACME-T001`), 2–8 chars, unique across projects. No migration
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

**`status`:** `uninitialized` → `draft` (engine wrote it) → `approved` (prime). Side exits:
`not-applicable` (the step judged it irrelevant; satisfies a dependency like `approved`), `log`.

**Two sections are machine-read.** `## Open Questions for prime` — non-empty means the
document is waiting on a human. `## Revision Requests` — `` - `TARGET.md` — reason `` lines,
each landing in the named document's inbox as an action in the panel. A settled one is ticked
`- [x]` with the outcome beneath it: the record stays inside the document that made the demand,
because every agent that opens it must see what the panel sees.

**The dependency graph** comes from `inputs:` / `outputs:` / `approver:` in `workflows/*.md`
(`parseWorkflowSteps`). Per document, `listDocs` computes `blocked` (an input is not settled),
`dependentOn` (approved, but an input is moving), `revisionRequests` / `sentRequests` (both ends
of a demand) and `hasProducingStep` (the brief has none — it is prime's own). Panel order is
dependency depth (`1 + max(inputs)`), memoized, with the cycle guard on the path being walked
so the diamond graph does not collapse into traversal order.

`analysisComplete` = every mapped document `approved | not-applicable`, no open questions, no
standing requests (plus a settled brief on a new project).

---

## 5 · The engine

**Selection (`engines.ts`).** Detected with `which`. The three are equals — nothing ranks them —
so the choice belongs to the project, not the app: the **Add project** form carries a dropdown
beside Initialize, and the answer is stored in `projects.engine`. `engineFor` honours it as long
as that CLI is still installed and otherwise falls back to anything that is, so uninstalling a
CLI does not strand a project. The project screen carries a quieter copy of the dropdown next to
Start — the day a quota runs out, the rest of the analysis continues on another CLI; a running
step finishes on the old one. Prompt always arrives on **stdin**, cwd is the project.

| id | command |
| --- | --- |
| `claude` | `claude --print --dangerously-skip-permissions` |
| `codex` | `codex exec --sandbox workspace-write --skip-git-repo-check` |
| `gemini` | `gemini --yolo` |

**Spawn (`cli-spawn.ts`).** Never a command string — `binary + args`, no shell, so prompt text
can never be read as a shell metacharacter. Own process group so an abort kills the tree
(SIGTERM → 1s → SIGKILL, which has to land before restart and cancel wipe the directory). A
failed spawn emits `error` **and** `close`; the first one settles the run and the second is
ignored, because ending the log twice raised an unhandled stream error that killed the server. Output goes to the log and to a 64 KiB rolling tail.
`isTransientCliFailure` / `isRecoverableCliFailure` separate retryable failures (429, quota,
network, overload, exit-0-with-no-output) from deterministic ones.

**The gate (`readiness.ts`).** No evidence, no steps.
*New project:* a **floor** first — ≥ 240 chars of real prose outside the skeleton, and which
template sections are still empty. Cheap, deterministic, un-gameable by an eager persona. Then
one engine **judgment**, cached per brief hash: one run per edit of the brief, not per approval.
*Existing project:* no brief; the code is the evidence — at least 3 source files
(`node_modules`, `dist`, `.git` and friends excluded), recounted every time.
A refused brief is demoted `approved → draft`: a document waiting on a human belongs under
"Needs you", not sitting approved next to "I cannot start".

**The chain (`runner.ts:advance`).** One loop per project. Each turn it takes the producible
steps (unwritten, inputs settled, not running), starts at most **3 in parallel**, then waits on
`Promise.race` for either a completion or a wake. Approval routes call the same `advance`; a
running loop is woken rather than duplicated, so an approval does not wait for the next
completion while the pool has room. `paused` only stops new steps; a running one finishes. The
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
A restart mid-step is settled at boot by `failStaleJobs`.

**Standing prompt rules:** write that one file and nothing else · keep the skeleton's headings
verbatim · never write `approved` · never assume what the inputs do not say — ask under
`## Open Questions for prime` · a change another document needs is a `## Revision Requests`
line, not prose · prose in the document's language, every name in English.

| Run outside a step | What it does | What it writes |
| --- | --- | --- |
| `reviseDoc` | re-runs the producing step with notes | the document (back to `draft`) |
| `proposeRevision` | drafts a change for a document no step owns (the brief) | `.proposal.txt` — read once, deleted |
| `runRecheck` | judges an approved reader against an input that moved | a verdict JSON; the server writes the demand |
| `explainDoc` | line-anchored Q&A with the author persona | nothing — the answer lives in the panel |

`recheckDependents` fires when a rewritten document is approved: every **approved** document
that reads it is judged **one at a time**, tracked like any other run, so a document eight others
read does not start eight CLIs at once and pause can stop the fan-out.

**Planning (`runPlanning`).** "Transfer to Kopeng": one long run (30 min) producing
`.kopeng/project.yaml` + `versions/` + `epics/` + `tasks/`; missing `project.yaml` or zero tasks
is a failure. **Approve plan** is the last signature of the handshake.

---

## 6 · REST surface

No fs-watch — the panel polls (docs 3s, transfer 4s, handshake 5s).

| Route | Does |
| --- | --- |
| `GET /api/health` | ok · db path · the version actually **running** |
| `GET \| POST /api/projects` | list (with per-group progress) · add (born paused) |
| `DELETE /api/projects/:id` | unregister only; files untouched |
| `GET \| PUT /api/engines` | detect the installed CLIs · the global fallback choice |
| `POST /api/pick-directory` | macOS chooser; `null` elsewhere |
| `PUT …/engine` | the CLI this project runs on |
| `GET /api/projects/:id/jobs` | last 50 + the running one |
| `POST …/run-next` | nudge the chain by hand |
| `GET …/readiness` | the gate's standing verdict + whether a check is out |
| `POST …/pause` | pause / continue (continue kicks the chain) |
| `POST …/restart` | pause, abort, wipe `.kortext/` + `.kopeng/`, re-scaffold, land paused |
| `POST …/cancel` | pause, abort, then remove what kortext wrote (`.kortext/`, `.kopeng/`, the `AGENTS.md` block, the `CLAUDE.md` pointer, the project's logs) + the row |
| `POST …/archive` | shelve — row and repo both stay |
| `GET …/docs` | document list (+ idempotent self-heal scaffold) |
| `GET \| PUT …/docs/content` | read · write as-is (refused while that document is being rewritten; an edit to an approved one rechecks its readers) |
| `POST …/docs/approve` | `draft → approved`, kicks the chain, rechecks dependents |
| `POST …/docs/propose` | returns a drafted revision for the brief |
| `POST …/docs/revise` | re-runs the producing step with notes (fire-and-forget, 202) |
| `POST …/docs/decide-request` | apply/dismiss one demand — from either end |
| `POST …/docs/explain` | line-anchored Q&A (synchronous, writes nothing) |
| `POST …/transfer` · `GET \| POST …/kopeng[/approve]` | split the work · plan summary · approve |
| `GET …/handshake` | analysis done? kopeng installed? already transferred? |

An unknown `/api` path returns JSON 404 rather than falling through to the SPA (which surfaced
as `Unexpected token '<'`). Anything a fire-and-forget route (`revise`, `decide-request`) could
refuse is answered **at call time** — otherwise the panel reports success, clears the notes and
the answers are gone.

---

## 7 · Panel

**Project list** (per-card progress, archive group) → **project screen**
(Start/Continue/Pause · Restart/Archive/Cancel · Documents · handshake card · TransferPanel when
kopeng is installed) → **DocDrawer**: read (own markdown, mermaid and highlighting), select a
line to talk to the persona, decide incoming and outgoing requests one by one, edit directly,
Approve. Destructive buttons arm in place — browsers silently suppress repeated `confirm()`.

The vocabulary splits in two: **status** (where the document is) and **badge** (what wants
attention — open question, standing request, moving input). Visual language: [DESIGN.md](./DESIGN.md).

---

## 8 · Package content

- **`workflows/` (3)** — `new-project-analysis` (13 steps: PRODUCT · STACK+STRUCTURE ·
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

`npm test` → `node:test`, **64 tests**, six files: `order` (a step cannot read a document
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
