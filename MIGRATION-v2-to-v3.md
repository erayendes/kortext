# Migrating from Kortext v2 to v3

Kortext v3 is a full rewrite. The good news: **no v2 data is destroyed by
upgrading**. Your blueprint, personas, workflows, and backlog markdown all stay
on disk. v3 reads what it can, indexes the rest into SQLite, and keeps the v2
Python / Bash code in `legacy/` as reference.

This guide walks you through the upgrade in the order you should do it.

## Before you start

- **Back up your repo.** `git tag pre-v3-backup` and push it somewhere remote.
  Nothing here is destructive, but having a tag to walk back to is cheap.
- **Read the [CHANGELOG](./CHANGELOG.md)** for the full list of breaking
  changes.
- **Have Node 22+ installed.** `better-sqlite3` 12 requires the Node 26 V8 ABI,
  which ships with Node 22 and later.

## Step 1 — Install v3

In your v2 repository:

```bash
# Pull the v3 sources (or install globally)
npm install -g kortext@^3

# Or, if you prefer no global install:
npx kortext@^3 --version
```

Verify the version:

```bash
kortext --version
# → 3.0.0
```

## Step 2 — Scaffold v3 alongside v2

`kortext init` is idempotent — it only creates files that are missing. Run it
inside your existing v2 project:

```bash
cd path/to/your/project
kortext init
```

What this creates:

| Path | Why |
|---|---|
| `.kortext/kortext.db` | SQLite state store (runs, backlog index, audit log) |
| `.kortext/worktrees/` | Per-run git worktrees (populated at runtime) |
| `agents/*.md` | 14 persona definitions (if missing) |
| `workflows/*.md` | 12 workflow pipelines (if missing) |
| `rules/*.md` | Behavior + branching + commands + emergency rules |
| `workspace/references/blueprint.md` | Blueprint stub (if missing) |
| `AGENTS.md` | Pointer file for AI runtimes (regenerated to v3 format) |

> If `kortext init` reports that a file already exists, it leaves yours alone.
> Use `kortext init --force` only if you want to overwrite local edits with
> the shipped templates.

## Step 3 — Move the v2 Python / Bash files out of the way

v3 does not call any of the v2 scripts. To keep them as reference without them
showing up in builds or CI, move them under `legacy/`:

```bash
mkdir -p legacy/
git mv kortext/scripts legacy/scripts || true
git mv kortext/hooks   legacy/hooks   || true
```

> `legacy/` is excluded from the v3 build via `.npmignore` and from lint /
> typecheck via `tsconfig.build.json`. You can delete the folder once you have
> verified v3 covers everything you relied on.

## Step 4 — Import your v2 backlog into SQLite

`bin/migrate-legacy-backlog.ts` reads every `workspace/memory/backlog/*.md`
file and writes an equivalent row into the `backlog_items` table.

**Dry-run first** — this prints what would be inserted without touching the
database:

```bash
KORTEXT_DB_PATH=.kortext/kortext.db npx tsx bin/migrate-legacy-backlog.ts --dry-run
```

Sample output:

```
Legacy backlog migration report
--------------------------------
  scanned         18
  skipped          4  (templates, dashboards, README)
  unparseable      0
  already exists   0
  would insert    14

    + E001 (epic) — Authentication
    + T0101 (task) — Login form
    …

(dry run — no writes performed)
```

If the **unparseable** count is non-zero, fix those files (usually the
filename is non-standard) and re-run. When the report looks right, drop the
`--dry-run` flag:

```bash
KORTEXT_DB_PATH=.kortext/kortext.db npx tsx bin/migrate-legacy-backlog.ts
```

Each insert also writes a `backlog.item.migrated` row to `audit_log` so you can
prove what came from where.

## Step 5 — Rename `PORT` → `KORTEXT_PORT`

v3 uses `KORTEXT_PORT` (not `PORT`) for the backend HTTP port. The change
avoids collisions with editor / preview tooling that injects `PORT=…` into
the environment.

In your `.env`, `.env.local`, or shell profile:

```diff
- PORT=3200
+ KORTEXT_PORT=3200
```

Default is `3200` if unset. The dashboard (Vite) still uses `PORT` for its
own dev server because that's Vite's contract.

## Step 6 — Approve the blueprint in v3

v2 watched markdown comments for blueprint status. v3 watches the YAML
frontmatter — make sure your blueprint has it:

```markdown
---
status: draft
---

# Blueprint — Acme CRM

…
```

Flip `status: draft` → `status: approved` when you are ready. The orchestrator
(`server/orchestrator/blueprint-watcher.ts`) picks it up and triggers the
analysis workflow automatically.

You can also approve from the dashboard (Board → Approve blueprint) or via the
MCP tool `approve_blueprint`.

## Step 7 — Start the dashboard

```bash
kortext serve
# → backend on http://localhost:3200
# → dashboard on http://localhost:5173
```

Open the dashboard, head to **Dashboard** to see live runs, and **Settings →
Agents** to confirm your 14 personas loaded.

## Step 8 — Smoke-test a pipeline

```bash
# In one terminal — start serving
kortext serve

# In another — kick off the analysis workflow against your blueprint
kortext start analysis --executor=mock
```

The `--executor=mock` flag uses an in-process stub so you can verify wiring
without burning AI tokens. Once it's green, drop the flag (or set
`--executor=claude` / `codex` / `gemini`) for a real run.

## What's different at runtime

| v2 | v3 |
|---|---|
| `kortext-session-start.py` | `kortext serve` |
| `kortext-item-start.py T001` | `kortext start <workflow> T001` |
| `kortext-handover.py +developer +reviewer` | Auto-triggered at workflow gates |
| `audit-logger.sh` line writes | `audit_log` SQLite table + `kortext logs` |
| File locks via `auto-locker.sh` | Git worktree isolation (locks table rarely used) |
| Approval = TODO comment in `agent-active.md` | `pending_questions` table + dashboard bell + Slack/Telegram |
| `kortext help` | `kortext --help` (and per-command `--help`) |

## What about the v2 `workspace/memory/` files?

v3 keeps them on disk. They're treated as **read-only history**. Nothing in v3
writes back to `workspace/memory/backlog/*.md`. If you want a hard cutover:

1. Confirm everything you care about made it into SQLite (`kortext doctor` and
   `SELECT * FROM backlog_items` will tell you).
2. `git mv workspace/memory legacy/workspace-memory` to move the old tree out.
3. Future backlog items live only in SQLite, surfaced via the dashboard and
   MCP `add_backlog_item`.

You can delay step 2 indefinitely. There is no race because no v3 code reads
those files.

## Need to roll back?

```bash
git checkout pre-v3-backup
```

Or, less drastic: uninstall the v3 CLI globally (`npm uninstall -g kortext`)
and resume using the v2 Python scripts from `legacy/`. The SQLite database
(`.kortext/kortext.db`) can be deleted to remove the v3 footprint entirely
without affecting any markdown.

## Help

- Documentation: [USER-GUIDE.md](./USER-GUIDE.md), [docs/architecture.md](./docs/architecture.md)
- Issues: [GitHub Issues](https://github.com/erayendes/kortext-framework/issues)
- v2 archive tag: `tr-archive` (last v2 commit on the Turkish line),
  `en-archive` (English translation)
