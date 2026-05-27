# Kortext v3 — Developer Brief (code side)

## What this folder is

This is the **code/repo side** of Kortext v3 — the npm package source (`erayendes/kortext`) and the GitHub repo. TypeScript runtime + React dashboard + SQLite + worker pool for autonomous AI agent teams.

**Eray (the founder) does not edit anything in this folder.** All persona/workflow/rule content lives in `_docbase/kortext/` and is synced here only so npm publish can ship it.

## Repo split (READ FIRST)

```
_docbase/kortext/   ← Eray's workspace. Source of truth for personas / workflows / rules.
_codebase/kortext/  ← THIS folder. Git + npm. Code + synced md copy + development docs.
```

**Sync rule (one-way, _docbase → _codebase):**
- Eray edits persona / workflow / rule files in `_docbase/kortext/`.
- When Eray says **"sync md"** (or similar), Claude runs:
  ```bash
  cd /Users/erayendes/Documents/_codebase/kortext
  for d in agents rules workflows skills workspace; do
    rsync -av --delete "/Users/erayendes/Documents/_docbase/kortext/$d/" "./$d/"
  done
  ```
- Never edit `agents/ rules/ workflows/ skills/ workspace/` here directly — they get wiped on next sync.
- `development/` is **codebase-only** — NOT synced. Düzenle, sil, yeni dosya ekle serbest.

## User profile

Eray is a non-coder, communicates in Turkish, code / commits / comments in English. Treat as product / founder collaborator, not as developer. Show progress with concrete artifacts (file paths, screenshots, working previews). GUI-first — terminal is for system control only.

## Dosya haritası — Claude için: hangi durumda nereye yaz

```
"decisions güncelle" / "bu kararı kaydet"          → development/DECISIONS.md
"mimari değişti" / "yeni bileşen"                  → development/ARCHITECTURE.md
"tasarım güncelle" / "yeni UI / renk"              → development/DESIGN.md
"handover yaz" / oturum sonu / "devam notu"        → development/HANDOVER.md
"todo'ya ekle" / "sonraki iş"                      → development/TODO.md
"UAT senaryosu" / "kullanıcı testi"                → development/UAT-GUIDE.md
"wireframe / mockup / concept" (HTML)              → development/concepts/
"Claude için kural / mapping / behavior"           → CLAUDE.md (bu dosya)
Kod (feature / bug fix / refactor)                 → src/  server/  bin/  mcp/  tests/
Persona / workflow / rule değişikliği              → ❌ önce _docbase/kortext/'te yap, sonra "sync md"
```

Detaylı mimari için [development/ARCHITECTURE.md](development/ARCHITECTURE.md), karar geçmişi için [development/DECISIONS.md](development/DECISIONS.md), aktif faz durumu için [development/HANDOVER.md](development/HANDOVER.md).

## Working style — for Claude on code side

- Always provide `★ Insight` blocks when writing code (explanatory output style).
- Eray approves big architectural decisions via AskUserQuestion — don't choose unilaterally.
- Verify before claiming done: screenshot, run tests, show file paths.
- Never edit `agents/ rules/ workflows/ skills/ workspace/` in this folder — synced from `_docbase`.
- **Never push to `origin/main` without Eray explicitly saying so.** Local commits on `main` stay local until Eray says "push" (or equivalent). `Bash(git push origin main)` is permission-allowed for technical reasons, but the behavioral rule overrides: ask first, push second.

## Build / dev / test commands

```bash
npm install                   # install deps
npm run dev                   # vite frontend + express backend (concurrent)
npm test                      # vitest
npm run build                 # production build
npm run typecheck             # tsc --noEmit
npm pack                      # build .tgz
```
