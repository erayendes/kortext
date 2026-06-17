# Kortext v3 — Developer Brief (code side)

## What this folder is

Kortext'in npm paketi (`erayendes/kortext`) + GitHub repo'su. TypeScript runtime + React dashboard + SQLite + worker pool. **Tek kaynak** — eskiden `_docbase/kortext/` ile sync edilen markdown içerikleri (personas, workflows, rules, templates) artık doğrudan burada düzenlenir.

## User profile

Eray is a non-coder, communicates in Turkish, code / commits / comments in English. Treat as product / founder collaborator, not as developer. Show progress with concrete artifacts (file paths, screenshots, working previews). GUI-first — terminal is for system control only.

## Dosya haritası — Claude için: hangi durumda nereye yaz

```
"decisions güncelle" / "bu kararı kaydet"          → docs/DECISIONS.md
"mimari değişti" / "yeni bileşen"                  → docs/pending-update/ARCHITECTURE.md
"tasarım güncelle" / "yeni UI / renk"              → docs/DESIGN.md
"handover yaz" / oturum sonu / "devam notu"        → docs/HANDOVER.md
"todo'ya ekle" / "sonraki iş"                      → docs/TODO.md
"UAT senaryosu" / "kullanıcı testi"                → docs/UAT.md
"wireframe / mockup / concept" (HTML)              → docs/concepts/
"Claude için kural / mapping / behavior"           → CLAUDE.md (bu dosya)
Kod (feature / bug fix / refactor)                 → src/  server/  bin/  mcp/  tests/
Persona / workflow / rule / template düzenleme     → agents/  workflows/  rules/  templates/
```

> **Doküman yeri (2026-06-17):** tüm geliştirici dokümanları `development/`'dan **`docs/`'a** taşındı. Canlı: `docs/{DECISIONS,DESIGN,HANDOVER,TODO,UAT}.md`. Güncellenmeyi bekleyenler: `docs/pending-update/` (ARCHITECTURE, SETUP, USER-GUIDE, PRODUCT). Arşiv: `docs/{concepts,specs,superpowers}/`.

Detaylı mimari için [docs/pending-update/ARCHITECTURE.md](docs/pending-update/ARCHITECTURE.md), karar geçmişi için [docs/DECISIONS.md](docs/DECISIONS.md), aktif faz durumu için [docs/HANDOVER.md](docs/HANDOVER.md).

## Working style — for Claude on code side

- Always provide `★ Insight` blocks when writing code (explanatory output style).
- Eray approves big architectural decisions via AskUserQuestion — don't choose unilaterally.
- Verify before claiming done: screenshot, run tests, show file paths.
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
