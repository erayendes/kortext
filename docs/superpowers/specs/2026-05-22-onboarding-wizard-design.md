# Onboarding Wizard — Design Spec (v3.1.0)

**Date:** 2026-05-22
**Status:** Approved (Eray)
**Replaces:** Terminal blueprint edit step in current flow

## Problem

In v3.0.x a first-time user must open a terminal text editor, change YAML frontmatter (`status: uninitialized` → `approved`), and fill 4 markdown sections by hand. This is the single non-coder blocker reported in UAT.

## Goal

After `kortext serve`, the browser opens automatically and lands on a single-page onboarding form. Submitting the form writes `workspace/references/blueprint.md` + `.kortext/project.json` and triggers the right analysis workflow.

## Scope

### In

1. **`kortext init` preflight check** — node ≥22, git ≥2.30, claude/codex/gemini presence + version. Warnings for missing/old; non-fatal (at least one CLI or `--executor=mock`).
2. **`kortext serve` auto-open browser** — platform-aware (`open`/`xdg-open`/`start`); `--no-open` bypass.
3. **`GET /api/blueprint/status`** — returns `{ status, filePath }`.
4. **`POST /api/blueprint`** — accepts form payload, writes blueprint.md + project.json, returns `triggerWorkflowId`.
5. **Frontend route `/onboarding`** — single-page form (mockup 1:1):
   - Project Name (text, 2-60)
   - Project Code (mono, 2-6, `[A-Z0-9]+`, auto-uppercase)
   - Project Type (radio: New project / Existing codebase)
   - Target Platform (multi-select chips: Web / iOS / Android)
   - Blueprint (file dropzone, `.md|.txt`, ≤100KB) + helper panels: Sample MD (read-only + copy + download), AI Prompt (read-only + copy)
   - GitHub Repository (optional, regex)
   - CTA "Initialize project"
6. **RootShell guard** — `blueprint.status === 'uninitialized'|'draft'` → render only `<OnboardingScreen>` (no sidebar/header/polling). Else dashboard.
7. **Orchestrator dynamic trigger** — read `.kortext/project.json` `type` field; `new` → `01a-analysis-pipeline`, `existing` → `01b-onboarding-pipeline`.
8. **Tests** — routes (4-5), preflight (3), onboarding screen smoke (2). Keep 264 passing.

### Out (deferred to later)

- localStorage autosave
- Multi-step stepper
- mDNS `kortext.local`
- Persona/tech-constraint extra wizard fields (Phase B of the original HANDOVER spec)

## Data flow

```
Browser GET /        →  api/blueprint/status  →  uninitialized?
   ├─ yes  →  render <OnboardingScreen>
   └─ no   →  render dashboard

OnboardingScreen submit  →  POST /api/blueprint  →  {
   write workspace/references/blueprint.md (status: approved, body: uploaded MD)
   write .kortext/project.json (name, code, type, platforms, githubRepo, createdAt)
   return { triggerWorkflowId }
}  →  navigate('/')  →  dashboard polls api/runs  →  new run visible
```

BlueprintWatcher fires once on the file change; orchestrator looks up project.json `type` to decide workflow.

## Edge cases

- Re-init while `approved` → onboarding shows "Already initialized" stub with link to dashboard.
- POST during in-flight watcher run → 409 Conflict.
- Malformed blueprint MD (no `---` block) → 422 with parse error.
- Manual `/onboarding` deep-link after approval → bounce to `/`.

## Files

| File | Action |
|---|---|
| `server/cli/preflight.ts` | NEW — preflight check command |
| `server/cli/init.ts` | EDIT — call preflight at top |
| `server/cli/serve.ts` | EDIT — auto-open after ready event |
| `server/routes/blueprint.ts` | NEW — GET status, POST submit |
| `server/index.ts` | EDIT — mount blueprint routes; read project.json for trigger workflow |
| `server/orchestrator/orchestrator.ts` | EDIT — dynamic triggerWorkflowId from project.json |
| `src/routes/onboarding.tsx` | NEW — onboarding screen |
| `src/components/OnboardingScreen.tsx` | NEW — form component |
| `src/router.tsx` | EDIT — add `/onboarding` route; RootShell guard |
| `src/lib/api.ts` + `api-types.ts` | EDIT — new types + fetchers |
| `tests/routes-blueprint.test.ts` | NEW |
| `tests/preflight.test.ts` | NEW |
| `tests/onboarding-smoke.test.tsx` | NEW |

## Acceptance

- `npm test` green (≥264 + new)
- `npm run lint && npm run typecheck && npm run build` clean
- `kortext init` in empty dir + `kortext serve` opens browser at onboarding screen
- Form submit writes blueprint.md + project.json; dashboard shows new run
