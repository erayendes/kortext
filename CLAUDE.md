# Kortext v3.1 — Developer Brief (code side)

## What this folder is

Kortext'in npm paketi (`erayendes/kortext`) + GitHub repo'su. **Analiz beyni:** brief → analiz belgeleri → prime onayı → el sıkışma; kortext kullanıcının kendi kurulu ajan CLI'ını (claude / codex / gemini) headless sürer, kodu kullanıcının kendi ajanı yazar (AGENTS.md kontratı), görevler opsiyonel Kopeng aktarımıyla. Express 5 + SQLite (global `~/.kortext/`) + React 19 panel. Orkestrasyon YOK, MCP sunucusu YOK, rapor üretimi YOK — eski v3 motoru `archive/v3-engine/` arşivinde.

## User profile

Eray is a non-coder, communicates in Turkish, code / commits / comments in English. Treat as product / founder collaborator, not as developer. Show progress with concrete artifacts (file paths, screenshots, working previews). GUI-first — terminal is for system control only.

## Dosya haritası — Claude için: hangi durumda nereye yaz

```
"mimari değişti" / "yeni bileşen"                  → dev/ARCHITECTURE.md
"tasarım güncelle" / "yeni UI / renk"              → dev/DESIGN.md
"UAT / uçtan uca akış / test senaryosu"           → dev/TEST.md
"ürün konumlandırma / marka / persona"             → dev/PRODUCT.md
Kullanıcının okuduğu her şey                       → README.md · docs/
"Claude için kural / mapping / behavior"           → CLAUDE.md (bu dosya)
Kod (feature / bug fix / refactor)                 → server/  ui/  bin/  test/
Persona / workflow / template düzenleme            → agents/  workflows/  templates/
Eski v3 kodu ve tasarım turları (düzenleme YOK)    → archive/
```

> **Doküman yeri (2026-09-04):** okuyucusuna göre ayrıldı.
> **`docs/`** = kullanıcının okuduğu: `GUIDE`, `CHANGELOG` (+ `assets/`). Kök `README.md`
> kurulum dahil her şeyi anlatır — npm paket sayfası onu okur, o yüzden kökte durur. Docusaurus
> sitesi buradan kurulacak.
> **`dev/`** = geliştiricinin okuduğu, dört dosya: `ARCHITECTURE`, `DESIGN`, `PRODUCT`,
> `TEST`. Günlük tutmuyoruz: bir karar ait olduğu belgeye yazılır, açık iş GitHub issue'suna.
> **`archive/`** = bir daha düzenlenmeyecek olan, artık **yalnız yerelde** (`.gitignore`'da):
> `v3-engine/` (eski motor), `DECISIONS.md` (karar günlüğü), `HANDOVER.md` (oturum devir
> notları), `TODO.md` (eski iş listesi), `CHANGELOG-v3.md`, `concepts/` (v2–v6 wireframe ve
> mockup'lar), `specs/`, `superpowers/`.

Detaylı mimari için [dev/ARCHITECTURE.md](dev/ARCHITECTURE.md).

## Working style — for Claude on code side

- Always provide `★ Insight` blocks when writing code (explanatory output style).
- Eray approves big architectural decisions via AskUserQuestion — don't choose unilaterally.
- Verify before claiming done: screenshot, run tests, show file paths.
- **Never push to `origin/main` without Eray explicitly saying so.** Local commits on `main` stay local until Eray says "push" (or equivalent). `Bash(git push origin main)` is permission-allowed for technical reasons, but the behavioral rule overrides: ask first, push second.

## Build / dev / test commands

```bash
npm install && npm --prefix ui install   # install deps (root + panel)
npm run dev                   # server :3441 (tsx watch, --no-open)
npm run dev:web               # vite panel :3442 (proxy /api → 3441)
npm test                      # node:test suite
npm run build                 # tsc → dist/ + vite → ui/dist/
npm run typecheck             # server + panel
npm pack                      # build .tgz (prepack builds)
```
