# Onboarding-driven directory + auto-git — Design

**Date:** 2026-06-07
**Status:** Approved (design); pending implementation plan
**Owner:** Eray (product) / Claude (code)

## Problem

Today the project directory is decided **twice** and the two compete:

1. At CLI time — `kortext start <dir>` (or `cwd`) binds a daemon to a filesystem
   directory (`server/cli/cmd-start.ts:58` `startProject`, `bin/kortext.ts:252`).
2. At onboarding time — the wizard has a "Project Directory" picker
   (`src/components/OnboardingScreen.tsx`, `/api/pick-directory`), consumed by the
   blueprint route (`server/routes/blueprint.ts:108` `resolveBlueprintTarget`).

For a non-coder this is confusing: "I haven't got a project yet, why is the terminal
asking me to `cd` into one?" Worse, if the onboarding picker points somewhere other
than the daemon's own folder (`isElsewhere`), files are written there but **work never
starts** (`blueprint.ts:154` skips `onApproved` when `isElsewhere`) — a silent trap.

Separately: the build phase needs a git repo with a `development` branch, but Kortext
does **not** bootstrap git. A non-coder currently has to run `git init -b main`,
`git add`, `git commit`, `git branch development` by hand (confirmed painful in UAT).

## Decisions (locked via AskUserQuestion)

- **Single source of truth = onboarding wizard.** The directory is chosen in the GUI,
  not on the command line. (Eray rejected "start-folder = project"; chose "wizard picks
  the directory".)
- **Entry command stays `kortext start`** (no new command). With no project present,
  bare `kortext start` opens the wizard. (Eray rejected adding `kortext new`.)
- **Auto-git bootstrap** during project creation (`git init -b main` + first commit +
  `development` branch), skipped/softened for existing repos.
- **Approach 1** (wizard daemon → spawn real project daemon at chosen dir → redirect
  the browser → real daemon auto-starts analysis). Fully seamless. Eray rejected the
  simpler "create + manual Open button" (Approach 2).

## Architecture

Constraint that shapes everything: **1 daemon : 1 directory : 1 port.** A running
daemon cannot be re-homed (its DB is open and its port is bound). So "pick the directory
in the wizard" necessarily means: an ephemeral **bootstrap wizard daemon** greets the
user, and on submit it **spawns the real project daemon** in the chosen directory and
hands the browser off to it.

```
kortext start  (no project anywhere)
        │
        ▼
[bootstrap wizard daemon]  cwd = ~/.kortext/bootstrap/   env KORTEXT_BOOTSTRAP=1
  · no approved blueprint  → frontend shows OnboardingScreen
  · NOT registered in projects.json (never shows in `kortext list`)
        │  user fills: project info + BRD + DIRECTORY  → submit /api/blueprint
        ▼
[blueprint route: bootstrap/new-project branch]
  1. validate chosen dir (must exist; native picker guarantees this)
  2. initCommand(chosenDir)         → .kortext/ + AGENTS.md + .gitignore + .env.example
  3. bootstrapGit(chosenDir)        → git init -b main + commit + development (new repo)
                                       or ensure `development` exists (existing repo)
  4. write BRD + project.json into <chosenDir>/.kortext
  5. startProject(chosenDir)        → register + allocate port + spawn REAL daemon
  6. respond { ok, projectDir, handoffUrl: http://localhost:<realPort>/ }
  7. schedule bootstrap self-shutdown
        │
        ▼
[OnboardingScreen] sees handoffUrl → "Projen hazırlanıyor…" → window.location = handoffUrl
        │
        ▼
[real project daemon]  cwd = chosenDir
  · boot: resumeOrphanedRuns(repos)  (existing)
  · boot: autoStartPendingAnalysis(repos)  (NEW)
       if blueprint approved AND no analysis run has ever started
       → trigger triggerWorkflowIdFor(projectType)  (idempotent)
  · frontend now sees status=approved → shows dashboard, analysis already running
```

## Components

### 1. CLI entry — `bin/kortext.ts` start handler
- `result.action === 'onboard'` (no project anywhere): instead of printing a hint,
  launch the bootstrap wizard daemon and open the browser to it.
- Optional small flag `kortext start --new`: force the wizard even when the registry is
  non-empty (so users with existing projects can create another). Low priority; may defer.
- `result.action === 'list'` unchanged (projects exist → show list).

### 2. Bootstrap wizard daemon
- Reuse the existing daemon (`server/index.ts`); spawn with `cwd = ~/.kortext/bootstrap/`
  and `env KORTEXT_BOOTSTRAP=1`.
- The scratch home has no approved blueprint → OnboardingScreen renders.
- Spawned **outside** `registerProject`, so it is absent from `projects.json` and from
  `kortext list` / `kortext stop` enumeration.
- Self-terminates after a successful handoff response (short delay) or an idle timeout,
  so it does not linger and leak a port.

### 3. `bootstrapGit(dir)` — new helper (near `server/cli/init.ts`)
- No `.git` present → `git init -b main`, `git add -A`, `git commit -m "kortext scaffold"`,
  `git branch development`. Mirror the `execFileSync` style used by GitMerger.
- `.git` present → **do not** touch the working tree or create commits. Only ensure a
  `development` branch exists (create from current HEAD if missing).
- git missing / any git failure → return a soft warning, do **not** fail project creation.

### 4. Blueprint route — bootstrap/new-project branch (`server/routes/blueprint.ts`)
- Detect the bootstrap case via the daemon flag `KORTEXT_BOOTSTRAP=1` (authoritative
  signal — the wizard daemon is launched with it). In that mode the chosen `projectDir`
  is always treated as a new/elsewhere target and runs steps 1–6 above.
- Keep the existing in-place path (daemon's own workspace) working unchanged.
- Idempotent: re-submitting after a partial failure re-uses the already-scaffolded dir.

### 5. Browser handoff (`src/components/OnboardingScreen.tsx`)
- On submit success: if `handoffUrl` present → show a brief "preparing" state and
  `window.location.href = handoffUrl`. Otherwise → existing `onDone()` behavior.

### 6. `autoStartPendingAnalysis(repos, …)` — new boot step (`server/index.ts`)
- After `resumeOrphanedRuns`. If blueprint is approved, project meta exists, and **no**
  analysis run has ever started for this project → trigger the analysis workflow through
  the same `onApproved` path. Guard so a second boot never double-triggers.

## Data flow / payloads

- `POST /api/blueprint` response gains an optional `handoffUrl: string` (and keeps
  `projectDir`, `initializedElsewhere`). In-place submissions omit `handoffUrl`.
- No DB schema change. `bootstrapGit` and `autoStartPendingAnalysis` operate on the
  filesystem + existing run repos.

## Error handling

| Case | Behavior |
|------|----------|
| Chosen dir invalid / not writable | 422 + plain message; wizard stays open |
| git not installed / git init fails | Project still created; soft warning surfaced; no hard fail |
| Existing repo, uncommitted changes | Never auto-commit user files; only ensure `development` branch |
| Real daemon spawn fails | Return error to wizard; chosen dir already scaffolded → retry is safe |
| Port already taken | Existing `allocatePort` logic handles it |
| Bootstrap daemon lingers | Self-shutdown after handoff / idle timeout; never registered |

## Testing

- **Unit** `bootstrapGit`: empty dir (init+commit+`development` created), existing repo
  (no commit, `development` ensured), git-missing (graceful soft-fail).
- **Unit** blueprint bootstrap branch: scaffolds, writes BRD, calls `startProject`,
  returns `handoffUrl`; idempotent re-run.
- **Unit** `autoStartPendingAnalysis`: triggers once; idempotent on a second boot;
  no-op when not approved or already run.
- **Unit** start handler: `onboard` → wizard launch path (injectable spawn).
- **Integration guard**: end-to-end create → handoff payload shape.

## Scope guard (YAGNI)

- No "create a brand-new folder from inside the wizard" — user picks an existing folder
  via the native picker. Can add later.
- No multi-project switcher UI changes beyond the optional `--new` flag (may defer).
- No separate web server for the wizard — reuse the existing daemon with a flag.
- Production push / CI substrate, hung-claude resilience, dashboard step-transparency —
  out of scope (tracked separately in TODO/HANDOVER).
