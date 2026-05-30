# Kortext — TODO

Açık iş listesi. Yapılan her şey [DECISIONS.md](./DECISIONS.md) tarihçesine taşınır.

---

## Sırada (Faz 13 kapanışı)

- [ ] **Manuel UAT** — Eray makinesinde clean `kortext-uat/` klasörü, `npm pack` + `npm install -g ./kortext-3.X.X.tgz` + `kortext init` + `kortext serve` + Onboarding wizard'da blueprint kabul + new-project-analysis gerçek Claude executor ile koşma. Beklenen: foundation/references/reports doluyor, `pending_questions`'a +prime gate'leri düşüyor, log mesajında "0 step skipped — no persona handle".
- [ ] **v3.1.0 release flow** — `package.json` 3.0.0 → 3.1.0, CHANGELOG `[Unreleased]` → `[3.1.0] — <tarih>` + yeni `[Unreleased]` aç, `git tag v3.1.0`, npm publish (otomatik tetik). Sıralama: Manuel UAT (her iki tur) pass + CLI redesign 11 adım kuyruk pass + v3.0.1 EADDRINUSE fix sonrası.

---

## v3.1.x follow-up (blocker değil — release sonrası)

| Madde | Yer | Durum |
|---|---|---|
| Reports SQL UI revamp | `src/routes/reports.tsx` | `/api/docs/reports` (filesystem) yerine `/api/reports` (SQL `reports_index`); filter chip'leri, tags multi-select, status badge |
| Memory archive dropdown | `src/routes/memory.tsx` | Decisions/Learned tab'larında sol panel TOC navigation; Handovers tab'ında eski `handover-<ts>.md` segmentleri için dropdown |
| `POST /api/backlog` integration test | `tests/` | Route landed, route-level test eksik |
| Footer canlı stats wiring | `src/components/Footer.tsx` | `tkn/s`, `$today`, branch chip'leri hâlâ partial hardcoded |
| Inline markdown save endpoint | `server/routes/docs.ts` | PUT `/api/docs/:scope/:file` — Rules/Workflows/References "Save" butonları için |
| Decisions cards author+quote | Schema + UI | Decision schema'da `author`/`quote` alanı yok; mem-card avatar+quote opsiyonel |
| TimelinePanel.tsx cleanup | `src/components/TimelinePanel.tsx` | Header'dan toggle kaldırıldı, dosya orphan — sil veya yeniden bağla |
| Eski v3.0 `/api/docs/reports` endpoint kaldırma | `server/routes/docs.ts` | UI `/api/reports`'a çevirildikten sonra |

---

## v3.0.1 borç (HANDOVER #51)

- [ ] **`app.listen()` error handler** — EADDRINUSE durumunda Express sessizce listening callback'i atlayıp exit ediyor. Kullanıcı "Cannot GET /" görüyor, gerçek hatayı görmüyor. UAT'ta 6 saat dev server zombie process bu sebeple yanılttı.

---

## CLI/Onboarding redesign — implementation kuyruğu

Yön kararı [DECISIONS Bölüm 0](./DECISIONS.md)'da onaylandı. Sıralı implementation adımları (versiyon numarası Açık sorular'da belirlenecek):

- [ ] **`bin/kortext.ts` argv parser yeniden yaz** — 9 komut: `start [proje]` / `stop` / `pause [proje]` / `list` / `remove [proje]` / `purge [proje]` / `update` / `doctor` / `help`. `init` ve `serve` `start` içine konsolide edilir.
- [ ] **Global registry servisi** — `~/.kortext/projects.json` okuma/yazma + lock; `server/registry/` modülü
- [ ] **Postinstall script** — `scripts/postinstall.mjs`; `detached: true` + `stdio: 'ignore'` + `unref()` ile daemon spawn + tarayıcı aç. Fallback mesajı: "Kortext kuruldu — `kortext start` yaz."
- [ ] **Native folder picker endpoint** — `POST /api/system/pick-folder`; macOS `osascript -e 'choose folder'`, Windows PowerShell `FolderBrowserDialog`, Linux `zenity --file-selection --directory` (yedek `kdialog`)
- [ ] **Onboard route** — `src/routes/onboard.tsx`; proje adı + dizin seç + executor seçimi; submit → backend `initCommand({ targetDir })` çağrı + registry insert + dashboard'a yönlen
- [ ] **Proje listesi ekranı** — registry doluysa açılan ilk ekran: kayıtlı projeler + "Yeni proje başlat" butonu (onboard'a gider)
- [ ] **Multi-project routing** — engine'i `projectId`-aware yap (her proje kendi `.kortext/data/kortext.db` ve worktrees'i kullanır); React Router `/[proje]/dashboard`, `/[proje]/board`, vb.
- [ ] **Daemon lifecycle** — `kortext stop` daemon shutdown (clean), `kortext pause [proje]` worker pool'a "bu proje için yeni step alma" sinyali
- [ ] **`purge` confirmation** — interactive `Are you sure? [y/N]` + dizindeki `.kortext/` rm; readline tabanlı
- [ ] **`kortext update`** — `npm update -g kortext` wrapper + sonra daemon restart
- [ ] **Migration kararı** — v3.1 `init/serve` kullanıcıları yok (clean break, DECISIONS Bölüm 2.9), migration tooling yazılmaz

---

## v3.2.0 — bilinçli ertelenmiş

### Tasarım borçları

- [ ] **Light theme variant** — `--bg-0` token'larını override eden body class
- [ ] **Mobile responsive** — şu an 1280px+ optimize
- [ ] **A11y** — focus states var, aria yok
- [ ] **i18n implementation** — Settings'te seçim statik; gerçek tr/en switch
- [ ] **LocalStorage persistence** — sayfa yenilenince state sıfırlanmasın
- [ ] **⌘K command palette** — şu an disabled ("soon")

### Engine + workflow

- [ ] **Reviewer-as-step runtime** — Faz 13'te reviewer satırları kaldırıldı (Karar C). v3.2'de "agent code review pattern" ele alınmalı: workflow body'sinde `reviewer:` declared edilirse engine post-step otomatik review step ekler (review-notes.md veya pending_question).
- [ ] **Settings/Agents YAZMA editor** — şu an readonly (spec §10); v3.2'de paket immutability problemine bakılır (override pattern yok karar).
- [ ] **`+prime` synthetic persona** için `agents/prime.md` mı yoksa registry'de synthetic mı kalır karar.

### Refactor

- [ ] **`scripts/` klasör adı yanıltıcı** — sadece `copy-migrations.mjs` var (build infrastructure). `tools/` veya `build/` daha açıklayıcı.
- [ ] **Workflow gate hint syntax** — Faz 12.8 `workflow_steps.parallel_with_json` kolonu var ama parser doldurmuyor. Data-flow yeterli olduğu için ertelendi; v3.2'de UI hint (dashboard "phase X paralel") gerekirse ele alınır.
- [ ] **`learned.md` topical split** — şu an tek dosya hep büyür. 50KB+ olduğunda `learned/auth.md`, `learned/payment.md` gibi alt-dosya pattern'ine geçiş.

### Klasör + dosya

- [ ] **`v3.1-uat-guide.md` → `UAT-GUIDE.md`** rename oldu, içerik güncellenmeli (foundation/ + ALL-CAPS + new test count 382).

---

## Açık sorular (Eray ile konuşulacak)

- **`scripts/` rename mi tutalım mı** — yanıltıcı ad ama tek dosya, marjinal fayda
- **v3.0.1 borç (app.listen)** — bu sıraya ne zaman alınır (v3.1 release öncesi şart, EADDRINUSE bug fix)
- **Manuel UAT 1. tur zamanı** — şimdi mi (mevcut `init/serve` ile) yoksa CLI redesign sonrası tek tur mu

> **Karar verildi (2026-05-27):** v3.1 = devasa sürüm = Faz 11-13 birikmiş iş + CLI redesign hepsi tek atışta. Bkz. [DECISIONS Bölüm 0](./DECISIONS.md).

---

## Yapılanlar (referans)

[DECISIONS.md Bölüm 8 — Tarihçe](./DECISIONS.md#bölüm-8--tarihçe-özet) tüm fazların özetini içerir. Detay için `git log development/HANDOVER.md`.
