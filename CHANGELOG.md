# Changelog

All notable changes to Kortext are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Kortext adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Document order re-derived a second time, on one rule: a document is placed
  where it can be *read*, not where it can *judge*.** `SECURITY.md` moves ahead
  of the environment, the schema and the endpoints, because the auth model it
  defines is what all three are built on — retrofitting it changes tables and
  routes, while a security rule written slightly early is corrected by a
  revision request. `ENVIRONMENT.md` moves ahead of `DATABASE.md`, so the schema
  is designed for the engine, instances and region that actually host it.
  `GROWTH.md` moves to the judgement block after `DESIGN.md`, so measurement
  instruments surfaces that exist instead of a brief. The new chain:
  BRD, PRD, STACK, STRUCTURE, ARCHITECTURE, SECURITY, ENVIRONMENT, DATABASE,
  API, DESIGN, GROWTH, LEGAL, CONTENT, TRD, TEST, PFD.
- **Existing-project flow: `CONTENT.md` now follows `GROWTH.md` and
  `LEGAL.md`.** It declared both as inputs while running before either, so the
  copy rules were written against two documents that did not exist yet.
- **Personas match the chain again.** Nine of eleven declared an upstream the
  workflow never gave them — the PRD claimed to derive from LEGAL and GROWTH,
  DESIGN from CONTENT, SECURITY from LEGAL while never reading ARCHITECTURE,
  CONTENT never reading DESIGN, TEST never reading LEGAL. Every `Upstream:` and
  prerequisite line is now the step's own input list.

### Fixed

- **The PRD skeleton stopped asking for documents that do not exist.** Its
  first section held `[Legal to-dos]`, `[Growth to-dos]` and `[Content to-dos]`
  — three placeholders for documents written five to six waves later, which the
  product manager could only leave in brackets. Where a later document needs
  the PRD changed, that is a revision request. In their place: `Scope`,
  `User Types` and `Personal Data per Flow` — the last one is the list the
  compliance analysis is run against, which the step prompt demanded and the
  skeleton had no home for.

- **Ten more skeletons stopped asking for what they had no room for.** The same
  audit run against every template: a step prompt demanded something the
  skeleton gave no home, so the agent either invented a structure or dropped it.
  `SECURITY.md` gains the auth and authorization model the schema and the
  endpoints are built on, plus secret management and logging — its audit
  sections move below and are marked as the existing-project half.
  `ENVIRONMENT.md` gains the hosting region compliance rules on, and the engine
  and region the schema is designed for. `DATABASE.md` gains a personal-data
  column roll-up and a `[PII]` marking convention. `STACK.md`'s third-party
  bullets become a processor table with region and "sees user data". `API.md`
  gains a per-endpoint authorization line. `DESIGN.md` gains the surface and
  component inventory that `CONTENT.md` writes into and `GROWTH.md` measures.
  `CONTENT.md` gains a page-copy section and the legal notices it is told to
  write rather than reference. `TEST.md` gains compliance and risk gates.
  `TRD.md` gains the decisions it merges and the table where a compliance ruling
  against the design is resolved. `PFD.md` gains the collected decision log that
  replaced `DECISIONS.md` in 5.0.0 and never had a home, plus risks,
  dependencies and the task headings planning starts from — and its two
  reference lists, which named four of six inputs and five of twelve documents,
  are now complete.

- **Sections moved to the document that owns them.** `STACK.md` was choosing the
  architecture pattern that `ARCHITECTURE.md` exists to choose, and naming a
  cloud provider and CI/CD platform that `ENVIRONMENT.md` owns — a wave-2
  document deciding for a wave-3 and a wave-5 one. Both sections are gone;
  containerization stays as the local runtime it actually is. `ENVIRONMENT.md`
  gains the CI/CD pipeline and branch strategy its own prompt asked for and had
  no room for. `STACK.md` gains `Prerequisites from prime` — the planning flow
  scans it to raise `assignee: prime` tasks, and it had nowhere to read them
  from. `LEGAL.md` gains the data lifecycle its prompt names — retention,
  erasure, third-party sharing, one row per marked column — and the notices
  `CONTENT.md` is told to write. The brief's title says what the file is
  (`Project Brief (BRD)`) instead of `Product Roadmap & Vision`.

### Fixed

- **Sending the brief back for revision left the project stuck.** "Send back for
  revision" re-runs the step that wrote the document — and no step writes the
  brief, which is prime's own. The route marked the request handled, set the
  brief to `draft` and fired a call that returned "no producing step" into a
  discarded promise; the panel got a 202 and reported that work had started.
  Nothing had. The brief sat in `draft` with its request already consumed, so
  GROWTH and LEGAL stayed blocked forever and the handshake could never
  complete. Both revision routes now refuse a document no step produces, before
  touching anything, and the panel offers Edit instead of a button that cannot
  work. A refusal that never reached a job row now leaves one, so a fire-and-
  forget call can no longer fail in silence.
- **The panel listed the documents in traversal order, not dependency order.**
  `listDocs` walked the graph with one `seen` set shared across sibling
  branches, so the second branch to reach a shared input scored it 0 — and this
  graph is a diamond where nearly everything descends from the PRD. The list
  read `PRD, ARCHITECTURE, DESIGN, STACK, …` with DATABASE ahead of ENVIRONMENT
  and API ahead of DATABASE. The walk is now memoized per document, with the
  path being walked as the cycle guard, and the panel reads
  `PRD, STACK, STRUCTURE, ARCHITECTURE, DESIGN, GROWTH, SECURITY, ENVIRONMENT,
  DATABASE, API, LEGAL, CONTENT, TRD, TEST, PFD`. The bug predates this
  release; the re-derived chain is what made it visible.

### Added

- **The brief's revision gets drafted, not demanded.** A document another one
  has asked to change, that no step produces, now offers **Draft the change**:
  the engine reads the document and the requests, writes a full revised version
  to a scratch file, and the panel loads it into the editor unsaved. Nothing
  reaches the document until the human presses Save — the brief is the one
  input the chain never writes, and letting an agent write it would put the
  readiness gate in the position of judging its own output. So the agent
  proposes and prime decides, which is the same boundary with the typing taken
  out. Offered only where a revision request is open; the gate's own questions
  are still answered by a person.
- **A guard for the order.** `test/order.test.ts` fails when a workflow step
  reads a document written after it, when a persona's declared upstream differs
  from the input list its step gives it, and when a skeleton is missing the
  revision inbox or the open-questions section the mechanisms depend on.

## [5.0.0] - 2026-09-01

**v1.0 — the active project brain.** Full vision rewrite (dev/DECISIONS.md
§20): during analysis Kortext is ACTIVE — it drives your own agent CLI
(claude / codex / gemini) headlessly itself, so you never leave the panel.
On handshake completion Kortext retires; from then on it's you and your
client, governed by the approved docs and the `AGENTS.md` handover
constitution. The v3 engine stays archived under `docs/codes/`.

### Added

- **Readiness gate**: one gate at the head of the chain, so evidence that says
  nothing produces nothing. A new project is judged on its brief — a countable
  floor (skeleton lines and template placeholders are not content), then one
  engine judgment cached per brief version; an existing project on whether
  there is code to read. Blocked, the panel shows what the brief must answer
  instead of the documents it would have invented. A missing agent CLI reports
  through the same card rather than leaving Start to do nothing.
- **Scope before writing**: every workflow step carries an `n/a when`
  condition (LEGAL, GROWTH, CONTENT, DESIGN, DATABASE, API), phrased against
  the brief for a new project and against the code for an existing one. The
  step prompt decides scope first: when the condition holds the document lands
  `not-applicable` with its reasoning — a complete outcome, not a gap. What the
  inputs do not say, no document may assume.
- **Interface language in the brief**: a required section naming the language
  the product speaks to its users, and the default when there is more than one.
  It settles what CONTENT is written in, which market LEGAL covers, which
  language GROWTH optimizes for. `CONTENT.md` gains a Localization section.
- **Archive**: a project can be shelved rather than removed — the row and the
  repo both stay, and the panel folds archived projects into their own
  collapsed group instead of growing the grid forever.
- **Language split**: document prose follows the brief; section headings, code,
  identifiers, file names, commands, environment variables, table and column
  names, API paths, branch and commit conventions stay English always. Product
  copy follows the product's own interface language.
- **Analysis engine (Phase A)**: dependency-gated chain over workflow
  `inputs/outputs/approver` metadata; spawns the selected agent CLI headless
  (prompt over stdin, cwd = repo), validates exit/output/frontmatter, lands
  every document as `draft`. Up to 3 independent steps in parallel; an
  approval mid-run wakes the chain. Jobs table with stale-fail on boot and
  Retry.
- **Engine picker**: auto-detects installed CLIs (`claude`, `codex`,
  `gemini`), selectable in the header; install hints when none found.
- **Sealed layout** (§20): `.kortext/` flat root (ARCHITECTURE, STACK,
  STRUCTURE, API, DATABASE, SECURITY, DESIGN, TEST, LEGAL, GROWTH, CONTENT,
  ENVIRONMENT) + `foundation/` (BRD, PRD, TRD, PFD); `not-applicable` settles
  a dependency with reasoning. No decision log: a decision is recorded in the
  document it shapes, and the ones taken after the handshake are the client's.
- **Document review**: line-token viewer with wrapped-line merging; inline
  line thread — select a line, converse with the author persona (ephemeral,
  never saved) or drop notes; batched notes re-run the producing step.
  Action-first ordering; collapsible Core/Foundation groups.
- **Handshake screen**: completion card, copyable client starter commands,
  Kopeng promo when kopeng is absent.
- **"Kopeng'e aktar"**: one plan job splits the work into `.kopeng/`
  (project.yaml, versions/, epics/, tasks/ with rich bodies — description,
  functional requirements, user flow, UI requirements, technical notes,
  acceptance criteria; `assignee: ai|prime`, `blocked_by`/`blocks`);
  plan summary + Approve/Revise plan in the panel. The `.kopeng/` layout is
  the draft contract kopeng will adopt.
- **Add-project form**: New/Existing mode toggle (= workflow choice), native
  folder Browse, project code field, brief write/upload tabs — a user-written
  brief lands approved and the chain starts immediately.

### Changed

- A brief written in the add form lands **approved only if it can start the
  analysis**; a thinner one lands as a draft, so the panel never shows an
  approved BRD next to "not enough to start". `Add` is now `Initialize`, and
  `Insert example` joins the Write/Upload tab group as `Example`.
- The document skeletons drop the unused `reviewer:` frontmatter slot; nothing
  ever read it. The three foundation skeletons (PRD, TRD, PFD) gain the
  `approver:` their workflow step already declared.
- `Example` hands over a `BRD.md` to edit and bring back through Upload instead
  of overwriting the editor, and switches to the Upload tab so the round trip is
  visible. It carries no frontmatter — kortext writes that on Initialize.
- Archive asks before it acts, like Restart and Remove, and the three project
  actions are separated and coloured by what they cost: restart blue, archive
  green, remove red.
- **Documents language** is a project setting on the add form. An existing
  project has no brief to take a language from, so every document came out in
  the repository's language — English, in practice. When set it overrides the
  inputs, the repository and the README; code, names and headings stay English
  as before.
- **Initialize judges nothing.** A brief written or uploaded in the form lands
  approved — submitting your own brief is the approval — and is not read until
  the chain is first entered. The gate is what reads it, and a refusal demotes
  it back to a draft, so it lands under Needs you with the questions instead of
  sitting approved next to "not enough to start". Re-approving it asks again.
- Saving a document re-enters the chain, so editing the brief re-runs the gate.
  Editing the brief is the way out of a closed gate, and only approving one
  triggered a re-scan, so a corrected brief sat behind its old verdict.
- **The whole chain was re-derived from what each document actually needs.**
  `PRD` is written from the brief alone (which now carries audience, language,
  KPIs and scope), `GROWTH` instruments the flows the PRD defines rather than
  guessing them, `SECURITY` defends the boundaries `ARCHITECTURE` draws instead
  of advising a stack generically, `DATABASE` reads those boundaries too,
  `ENVIRONMENT` knows which secrets exist, `DESIGN` comes before `CONTENT`
  because copy is written into components, and `TEST` reads `LEGAL` so the
  gates prove the obligations rather than only the features. The new-project
  flow resolves into nine dependency waves; the existing-project flow gets the
  same treatment, where the PRD is reverse-engineered from the whole technical
  surface rather than from the folder layout alone.
- **Compliance is written after the design, not before it.** `LEGAL.md` used to
  run second, with only the brief to go on, and then answer questions that are
  technical: where the data is hosted, which third parties touch it, which
  fields are stored, what measures exist. It now runs after STACK, SECURITY,
  DATABASE and ENVIRONMENT and takes all of them as inputs, so it rules on the
  system as designed and names the document that must change when the design
  breaks an obligation. `PRD.md` no longer waits on it. `ENVIRONMENT.md` moves
  into the technical block (it was stranded after the consolidation step), and
  `TRD.md` takes `LEGAL.md` as an input so a contradiction is resolved or
  carried as a named risk. Both workflows follow the order.
- Emphasis (`*italic*`, `_italic_`) renders instead of showing its markers, and
  an Open Questions section with nothing in it is not shown at all.
- The line thread: a textarea rather than an input (Enter sends, Shift+Enter
  writes a second line), the buttons under the field with Ask as the primary,
  and both sides labelled — `prime` asks, the engine answers under its own name.
- A document with open questions **cannot be approved** until they are answered
  or removed, and the drawer says so. Approving one would bury the question
  under a green badge.
- The document list drops the `(core)` / `(foundation)` label — the group
  heading already says where a document sits — and the gate says it is reading
  the BRD, which is the file it is actually reading.
- Two documents can be answered at once. A revision refused while *any* step
  was running, and the route reported success anyway — so answering the second
  of two documents that both asked something cleared the notes, closed the
  drawer and did nothing. A revision now blocks only on the document it
  rewrites, and a genuine refusal reaches the panel with the notes intact.
- **Markdown renders.** Only `- ` counted as a bullet, so a document written
  with `*` fell through to paragraphs full of literal asterisks — which the
  wrapped-line merge then glued into one wall of text. All three bullet
  characters, indented items and numbered lists are now blocks of their own.
- **Revision Requests** turn a demand into an action. A document that finds a
  problem in one already written names it under `## Revision Requests` with the
  target file in backticks; the panel routes each line to that document's own
  inbox, marks its row `changes asked`, and offers **Send back for revision**
  (un-approve, hand the demands over as the revision notes) or **Dismiss**. The
  handshake does not complete while any stands. Without this the late-compliance
  order was a promise with nothing behind it: a consolidation could rule that a
  document must change and nothing would ever act on it.
- **Open Questions for prime** is a section every skeleton carries and every
  step writes into, so a document that is still waiting on an answer is one
  scan away: the row carries an `asks you` chip, the section is tinted in the
  document, and the handshake does not complete while any question is open.
  `+prime` reads as `prime` in document text; the frontmatter keeps its marker.
- Archived cards carry their own **Unarchive**, so getting a project back does
  not mean opening it first.
- Pause shows while the gate is reading the brief — that is work in flight too.
- **Check again** reports that it ran instead of looking like a dead button.
- A project **code** belongs to one project until that project is removed.
- The PRD, TRD and PFD skeletons drop the v3 "Per-file discipline" note: no
  engine generates timestamped copies any more, the skeleton is the document.
- The footer carries the **running** version, so an upgrade the process never
  restarted for is visible instead of looking like a missing fix.
- Adding a folder that is already registered says which project holds it, and
  whether that project is archived, instead of surfacing the SQLite constraint
  name.
- The document list's last group is **Not applicable** rather than Reference:
  the group existed to hold the decision log alongside skipped documents, and
  with the log gone it holds one kind of thing and should say so.
- The Start/Pause button follows what is actually happening rather than the
  paused flag: Pause only while a step runs, Start or Continue whenever the
  chain is stopped — including a chain the gate refused — and nothing at all
  once every document is settled. The nav line says which of those it is.
- A closed gate with no brief to open — an existing project, or a missing CLI —
  offers **Check again** rather than ending in a dead end.

### Removed

- **`DECISIONS.md`** — the decision log covered decisions taken along the way,
  and the way starts after Kortext retires, so it owned a file it could only
  fill during analysis and then had to hope someone else kept. A decision now
  lives in the document it shapes, and `foundation/PFD.md` carries the
  consolidated list. A legacy `memory/decisions.md` is still migrated rather
  than deleted.
- **Reports** (routes, generation, templates) — no reports feature in v2.
- **Agent-facing surface**: MCP server (`/mcp`), `/api/agent/*` REST
  fallback, request queue (`requests` table dropped on migration) — the
  external agent no longer talks to Kortext during analysis; Kortext drives
  the engine itself, and after the handshake the repo files are the whole
  interface.
- `@modelcontextprotocol/sdk` and `zod` dependencies.
- Plan/TODO leftovers (`backlog.yaml` + `TODO.md` gate) — replaced by the
  `.kopeng/` split.

## [3.1.0] - 2026-06-06

**Onboarding overhaul + CLI redesign.** Single large release that bundles Phases
11-13 (merged on `main`, never published because `kortext@3.0.0` shipped with an
EADDRINUSE silent-fail bug) plus the UI UAT polish round and the per-project-port
CLI redesign decided in
[development/DECISIONS.md Bölüm 0](development/DECISIONS.md).

### Added

- **Per-project-port CLI** (v3.1). New 9-command surface — `start` / `stop` /
  `pause` / `list` / `remove` / `purge` / `update` / `doctor` / `help` — backed by
  a global registry (`~/.kortext/projects.json`, atomic temp-file + rename writes)
  that maps each project to a stable port (3200+) and tracks one detached
  prod-mode daemon per project (spawn / pid-liveness / kill). Multiple projects
  run in parallel and survive restarts (bookmarked ports stay stable). `remove`
  drops the registry entry but keeps `.kortext/` on disk; `purge` deletes it after
  a confirmation prompt. The legacy mock-executor workflow runner moved off the
  main surface to `kortext dev:run <workflow-id>`; `serve` / `init` remain as dev
  commands. Friendly postinstall pointer that never blocks `npm i -g`.
- **UI UAT polish** (board data wiring). Epic column (`?limit=500`), assignee
  derivation (`assigneeOf`), semver-sorted version filter with smallest-unfinished
  default, Dashboard activity timeline (`GET /api/activity`), in-app "New task"
  form (POST accepts `version`), item comments (drawer + timeline share one feed),
  working Assignee filter, Agents panel (active-agent derivation with status),
  refreshed persona icon set, and dependency display (`dependenciesOf` + drawer
  Dependencies section).
- **`.kortext/` encapsulation** (Faz 12.1). All framework files live under
  `.kortext/` (`.git/`-style), keeping the project root clean — only
  `AGENTS.md`, `.env*`, `.gitignore` remain at the top level.
- **Global runtime** (Faz 12.2). `agents/`, `workflows/`, `rules/` are now read
  directly from the installed `node_modules/kortext/` package, no longer copied
  per project. `kortext init` only seeds `templates/` content. Package upgrade
  automatically propagates updated personas/workflows.
- **`templates/` package** (Faz 12.3). 38 skeleton files seeded by `init`:
  `AGENTS.md`, `.env.example`, `.gitignore`, `foundation/{BRD,PRD,TRD,PFD}.md`,
  `backlogs/{B,D,E,H,S,T}XX-*.md` (6 templates), `memory/{handover,decisions,
  learned}.md`, `references/` (13 ALL-CAPS files), `reports/` (8 scope
  templates).
- **`.kortext/foundation/` category** (Faz 13). New directory for analysis
  phase's frozen outputs: `BRD.md` (Business Requirements / blueprint),
  `PRD.md` (Product Requirements), `TRD.md` (Technical Requirements), and
  `PFD.md` (Product Foundation — consolidated analysis report). Separate from
  `references/` (canonical, lived-with) and `reports/` (per-run records).
- **ALL-CAPS references rename** (Faz 13). 13 reference files now use the
  canonical-source signal pattern: `ACCESS.md`, `API.md`, `CONTENT.md`,
  `DATABASE.md`, `DESIGN.md`, `ENVIRONMENT.md`, `GLOSSARY.md`, `GROWTH.md`,
  `LEGAL.md`, `SECURITY.md`, `STACK.md`, `STRUCTURE.md`, `TEST.md`. ALL-CAPS
  matches AGENTS.md / README.md / LICENSE convention.
- **Per-file reports + `reports_index`** (Faz 12.5). Monolithic
  `test-reports.md`, `delivery-reports.md`, etc. split into per-file
  `<scope>_<slug>_<YYYY-MM-DD-HHMM>.md`. SQL table `reports_index`
  (`id, scope, slug, file_path, author, status, tags, related_item,
  created_at`) backs filter/sort/search. `outputIndexer` automatically
  populates the index on every successful step.
- **Output placeholder syntax** (Faz 13). Workflow body can declare
  `outputs: .kortext/reports/test-reports_<slug>_<ts>.md`;
  `server/engine/output-resolver.ts` resolves `<slug>` → `[a-z0-9][a-z0-9-]*`
  and `<ts>` → `\d{4}-\d{2}-\d{2}-\d{4}` at runtime. 4 CLI executors and
  worker-pool safety guards wire through the resolver.
- **Workflow/persona SQL index** (Faz 12.8). New tables `workflow_steps`
  (with `step_index, phase, persona_handle, approver, parallel_with_json`)
  and `personas` (with `handle, source_path, body_md`). Markdown remains the
  source of truth; engine boot parses and upserts. Parse-time FK validation:
  unknown `+ajan` reference is a fatal throw. `+prime` synthetic row added
  at boot (no `agents/prime.md` file).
- **Handover rotation + TOC engine** (Faz 12.6). `handover.md` rotates at 5
  entries or 30 KB threshold; previous content moves to
  `handover-<YYYY-MM-DD-HHMM>.md` in the same directory. TOC engine
  (`markdown-sync.writeDecision/writeLearned` → `toc-updater.updateToc()`)
  maintains `## İçindekiler` sections atomically. `kortext archive handover`
  CLI for manual trigger.
- **Prompt cache discipline** (Faz 12.7). `claude-cli-executor.ts` sends the
  persona body via `--append-system-prompt` (stable prefix) and per-step
  runtime data (runId, stepId, timestamp) via user message. Net effect:
  ~90% input-token reduction on cache hits.
  `--exclude-dynamic-system-prompt-sections` skips the user's global
  `~/.claude/settings.json` dynamic prompt.
- **Onboarding wizard** (Faz 11). Single-page form in the dashboard: project
  name, project code (slug A-Z0-9, 2-6), project type (new/existing), target
  platform chips, blueprint markdown dropzone (≤100KB), GitHub repo
  (optional), executor selection (Mock/Claude/AGY + binary path). Submit
  posts to `/api/blueprint` → writes `.kortext/foundation/BRD.md` +
  `.kortext/project.json` → triggers the workflow chain.
- **Backlog UI + readonly editors** (Faz 12.9). Board screen with 6 status
  columns (Epic / To Do / In Progress / Test / Review / Done) and
  `+ New Item` modal. Settings panes (Agents/Rules/Workflows) render markdown
  read-only (writable editor deferred to v3.2).
- **`kortext archive` subcommand** (Faz 12.6). Manual handover rotation
  trigger; complements the automatic rotation in the maintenance cycle.
- **Per-step output safety wiring** (Faz 13). `outputIndexer` callback slot
  in `SafetyGuards` keeps the engine-adapter boundary clean: worker-pool
  doesn't import the reports indexer directly; `server/index.ts` boot wires
  the optional callback.

### Changed

- **Workflow lifecycle redesign** (DECISIONS Bölüm 5). The development/test
  lifecycle was reworked around an engine-owns-mechanics model: columns
  `to_do → in_progress → test → review → done` (no `merge` column); 5
  planning-selected gates (`code_review`, `quality_control`, `security_control`,
  `design_review`, `uat`) run in parallel in `test`, the engine joins them;
  `assignee` (developer) stays fixed for the item's whole life. `development-cycle`
  shortened to end at `test`; `deployment-cycle` reframed as an environment
  ladder (item→dev, epic→staging, version→preprod, approval→main+prod).
  Engine/schema implementation deferred (DECISIONS §5.9).
- **`incident-pipeline` split into `rollback-pipeline` + `hotfix-pipeline`.**
  The merged pipeline used mutually-exclusive paths joined at a shared closing
  step via multi-producer fan-in; since the engine only counts `succeeded`
  steps as done, the non-selected path stayed skipped and the closure
  deadlocked. Split into two independent straight-line flows (no conditional
  branch needed); path chosen by `!rollback` / `!hotfix`. Found by 15-agent
  adversarial verification (DECISIONS §5.12).
- **Honest workflow chain markers.** Four workflows (`test-cycle`,
  `deployment-cycle`, `spike-pipeline`, former `incident`) had `Sonraki akış`
  lines the parser silently dropped (prose before the backtick → null). Their
  transitions are conditional by design (milestone/approval-gated), so they were
  rewritten as `**Sonraki:**` notes stating "conditional, engine job (§5.9), not
  auto-chain". Working autonomous chain unchanged: analysis → planning →
  environment-setup → development-cycle → test-cycle.
- **Workflow gate detection** (Faz 13). Replaced `> [!NOTE] RAPOR HAZIR`
  callout-based gates with approver-based detection. Parser now reads
  `step.approver === '+prime'` from the step's sub-bullets and auto-generates
  the gate in `flushStep()`. Callout blocks are consumed and ignored
  (backward-compat shim) but no longer produce gates. Result: single signal
  source (sub-bullet only), less prompt-token noise, callout-cosmetic-vs-gate
  ambiguity resolved.
- **`docs/` → `development/` rename** (Faz 13). Internal docs folder renamed
  to reflect "developer-side documentation" intent. 22 old files consolidated
  into 6 canonical docs + `concepts/`: `ARCHITECTURE.md`, `DECISIONS.md`,
  `DESIGN.md`, `HANDOVER.md`, `TODO.md`, `UAT-GUIDE.md`. `development/` is
  codebase-only — excluded from the npm package via `.npmignore`.
- **Frontmatter standards** (v3.1 spec §5). 4 separate frontmatter standards
  by file nature: References (`status, author, reviewer, approver`), Reports
  (`status, author, reviewer, updated_at`), Handover (entry-level frontmatter
  per `## Handover: <id>` block), ADR + Learned (section-level header + TOC
  auto-update).
- **`reviewer:` workflow lines removed** (Faz 13). 2 pre-existing `reviewer:
  +X` lines (design-system, api-reference) were passive metadata — engine
  doesn't run reviewers at runtime. Removed to clear noise. Agent-to-agent
  review pattern deferred to v3.2.
- **`approver:` discipline tightened** (Faz 13). Gate-producing files
  (blueprint, LEGAL, GROWTH, PRD, CONTENT, STACK, DESIGN, PFD, etc.) keep
  `approver: +prime`. Metadata-only files (SECURITY, DATABASE, API, TRD,
  TEST) had `approver:` removed entirely — engineering-manager records them
  without a `+prime` gate.

### Removed

- **`maintenance-cycle` workflow** (DECISIONS §5.12). Its outputs (debt review,
  new debt/bug, dependency/security scan results) all flow into planning +
  backlog + development; a standalone "maintenance mode" is an anti-pattern in
  an autonomous system where the backlog is always live.
- **`merge` board column** (DECISIONS §5.2). Merge is now the engine's
  mechanical closing step after `review` passes, not a separate human-facing
  column.
- **`skills/` category** (Faz 11.4). Persona body's `capabilities` field
  covers the same ground — removed `templates/skills/` and
  `required-skills.md`.
- **v2 Python+Bash migration script** (Faz 11.4). `bin/migrate-legacy-backlog.ts`
  removed — no v2 users to migrate.
- **`> [!INFO]` callouts** (Faz 11.4). Unified to single YAML frontmatter
  standard. Duplicate metadata signal eliminated.
- **`> [!NOTE] RAPOR HAZIR` callouts** (Faz 13). Replaced by approver-based
  gate detection. Backward-compat shim consumes these blocks silently.
- **Repo-root `/AGENTS.md`** (Faz 13). Was stale with v3.0 paths. Removed —
  `templates/AGENTS.md` is the canonical version (gets copied to project
  root at `init` time).
- **`HANDOVER-v3.md` from npm package** (Faz 13). Now lives at
  `development/HANDOVER.md` and is excluded from publish (`.npmignore`).
- **Repo-root `/.env.example`** (Faz 13). Duplicate + stale path. Removed —
  `templates/.env.example` is canonical.

### Fixed

- **`app.listen()` EADDRINUSE silent fail** (HANDOVER #51, v3.0.1 debt). The
  server now attaches an explicit `error` handler: a clashing port prints a clear
  message (which project/port + how to resolve via `kortext list` / `kortext
  stop`) and exits 1, instead of silently skipping the listening callback and
  serving "Cannot GET /". Matters more under per-project-port where two `start`s
  can race for a port.

### Deferred to v3.2+ (intentional)

- Light theme variant
- Mobile responsive (currently 1280px+ optimized)
- A11y aria attributes (focus states exist; aria missing)
- i18n implementation (Settings has selection but it's static)
- LocalStorage persistence
- ⌘K command palette (currently disabled, "soon" badge)
- Reviewer-as-step runtime (agent-to-agent review pattern)
- Settings/Agents/Workflows/Rules write editor (currently read-only)
- `learned.md` topical split (single file for now; v3.2 splits at 50KB+)

---

## [3.0.0] — 2026-05-22

First public release of Kortext: a TypeScript runtime that lets AI agent teams
(Claude Code, Codex, Gemini CLI) run software projects autonomously. SQLite
state store, React dashboard, per-task git worktrees, and a built-in Model
Context Protocol server.

### Added

- **TypeScript runtime** (Node 22+). Single package, ESM, `better-sqlite3`,
  Express 5, Zod, Vitest. Strict mode across the board.
- **SQLite state store** (`server/db/`). 13 tables — `backlog_items`,
  `contexts`, `locks`, `handovers`, `sessions`, `decisions_index`,
  `pending_questions`, `audit_log`, `runs`, `run_steps`, `runtime_artifacts`,
  `notifications_sent`, `secrets_scan_results`. Migrations live in
  `server/db/migrations/*.sql` and are copied into `dist/` at build time.
- **Pipeline engine** (`server/engine/`). Parses `workflows/*.md` into a typed
  DAG, performs Kahn-style cycle detection, runs steps through a pull-ready
  worker pool with configurable concurrency (default 3), and short-circuits
  the remainder of the graph on first failure.
- **Per-task git worktrees** (`server/engine/worktree.ts`). Every run gets its
  own `.kortext/worktrees/run-<id>` branch namespaced as `kortext/run-<id>`.
  Successes can be merged and the worktree removed; failures are moved to a
  timestamped quarantine directory and the branch is preserved for postmortem.
- **CLI executors for Claude Code, Codex, and Gemini**
  (`server/engine/executors/`). Each has its own file (no shared abstract
  base); all spawn shell-free, pipe the persona prompt via stdin, and write
  per-step logs with declared `outputs:` verification.
- **Output safety**. `server/safety/secret-scanner.ts` runs on every successful
  step's declared outputs and log; findings flip the step to `failed`.
  `harmful-output-filter.ts` ships as a configurable placeholder for v3.1+.
- **Autonomous orchestrator** (`server/orchestrator/`). Pipeline chaining via
  `nextWorkflowId`, blueprint watcher (`status: approved` → trigger),
  multi-channel notification dispatcher (Slack + Telegram, deduped), and an
  approval queue surfaced to the dashboard.
- **Mid-run gate pause/resume**. Workers stop at workflow gates; the queue
  resolves the gate with `decision: approve | reject` and the run resumes
  from the same worktree.
- **Persona + workflow content layer** (`server/engine/persona-registry.ts`,
  `server/engine/workflow-loader.ts`). 14 personas and 12 workflows are
  authored as markdown — runtime parses them in-memory. Hot reload on disk
  change.
- **Doctor / consistency checks**. `kortext doctor` validates workflow ↔
  persona references, lock state, and backlog health. Exposed as
  `GET /api/doctor` and an MCP tool.
- **Item lifecycle**. `kortext-item-start`, `kortext-item-transition`, and
  `kortext-backlog-add` as TypeScript commands; every status change writes
  an audit row and a `chore(kortext): <action> <id>` commit.
- **React 19 dashboard** (Vite + Tailwind v4 + TanStack Router). Six main
  routes (Dashboard, Board, Memory, Reports, References) plus eight settings
  sub-panes. Bell, toast notifications, terminal panel, and timeline drawer
  are global overlays. Persona Markdown editor is inline (PUT + hot reload).
- **REST API**. `GET /api/runs`, `/api/handovers`, `/api/backlog`,
  `/api/personas` (GET/PUT), `/api/workflows`, `/api/doctor`,
  `/api/docs/:scope[/:file]` with an allow-listed scope
  (`references | reports | memory | rules | workflows`).
- **MCP server**. 16 tools registered through a `createKortextMcpServer(deps)`
  factory. Stdio transport for Claude Code / Cursor; SSE transport mounted on
  the same Express instance under `/mcp/sse` + `/mcp/messages` with
  per-session `McpServer` instances.
- **CLI**. `kortext init | serve | start | approve | status | logs | cleanup |
  doctor | mcp` with `--help` and `--version`. `bin/kortext.js` is a dual-mode
  shim that prefers compiled `dist/bin/kortext.js` and falls back to `tsx` in
  development.
- **CI**. GitHub Actions workflow (`.github/workflows/kortext-ci.yml`) running
  Node 22 lint → typecheck → test → build → compiled CLI smoke on every push
  and PR to `main`, with `cancel-in-progress` concurrency.

### Compatibility

- **Node** ≥ 22.0.0. `better-sqlite3` ≥ 12 requires the Node 26 V8 ABI, which
  is included in Node 22+.
- **TypeScript** ≥ 5.7 for `allowImportingTsExtensions` +
  `rewriteRelativeImportExtensions`.
- **Git** ≥ 2.30 (worktree subcommands).
