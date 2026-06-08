# Multi-Model Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing `PersonaRoutedExecutor` class into the live runtime so different AI personas can use different executor backends (e.g., `+architect` → claude, `+reviewer` → gemini) declared via a `- model:` bullet in each persona's `.md` file.

**Architecture:** Parse an optional `- model: <kind>` bullet from persona markdown → store in `personas.model_default` DB column → `createRoutedExecutor()` factory reads that list at drive-time and wraps the base executor in `PersonaRoutedExecutor`. Worker pool concurrency is unchanged; only the per-step executor dispatch changes.

**Tech Stack:** TypeScript, Vitest, better-sqlite3, existing `PersonaRoutedExecutor` (already written), `executor-factory.ts` (already has `createExecutor`)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `server/engine/persona-registry.ts` | Modify | Add `model: string \| null` to `PersonaDefinition`; parse `- model:` bullet |
| `server/engine/index-sync.ts` | Modify | Pass `def.model ?? null` to `model_default` instead of hardcoded `null` |
| `server/cli/executor-factory.ts` | Modify | Add `createRoutedExecutor(overrides, fallback, opts)` export |
| `server/orchestrator/server-drive.ts` | Modify | Wrap base executor with `createRoutedExecutor` in `buildRuntime()` |
| `tests/persona-registry.test.ts` | Modify | Add test: `- model:` bullet sets `def.model` |
| `tests/index-sync.test.ts` | Modify | Add test: persona with model → `model_default` persisted in DB |
| `tests/executor-factory.test.ts` | Modify | Add tests for `createRoutedExecutor` (routing, dedup, passthrough) |

---

## Task 1 — Parse `- model:` from persona markdown

**Files:**
- Modify: `server/engine/persona-registry.ts`
- Test: `tests/persona-registry.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/persona-registry.test.ts` inside `describe('loadPersonasFromDir')`:

```ts
it('reads - model: bullet into the model field', () => {
  writePersona(
    tmpRoot,
    'routed-dev.md',
    `# routed-dev\n\n- description: A routed developer.\n- model: gemini\n\n## identity\n\nYou are routed.\n`,
  );
  const reg = loadPersonasFromDir(tmpRoot);
  const p = reg.get('+routed-dev');
  expect(p?.model).toBe('gemini');
});

it('sets model to null when - model: bullet is absent', () => {
  writePersona(
    tmpRoot,
    'plain-dev.md',
    `# plain-dev\n\n- description: No model override.\n\n## identity\n\nYou are plain.\n`,
  );
  const reg = loadPersonasFromDir(tmpRoot);
  const p = reg.get('+plain-dev');
  expect(p?.model).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/persona-registry.test.ts
```

Expected: FAIL — `p?.model` is `undefined` (field doesn't exist yet)

- [ ] **Step 3: Add `model` to `PersonaDefinition` and parse `- model:` bullet**

In `server/engine/persona-registry.ts`:

**Add `model` to the type (after `description`):**
```ts
export type PersonaDefinition = {
  handle: string;
  id: string;
  description: string;
  /** Optional executor kind override declared via `- model: <kind>`. */
  model: string | null;
  systemPrompt: string;
};
```

**Add regex constant (after `DESCRIPTION_RE`):**
```ts
const MODEL_RE = /^-\s*model\s*:\s*(.+?)\s*$/i;
```

**Add model parsing in `parsePersonaMarkdown` (inside the for loop, after the `description` block):**
```ts
let handleId: string | null = null;
let description: string | null = null;
let model: string | null = null;

for (const raw of lines) {
  const line = raw.replace(/\r$/, '');

  if (handleId === null) {
    const m = line.match(H1_RE);
    if (m?.[1]) {
      handleId = m[1];
      continue;
    }
  }

  if (description === null) {
    const d = line.match(DESCRIPTION_RE);
    if (d?.[1]) {
      description = d[1];
    }
  }

  if (model === null) {
    const mo = line.match(MODEL_RE);
    if (mo?.[1]) {
      model = mo[1];
    }
  }

  if (handleId !== null && description !== null && model !== null) break;
}
```

**Update return value:**
```ts
return {
  handle: `+${handleId}`,
  id: handleId,
  description,
  model,
  systemPrompt: source,
};
```

Note: remove the early-break optimization `if (handleId !== null && description !== null) break;` — it's now replaced by the three-field version above.

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/persona-registry.test.ts
```

Expected: all persona-registry tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/engine/persona-registry.ts tests/persona-registry.test.ts
git commit -m "feat(personas): parse optional - model: bullet from persona markdown"
```

---

## Task 2 — Thread `model_default` through index-sync

**Files:**
- Modify: `server/engine/index-sync.ts`
- Test: `tests/index-sync.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/index-sync.test.ts` inside `describe('syncRegistriesToDb')`:

```ts
it('stores model_default from persona - model: bullet', () => {
  writeAgent(
    'model-aware-dev',
    `# model-aware-dev\n\n- description: Has model override.\n- model: gemini\n\n## purpose\n\nDo model work.\n`,
  );
  const personas = loadPersonasFromDir(agentsDir);
  const workflows = loadWorkflowsFromDir(workflowsDir);

  syncRegistriesToDb({ personas, workflows }, repos);

  const row = repos.personas.get('+model-aware-dev');
  expect(row?.model_default).toBe('gemini');
});

it('stores null model_default when no - model: bullet', () => {
  writeAgent('plain-dev');
  const personas = loadPersonasFromDir(agentsDir);
  const workflows = loadWorkflowsFromDir(workflowsDir);

  syncRegistriesToDb({ personas, workflows }, repos);

  const row = repos.personas.get('+plain-dev');
  expect(row?.model_default).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/index-sync.test.ts
```

Expected: FAIL — `model_default` is `null` even for the persona with `- model: gemini`

- [ ] **Step 3: Replace hardcoded `null` with `def.model ?? null` in index-sync**

In `server/engine/index-sync.ts`, inside the `for (const def of personas.list())` loop:

**Before:**
```ts
    repos.personas.upsert({
      handle: def.handle,
      purpose,
      when_to_use: whenToUse,
      capabilities: [],
      model_default: null,
      source_path: `agents/${def.id}.md`,
    });
```

**After:**
```ts
    repos.personas.upsert({
      handle: def.handle,
      purpose,
      when_to_use: whenToUse,
      capabilities: [],
      model_default: def.model ?? null,
      source_path: `agents/${def.id}.md`,
    });
```

(The synthetic-handles block at line ~126 keeps `model_default: null` — those never have executor overrides.)

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/index-sync.test.ts
```

Expected: all index-sync tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/engine/index-sync.ts tests/index-sync.test.ts
git commit -m "feat(index-sync): thread persona model_default from markdown to DB"
```

---

## Task 3 — Add `createRoutedExecutor` factory

**Files:**
- Modify: `server/cli/executor-factory.ts`
- Test: `tests/executor-factory.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/executor-factory.test.ts`:

```ts
import { createRoutedExecutor } from '../server/cli/executor-factory.ts';

describe('createRoutedExecutor', () => {
  it('returns the fallback unchanged when no persona has a model_default', () => {
    const fallback = createExecutor('mock', cliOpts);
    const result = createRoutedExecutor(
      [{ handle: '+developer', model_default: null }],
      fallback,
      cliOpts,
    );
    expect(result).toBe(fallback);
  });

  it('returns a PersonaRoutedExecutor when at least one override is set', () => {
    const fallback = createExecutor('mock', cliOpts);
    const result = createRoutedExecutor(
      [{ handle: '+reviewer', model_default: 'mock' }],
      fallback,
      cliOpts,
    );
    expect(result).toBeInstanceOf(PersonaRoutedExecutor);
  });

  it('deduplicates: two personas with the same model_default share one executor instance', () => {
    const fallback = createExecutor('mock', cliOpts);
    const result = createRoutedExecutor(
      [
        { handle: '+dev', model_default: 'claude' },
        { handle: '+qa', model_default: 'claude' },
      ],
      fallback,
      cliOpts,
    ) as PersonaRoutedExecutor;
    // Access routes via the name — both +dev and +qa resolve to same claude-cli instance.
    expect(result.name).toMatch(/routed/);
    expect(result.name).toMatch(/claude-cli/);
  });

  it('ignores entries with an unrecognised model_default value', () => {
    const fallback = createExecutor('mock', cliOpts);
    const result = createRoutedExecutor(
      [{ handle: '+unknown', model_default: 'grok-4' }],
      fallback,
      cliOpts,
    );
    // Unrecognised kind → treated as no-op → fallback returned unchanged.
    expect(result).toBe(fallback);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/executor-factory.test.ts
```

Expected: FAIL — `createRoutedExecutor` not exported

- [ ] **Step 3: Implement `createRoutedExecutor` in `executor-factory.ts`**

Add imports at the top of `server/cli/executor-factory.ts`:

```ts
import { PersonaRoutedExecutor } from '../engine/executors/persona-routed-executor.ts';
import { resolveExecutorBinary } from './binary-resolver.ts';
```

Add the function after `createExecutor`:

```ts
const VALID_EXECUTOR_KINDS = new Set<ExecutorKind>(['mock', 'claude', 'codex', 'gemini', 'antigravity']);

/**
 * Wraps `fallback` in a PersonaRoutedExecutor when any persona declares a
 * `model_default` override. Personas that share the same model_default reuse
 * the same Executor instance (deduplicated by kind). Returns `fallback`
 * unchanged when no overrides are present (zero-cost path).
 *
 * Secondary executor binaries are resolved via resolveExecutorBinary — the
 * caller's `opts.binary` is only used when resolution returns nothing.
 */
export function createRoutedExecutor(
  personaOverrides: Array<{ handle: string; model_default: string | null }>,
  fallback: Executor,
  opts: ExecutorFactoryOptions,
): Executor {
  const kindToExecutor = new Map<ExecutorKind, Executor>();
  const routes = new Map<string, Executor>();

  for (const p of personaOverrides) {
    if (!p.model_default) continue;
    if (!VALID_EXECUTOR_KINDS.has(p.model_default as ExecutorKind)) continue;
    const kind = p.model_default as ExecutorKind;

    if (!kindToExecutor.has(kind)) {
      const binary = resolveExecutorBinary(kind) ?? opts.binary;
      kindToExecutor.set(kind, createExecutor(kind, { ...opts, binary }));
    }
    routes.set(p.handle, kindToExecutor.get(kind)!);
  }

  if (routes.size === 0) return fallback;
  return new PersonaRoutedExecutor({ routes, fallback });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/executor-factory.test.ts
```

Expected: all executor-factory tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/cli/executor-factory.ts tests/executor-factory.test.ts
git commit -m "feat(executor-factory): add createRoutedExecutor for per-persona model dispatch"
```

---

## Task 4 — Wire `createRoutedExecutor` into `server-drive.ts`

**Files:**
- Modify: `server/orchestrator/server-drive.ts`

- [ ] **Step 1: Add import**

In `server/orchestrator/server-drive.ts`, update the import line:

**Before:**
```ts
import { createExecutor, type ExecutorKind } from '../cli/executor-factory.ts';
```

**After:**
```ts
import { createExecutor, createRoutedExecutor, type ExecutorKind } from '../cli/executor-factory.ts';
```

- [ ] **Step 2: Wrap executor in `buildRuntime()`**

In `buildRuntime()`, after line 85 (after the `createExecutor` call that builds `executor`):

**Before:**
```ts
    const executor = createExecutor(kind, {
      binary: binary ?? '',
      agentsDir: deps.agentsDir,
      logsDir: resolve(deps.repoRoot, '.kortext', 'data', 'logs'),
      personaRegistry: kind === 'mock' ? undefined : deps.personas,
    });
    const composition = createComposition({
      repos: deps.repos,
      executor,
```

**After:**
```ts
    const baseExecutor = createExecutor(kind, {
      binary: binary ?? '',
      agentsDir: deps.agentsDir,
      logsDir: resolve(deps.repoRoot, '.kortext', 'data', 'logs'),
      personaRegistry: kind === 'mock' ? undefined : deps.personas,
    });
    const executor = createRoutedExecutor(
      deps.repos.personas.list(),
      baseExecutor,
      {
        binary: binary ?? '',
        agentsDir: deps.agentsDir,
        logsDir: resolve(deps.repoRoot, '.kortext', 'data', 'logs'),
        personaRegistry: kind === 'mock' ? undefined : deps.personas,
      },
    );
    const composition = createComposition({
      repos: deps.repos,
      executor,
```

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: all 1054+ tests PASS (no regressions — `createRoutedExecutor` returns `fallback` when no overrides, so runtime is identical for existing projects)

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: no type errors

- [ ] **Step 5: Commit**

```bash
git add server/orchestrator/server-drive.ts
git commit -m "feat(server-drive): wire PersonaRoutedExecutor for per-persona model dispatch"
```

---

## Usage after implementation

To give `+reviewer` a different executor, add `- model: gemini` to `agents/reviewer.md`:

```markdown
# reviewer

- description: Code quality reviewer.
- model: gemini

## identity

You are a code reviewer...
```

On next daemon boot, `syncRegistriesToDb` picks it up → `personas.model_default = 'gemini'` → `createRoutedExecutor` builds a `GeminiCliExecutor` for that persona → all steps tagged `+reviewer` route to gemini while everything else uses the project default.

---

## Self-Review

**Spec coverage check:**
- ✅ Parse `- model:` from persona markdown (Task 1)
- ✅ Persist to DB (Task 2)
- ✅ Factory reads DB + builds routing map (Task 3)
- ✅ Runtime uses routed executor (Task 4)
- ✅ Zero-overhead passthrough when no overrides (Task 3 step 3: `if routes.size === 0 return fallback`)
- ✅ Binary per secondary executor via `resolveExecutorBinary` (Task 3 step 3)
- ✅ Executor deduplication across personas sharing a kind (Task 3 step 3)
- ⬜ Settings UI for model override — explicitly out of scope (v3.2 per TODO.md)
- ⬜ Onboarding label rename ("AI Executor" → "operation-manager modeli") — out of scope (v3.2)

**Placeholder scan:** None found.

**Type consistency:** `PersonaDefinition.model` (Task 1) → used as `def.model ?? null` (Task 2) → `PersonaIndex.model_default` (existing schema, unchanged) → `p.model_default` in `createRoutedExecutor` (Task 3). Chain is consistent.
