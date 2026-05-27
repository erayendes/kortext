# Kortext — TODO

Açık iş listesi. Yapılan her şey [DECISIONS.md](./DECISIONS.md) tarihçesine taşınır.

---

## Sırada (Faz 13 kapanışı)

- [ ] **Manuel UAT** — Eray makinesinde clean `kortext-uat/` klasörü, `npm pack` + `npm install -g ./kortext-3.X.X.tgz` + `kortext init` + `kortext serve` + Onboarding wizard'da blueprint kabul + 01a-analysis-pipeline gerçek Claude executor ile koşma. Beklenen: foundation/references/reports doluyor, `pending_questions`'a +prime gate'leri düşüyor, log mesajında "0 step skipped — no persona handle".
- [ ] **PR aç + main'e merge** — `feat/v3.1-workflow-content` branch'i (~30 commit) → main. Squash vs merge tercih Eray.
- [ ] **v3.2.0 release flow** — `package.json` 3.1.0 → 3.2.0, CHANGELOG, tag, npm publish (otomatik tetik).

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

- [ ] **`development/internal/` kalıntıları temizle** — `ROADMAP-v3.md` (Faz 0-10 donmuş; DECISIONS.md §5 tarihçesinde özet var). Eğer history dokümantasyonu için kalsın diyorsan `development/archive/`'e taşı.
- [ ] **CLAUDE.md (proje kökü)** — Faz 13 cleanup'ında "bayat" işaretlendi (skills/, workspace/, legacy/, _docbase sync mantığı atıl). v3.1 disipline ile güncellenecek.
- [ ] **`v3.1-uat-guide.md` → `UAT-GUIDE.md`** rename oldu, içerik güncellenmeli (foundation/ + ALL-CAPS + new test count 382).
- [ ] **HANDOVER-v3.md → HANDOVER.md** rename oldu, sonraki turun içeriğiyle güncellenmeli (Faz 13 + UAT durumu).

---

## Açık sorular (Eray ile konuşulacak)

- **`scripts/` rename mi tutalım mı** — yanıltıcı ad ama tek dosya, marjinal fayda
- **`internal/ROADMAP-v3.md`** — sil mi (DECISIONS.md tarihçesi yeterli), arşivle mi (`archive/` klasör)
- **v3.0.1 borç (app.listen)** — bu sıraya ne zaman alınır
- **Manuel UAT zamanı** — şimdi mi yarına mı

---

## Yapılanlar (referans)

[DECISIONS.md §5 — Tarihçe](./DECISIONS.md#bölüm-5--tarihçe-özet) tüm fazların özetini içerir. Detay için `git log development/HANDOVER.md`.
