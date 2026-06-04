# MCP-into-headless-executors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give headless pipeline agents (Claude, Codex, Gemini, Antigravity) access to the Kortext MCP tools so `planning-pipeline` can populate the backlog autonomously, writing to the main project DB.

**Architecture:** A pure helper (`mcp-config.ts`) builds a stdio MCP-server descriptor (`kortext mcp`, env-targeted at the **absolute main DB path**). The executor factory threads the project root in; each CLI executor injects the descriptor using that CLI's own MCP flag. SQLite gets a `busy_timeout` so concurrent agent MCP subprocesses + the backend don't collide.

**Tech Stack:** TypeScript (ESM, `.ts` imports), better-sqlite3 (WAL), vitest, the four CLIs' stdio-MCP registration.

**Spec:** [2026-06-04-mcp-headless-executor-design.md](2026-06-04-mcp-headless-executor-design.md)

**Discipline:** TDD (red→green), DRY, YAGNI, frequent commits. Never run the real agent against the kortext repo — live verification happens only in the UAT sandbox (`/Users/erayendes/Documents/_codebase/UAT`).

---

## File structure

- Create: `server/engine/executors/mcp-config.ts` — `buildMcpServerConfig(projectRoot)` → descriptor (one responsibility).
- Create: `tests/mcp-config.test.ts` — unit tests for the descriptor + per-CLI flag mapping.
- Modify: `server/db/client.ts` — add `busy_timeout` pragma in `openDb`.
- Modify: `server/cli/executor-factory.ts` — accept `projectRoot`, build descriptor, pass to CLI executors.
- Modify: `server/engine/executors/claude-cli-executor.ts` — accept + inject `mcpServer`.
- Modify: `server/engine/executors/codex-cli-executor.ts` — same (CLI-specific flag).
- Modify: `server/engine/executors/gemini-cli-executor.ts` — same.
- Modify: `server/engine/executors/antigravity-cli-executor.ts` — same.
- Modify: `server/cli/commands.ts` — pass `projectRoot: process.cwd()` into `createExecutor`.
- Modify: `server/index.ts` — pass `projectRoot` in the drive executor factory call.
- Modify: `tests/db-*.test.ts` (or new `tests/db-pragmas.test.ts`) — assert busy_timeout.

---

### Task 1: SQLite busy_timeout for multi-process writes

**Files:**
- Modify: `server/db/client.ts:28-30` (pragma block in `openDb`)
- Test: `tests/db-pragmas.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// tests/db-pragmas.test.ts
import { describe, expect, it } from 'vitest';
import { openDb } from '../server/db/client.ts';

describe('openDb pragmas', () => {
  it('sets a non-zero busy_timeout so concurrent writers retry instead of erroring', () => {
    const { db } = openDb({ path: ':memory:', skipMigrations: true });
    const row = db.pragma('busy_timeout', { simple: true });
    expect(Number(row)).toBeGreaterThanOrEqual(3000);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db-pragmas.test.ts`
Expected: FAIL (busy_timeout is 0 by default).

- [ ] **Step 3: Add the pragma**

In `server/db/client.ts`, after `db.pragma('synchronous = NORMAL');` add:

```ts
  // Concurrent writers: agent MCP subprocesses + the backend all open this DB.
  // WAL allows many readers + one writer; busy_timeout makes a blocked writer
  // wait-and-retry (up to 5s) instead of throwing SQLITE_BUSY immediately.
  db.pragma('busy_timeout = 5000');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db-pragmas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/db/client.ts tests/db-pragmas.test.ts
git commit -m "feat(db): busy_timeout for concurrent agent MCP + backend writers"
```

---

### Task 2: buildMcpServerConfig descriptor

**Files:**
- Create: `server/engine/executors/mcp-config.ts`
- Test: `tests/mcp-config.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// tests/mcp-config.test.ts
import { describe, expect, it } from 'vitest';
import { buildMcpServerConfig } from '../server/engine/executors/mcp-config.ts';
import { isAbsolute } from 'node:path';

describe('buildMcpServerConfig', () => {
  it('targets the absolute MAIN project DB (not a worktree-relative path)', () => {
    const cfg = buildMcpServerConfig('/projects/acme');
    expect(isAbsolute(cfg.env.KORTEXT_DB_PATH)).toBe(true);
    expect(cfg.env.KORTEXT_DB_PATH).toBe('/projects/acme/.kortext/data/kortext.db');
  });

  it('invokes the packaged CLI MCP server over stdio', () => {
    const cfg = buildMcpServerConfig('/projects/acme');
    expect(cfg.args[cfg.args.length - 1]).toBe('mcp'); // `… kortext.js mcp`
    expect(cfg.command).toBeTruthy();
  });

  it('exposes the kortext tool namespace as the allow pattern', () => {
    const cfg = buildMcpServerConfig('/projects/acme');
    expect(cfg.allowedToolPattern).toBe('mcp__kortext__*');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mcp-config.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// server/engine/executors/mcp-config.ts
import { join, resolve } from 'node:path';
import { packageRoot } from '../../paths.ts';

/**
 * A normalized, CLI-agnostic description of the Kortext MCP server an agent
 * should connect to. Each CLI executor maps this onto its own MCP-registration
 * flag (see the executors). Transport is always stdio — the most universally
 * supported MCP transport across the four CLIs.
 */
export type McpServerDescriptor = {
  /** Logical server name agents see (tool prefix becomes mcp__<name>__*). */
  name: string;
  /** Executable to spawn the stdio MCP server. */
  command: string;
  /** Args; last is the `mcp` subcommand of the packaged CLI. */
  args: string[];
  /** Env for the server process. KORTEXT_DB_PATH is the critical bit. */
  env: { KORTEXT_DB_PATH: string };
  /** Allow-list pattern for the CLI (auto-permits these tools). */
  allowedToolPattern: string;
};

/**
 * Build the descriptor for a given MAIN project root (the daemon's cwd — NOT the
 * agent's worktree). The agent CLI runs with cwd=worktree, so we MUST pass an
 * absolute DB path or the MCP server would create/write a stray DB inside the
 * worktree. Mirrors env.KORTEXT_DB_PATH's default layout, resolved to absolute.
 */
export function buildMcpServerConfig(projectRoot: string): McpServerDescriptor {
  const root = resolve(projectRoot);
  return {
    name: 'kortext',
    command: process.execPath, // node
    args: [join(packageRoot('kortext'), 'bin', 'kortext.js'), 'mcp'],
    env: { KORTEXT_DB_PATH: join(root, '.kortext', 'data', 'kortext.db') },
    allowedToolPattern: 'mcp__kortext__*',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/mcp-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/engine/executors/mcp-config.ts tests/mcp-config.test.ts
git commit -m "feat(executor): MCP server descriptor targeting the main project DB"
```

---

### Task 3: Claude executor MCP injection + factory threading

**Files:**
- Modify: `server/engine/executors/claude-cli-executor.ts` (options + `execute` args)
- Modify: `server/cli/executor-factory.ts` (build descriptor, pass to executors)
- Test: `tests/mcp-config.test.ts` (extend) or `tests/claude-cli-executor.test.ts`

- [ ] **Step 1: Write the failing test** (add to `tests/mcp-config.test.ts`)

```ts
import { claudeMcpArgs } from '../server/engine/executors/claude-cli-executor.ts';
import { buildMcpServerConfig } from '../server/engine/executors/mcp-config.ts';

describe('claudeMcpArgs', () => {
  it('emits --mcp-config (with the kortext stdio server) and an allow flag', () => {
    const args = claudeMcpArgs(buildMcpServerConfig('/projects/acme'));
    expect(args).toContain('--mcp-config');
    const json = JSON.parse(args[args.indexOf('--mcp-config') + 1]);
    expect(json.mcpServers.kortext.command).toBeTruthy();
    expect(json.mcpServers.kortext.env.KORTEXT_DB_PATH).toBe('/projects/acme/.kortext/data/kortext.db');
    expect(args).toContain('--allowedTools');
    expect(args).toContain('mcp__kortext__*');
  });

  it('returns [] when no descriptor is given (back-compat: no MCP)', () => {
    expect(claudeMcpArgs(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mcp-config.test.ts`
Expected: FAIL (`claudeMcpArgs` not exported).

- [ ] **Step 3: Implement `claudeMcpArgs` + wire into `execute`**

In `claude-cli-executor.ts`, import the type and add an exported pure helper:

```ts
import type { McpServerDescriptor } from './mcp-config.ts';

/** Map the descriptor onto Claude CLI flags. Pure + exported for unit tests. */
export function claudeMcpArgs(mcp: McpServerDescriptor | undefined): string[] {
  if (!mcp) return [];
  const config = JSON.stringify({
    mcpServers: { [mcp.name]: { command: mcp.command, args: mcp.args, env: mcp.env } },
  });
  return ['--mcp-config', config, '--allowedTools', mcp.allowedToolPattern];
}
```

Add `mcpServer?: McpServerDescriptor;` to `ClaudeCliExecutorOptions`, then in `execute`, insert the MCP args into the `args` array (before `extraArgs`):

```ts
    const args = [
      '--print',
      '--dangerously-skip-permissions',
      '--setting-sources',
      'project,local',
      '--exclude-dynamic-system-prompt-sections',
      '--append-system-prompt',
      systemPrompt,
      ...claudeMcpArgs(this.opts.mcpServer),
      ...(this.opts.extraArgs ?? []),
    ];
```

In `executor-factory.ts`: add `projectRoot?: string;` to `ExecutorFactoryOptions`; at the top of `createExecutor`, compute the descriptor once:

```ts
import { buildMcpServerConfig } from '../engine/executors/mcp-config.ts';
// inside createExecutor, before the switch:
const mcpServer =
  kind !== 'mock' && opts.projectRoot
    ? buildMcpServerConfig(opts.projectRoot)
    : undefined;
```

Pass `mcpServer` into the `claude` case options: `mcpServer,`.

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run tests/mcp-config.test.ts && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add server/engine/executors/claude-cli-executor.ts server/cli/executor-factory.ts tests/mcp-config.test.ts
git commit -m "feat(executor): inject Kortext MCP server into Claude headless agents"
```

---

### Task 4: Thread projectRoot from the trigger paths

**Files:**
- Modify: `server/cli/commands.ts` (add `projectRoot` to `StartCommandInput`, pass to `createExecutor`)
- Modify: `server/index.ts` (drive executor factory call)
- Test: `tests/cli-commands.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

```ts
// in tests/cli-commands.test.ts — assert the claude path requests MCP wiring.
// Use the exported helpers to prove the executor would carry MCP for a project.
import { buildMcpServerConfig } from '../server/engine/executors/mcp-config.ts';
import { claudeMcpArgs } from '../server/engine/executors/claude-cli-executor.ts';

it('a project root yields claude MCP args pointing at that project DB', () => {
  const args = claudeMcpArgs(buildMcpServerConfig('/projects/zeta'));
  expect(args.join(' ')).toContain('/projects/zeta/.kortext/data/kortext.db');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/cli-commands.test.ts`
Expected: FAIL only if imports/exports missing; otherwise this guards the wiring contract. (If it passes immediately because Task 3 exported the helpers, that's fine — proceed; the real wiring change is in Steps 3.)

- [ ] **Step 3: Wire projectRoot**

In `commands.ts`: add `projectRoot?: string;` to `StartCommandInput`. In the `createExecutor` call (around line 73) add:

```ts
    projectRoot: input.projectRoot ?? process.cwd(),
```

In `server/index.ts`, the drive path builds its executor via `resolveExecutor`/`makeServerDrive`. Ensure whichever `createExecutor` call powers the drive passes `projectRoot: process.cwd()`. (The blueprint trigger already calls `startCommand`, which now defaults `projectRoot` to `process.cwd()`.)

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run tests/cli-commands.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/cli/commands.ts server/index.ts tests/cli-commands.test.ts
git commit -m "feat(executor): pass project root so triggers wire MCP to the main DB"
```

---

### Task 5: LIVE acceptance — Claude end-to-end in the UAT sandbox

**This is the proof the whole approach works with the real engine Eray uses. Sandbox only.**

- [ ] **Step 1: Reset the UAT project**

```bash
cd /Users/erayendes/Documents/_codebase/UAT
rm -rf .kortext
```

- [ ] **Step 2: Start the backend (cwd=UAT, drive OFF)**

```bash
cd /Users/erayendes/Documents/_codebase/UAT && KORTEXT_PORT=3200 KORTEXT_DRIVE_ENABLED=0 \
  nohup node /Users/erayendes/Documents/_codebase/kortext/node_modules/.bin/tsx \
  /Users/erayendes/Documents/_codebase/kortext/server/index.ts > .kortext-server.log 2>&1 &
```

- [ ] **Step 3: Onboard HydroFlow via the dashboard** (or re-POST `/api/blueprint` with the HydroFlow payload + BRD body, executor=claude). This triggers analysis → (chain) → planning.

- [ ] **Step 4: Wait for the chain, then verify the backlog is non-empty**

Run: `curl -s http://localhost:3200/api/backlog | python3 -c "import sys,json;print(len(json.load(sys.stdin)['items']),'items')"`
Expected: a number **> 0** (real backlog items derived from the PRD/TRD).

- [ ] **Step 5: Verify items landed in the MAIN DB, not a worktree**

Run: `find /Users/erayendes/Documents/_codebase/UAT/.kortext/data/worktrees -name 'kortext.db' 2>/dev/null`
Expected: **no stray DB** inside any worktree (MCP wrote to the main DB).

- [ ] **Step 6: Screenshot the Board** showing the HydroFlow backlog; record the count in HANDOVER.md.

---

### Task 6: Codex executor MCP injection

**Files:**
- Modify: `server/engine/executors/codex-cli-executor.ts`
- Test: `tests/mcp-config.test.ts` (extend)

- [ ] **Step 1: Confirm Codex's stdio-MCP registration syntax**

Run: `<codex-binary> --help | grep -i mcp` AND fetch current docs via context7 (`resolve-library-id` → `query-docs` for the OpenAI Codex CLI). Deliverable: the exact flag/config form Codex uses to register a stdio MCP server (e.g. a `--config`/`mcp_servers` TOML/JSON entry).

- [ ] **Step 2: Write the failing test** (mirrors `claudeMcpArgs`)

```ts
import { codexMcpArgs } from '../server/engine/executors/codex-cli-executor.ts';

describe('codexMcpArgs', () => {
  it('registers the kortext stdio server with the absolute DB path', () => {
    const out = codexMcpArgs(buildMcpServerConfig('/projects/acme'));
    expect(JSON.stringify(out)).toContain('/projects/acme/.kortext/data/kortext.db');
  });
  it('returns [] without a descriptor', () => {
    expect(codexMcpArgs(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to verify it fails** → `npx vitest run tests/mcp-config.test.ts` → FAIL (not exported).

- [ ] **Step 4: Implement `codexMcpArgs` using the confirmed syntax from Step 1**, add `mcpServer?: McpServerDescriptor` to the options, inject into the spawn args in `execute`, and pass `mcpServer` in the factory's `codex` case (same pattern as Claude, Task 3).

- [ ] **Step 5: Run test + typecheck** → PASS.

- [ ] **Step 6: Commit** → `git commit -m "feat(executor): wire Kortext MCP into Codex headless agents"`

---

### Task 7: Gemini executor MCP injection

**Files:**
- Modify: `server/engine/executors/gemini-cli-executor.ts`
- Test: `tests/mcp-config.test.ts` (extend)

- [ ] **Step 1: Confirm Gemini CLI's stdio-MCP registration** (`<gemini-binary> --help | grep -i mcp` + context7 docs for the Gemini CLI `mcpServers` settings). Deliverable: exact mechanism (Gemini CLI typically reads `mcpServers` from a settings JSON).

- [ ] **Step 2: Write the failing test** (`geminiMcpArgs`, same shape as Task 6 Step 2).

- [ ] **Step 3: Run → FAIL.**

- [ ] **Step 4: Implement** `geminiMcpArgs` (or, if Gemini only accepts a settings file, write a temp settings file under `.kortext/data/` and return the pointing flag; clean up in a `finally`). Add options + inject + factory `gemini` case.

- [ ] **Step 5: Run test + typecheck → PASS.**

- [ ] **Step 6: Commit** → `git commit -m "feat(executor): wire Kortext MCP into Gemini headless agents"`

---

### Task 8: Antigravity executor MCP injection

**Files:**
- Modify: `server/engine/executors/antigravity-cli-executor.ts`
- Test: `tests/mcp-config.test.ts` (extend)

- [ ] **Step 1: Confirm Antigravity (`agy`) CLI's stdio-MCP registration** (`<agy-binary> --help | grep -i mcp` + any official docs). Deliverable: the exact flag/config. If the CLI has **no** MCP support, STOP and report — then this engine falls back to the file-ingestion bridge (out of current scope) and we note the limitation.

- [ ] **Step 2: Write the failing test** (`antigravityMcpArgs`, same shape).

- [ ] **Step 3: Run → FAIL.**

- [ ] **Step 4: Implement** `antigravityMcpArgs` using confirmed syntax; add options + inject + factory `antigravity` case.

- [ ] **Step 5: Run test + typecheck → PASS.**

- [ ] **Step 6: Commit** → `git commit -m "feat(executor): wire Kortext MCP into Antigravity headless agents"`

---

### Task 9: Integration test — planning step creates a backlog item via MCP

**Files:**
- Test: `tests/mcp-backlog-integration.test.ts` (create)

- [ ] **Step 1: Write the test** — drive the MCP server's `add_backlog_item` handler against a temp DB and assert it persists, proving the server side the agents call actually creates items.

```ts
// tests/mcp-backlog-integration.test.ts
import { describe, expect, it } from 'vitest';
import { openDb } from '../server/db/client.ts';
import { createKortextMcpServer } from '../mcp/server.ts';
// Build the server with a temp DB's repos, invoke the add_backlog_item tool
// handler with a sample PRD-derived item, then assert repos.backlog.list()
// returns it. (Use the same deps shape mcp/stdio.ts builds.)
```

- [ ] **Step 2: Run → FAIL** (until assertions/handles wired).

- [ ] **Step 3: Implement the test** to call the registered tool and assert persistence (no production code change expected — this pins the contract the agents rely on).

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** → `git commit -m "test(mcp): pin add_backlog_item persistence contract"`

---

## Self-review

**Spec coverage:** general MCP access (Tasks 3,6,7,8 expose `mcp__kortext__*`); four engines (Tasks 3,6,7,8); stdio approach (Task 2); absolute-DB targeting (Task 2 + tests); WAL/busy_timeout concurrency (Task 1); workflow gates/security unchanged (no task touches them — correct); live acceptance (Task 5); integration contract (Task 9). All spec sections map to a task.

**Placeholder scan:** No "TBD/TODO" implementation hand-waving. The per-CLI Steps 1 in Tasks 6–8 are *research spikes with a defined deliverable* (the confirmed flag), not placeholders — necessary because the three non-Claude CLIs' MCP syntax must be verified against current docs (called out in the spec's "Open implementation tasks").

**Type consistency:** `McpServerDescriptor` (Task 2) is the single shared type; `buildMcpServerConfig` returns it; `claudeMcpArgs`/`codexMcpArgs`/`geminiMcpArgs`/`antigravityMcpArgs` all take `McpServerDescriptor | undefined` → `string[]`; `ExecutorFactoryOptions.projectRoot` + each executor's `mcpServer?` option are consistent across tasks.

## Risks / notes
- Concurrency: ≤3 MCP subprocesses (worker-pool concurrency 3) + backend share the DB; busy_timeout (Task 1) is the mitigation. If contention still bites, lower planning concurrency.
- If a non-Claude CLI lacks stdio-MCP support (discovered in Tasks 6–8 Step 1), report and treat that engine separately — do not block the Claude path (Tasks 1–5), which delivers the core value on its own.
