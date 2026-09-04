# Kortext v1.0 — Developer Brief (code side)

## What this folder is

Kortext'in npm paketi (`erayendes/kortext`) + GitHub repo'su. **Pasif proje beyni:** brief → analiz belgeleri → onay → rapor; işi kullanıcının kendi coding ajanı yapar (AGENTS.md kontratı), görevler opsiyonel Kopeng aktarımıyla. Express + SQLite (global `~/.kortext/`) + React panel + MCP. Orkestrasyon YOK — eski v3 motoru `archive/v3-engine/` arşivinde (karar: dev/DECISIONS.md Bölüm 18).

## User profile

Eray is a non-coder, communicates in Turkish, code / commits / comments in English. Treat as product / founder collaborator, not as developer. Show progress with concrete artifacts (file paths, screenshots, working previews). GUI-first — terminal is for system control only.

## Dosya haritası — Claude için: hangi durumda nereye yaz

```
"decisions güncelle" / "bu kararı kaydet"          → dev/DECISIONS.md
"mimari değişti" / "yeni bileşen"                  → dev/ARCHITECTURE.md
"tasarım güncelle" / "yeni UI / renk"              → dev/DESIGN.md
"handover yaz" / oturum sonu / "devam notu"        → dev/HANDOVER.md
"todo'ya ekle" / "sonraki iş"                      → dev/TODO.md
"UAT senaryosu" / "kullanıcı testi"                → dev/UAT.md
"ürün konumlandırma / marka / persona"             → dev/PRODUCT.md
"uçtan uca akış / simülasyon"                      → dev/SIMULATION.md
Kullanıcının okuduğu her şey                       → docs/
"Claude için kural / mapping / behavior"           → CLAUDE.md (bu dosya)
Kod (feature / bug fix / refactor)                 → server/  ui/  bin/  test/
Persona / workflow / template düzenleme            → agents/  workflows/  templates/
Eski v3 kodu ve tasarım turları (düzenleme YOK)    → archive/
```

> **Doküman yeri (2026-09-04):** okuyucusuna göre ayrıldı.
> **`docs/`** = kullanıcının okuduğu: `README`, `CHANGELOG`, `SETUP`, `USER-GUIDE`. Docusaurus
> sitesi buradan kurulacak.
> **`dev/`** = geliştiricinin okuduğu, sekiz dosya: `ARCHITECTURE`, `DECISIONS`, `DESIGN`,
> `HANDOVER`, `PRODUCT`, `SIMULATION`, `TODO`, `UAT`.
> **`archive/`** = bir daha düzenlenmeyecek olan: `v3-engine/` (eski motor), `concepts/`
> (v2–v6 wireframe ve mockup'lar), `specs/`, `superpowers/`.

Detaylı mimari için [dev/ARCHITECTURE.md](dev/ARCHITECTURE.md), karar geçmişi için [dev/DECISIONS.md](dev/DECISIONS.md), aktif faz durumu için [dev/HANDOVER.md](dev/HANDOVER.md).

## Working style — for Claude on code side

- Always provide `★ Insight` blocks when writing code (explanatory output style).
- Eray approves big architectural decisions via AskUserQuestion — don't choose unilaterally.
- Verify before claiming done: screenshot, run tests, show file paths.
- **Never push to `origin/main` without Eray explicitly saying so.** Local commits on `main` stay local until Eray says "push" (or equivalent). `Bash(git push origin main)` is permission-allowed for technical reasons, but the behavioral rule overrides: ask first, push second.

## Build / dev / test commands

```bash
npm install && npm --prefix ui install   # install deps (root + panel)
npm run dev                   # server :4200 (tsx watch, --no-open)
npm run dev:web               # vite panel :5300 (proxy /api → 4200)
npm test                      # node:test suite
npm run build                 # tsc → dist/ + vite → ui/dist/
npm run typecheck             # server + panel
npm pack                      # build .tgz (prepack builds)
```
