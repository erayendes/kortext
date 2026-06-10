# Kortext — TODO

Açık iş listesi. **Bitmiş işler buradan çıkarılır** → tarihçe [DECISIONS.md](./DECISIONS.md)'de, son durum [HANDOVER.md](./HANDOVER.md)'de.

---

## ✅ ÇÖZÜLDÜ (KRİTİK UAT #10, 2026-06-09 #10h, Claude) — Epic auto-create BASE full-mode ingest'i kapsamıyordu → backlog BOŞ

> **Belirti:** Temiz UAT (antigravity→codex→claude). Backlog DB **tamamen boş (total 0)** — `backlog.ingest.summary` full-mode: `created 0, skipped 8`, 8 task da `FOREIGN KEY constraint failed`. **Kök neden:** ajan 8 task'ı çıplak `parent_epic: <id>` + `type:epic` container OLMADAN yazdı; BASE full-mode ingest eksik epic'i önce yaratmıyordu → her insert FK ihlali → backlog boş. #10 epic-auto-create yalnız `patchBacklogItems`'taydı, full-mode'u kapsamıyordu.

**Yapıldı (TDD, 1241 test yeşil, typecheck + build temiz — push EDİLMEDİ):**
- ✅ **Tek ortak helper `synthesizeMissingEpics(repos, parsed)`:** items içinde `type:epic` container'ı OLMAYAN + DB'de de bulunmayan her çıplak `parent_id` için placeholder epic'i (id=title) ÖNCE yaratır. **Hem base full-mode `ingestBacklogItems` HEM patch-mode `patchBacklogItems` bunu kullanıyor** (tek kaynak). Audit `backlog.epic_synthesized`.
- ✅ **FK-dayanıklı base insert:** full-mode insert loop'unda `parent_id` çözülemiyorsa (epic yazılamadı/dangling) item düşmez — link null'lanır + `backlog.ingest.dangling_parent` uyarısı, item + enrichment'i (version/owner/model) yine yazılır. Backlog ASLA boş kalmaz.
- ✅ **Sentez sırası:** `deriveSyntheticEpics` (epic: label) + `enforceSymmetricDeps` SONRA `synthesizeMissingEpics` (bare parent_epic id) → insert loop'tan ÖNCE → FK hedefi hep var.
- ✅ **Kanıt:** uçtan-uca harness (gerçek `ingestBacklogFile` full path) İKİ ajan varyasyonuyla — (A) çıplak parent_epic, epic container yok (kırık UAT şekli) + (B) epic'i type:epic item yazan: ikisinde de total>0, epic auto-created, her task linked + version/owner/model dolu, FK skip yok.
- ✅ **(ikincil) Workflow:** `planning-pipeline.md` step-1 zaten epic'i `type:epic` item üretmeye zorluyor (#10b) + motor son-çare fallback'i belirtiyor — fix bu vaadi base full-mode için de gerçek yaptı.

---

## 🤖 Çok-modelli executor — onboarding seçimi = operation-manager modeli (2026-06-08, UAT/Eray vizyonu)

> Şu an executor **proje genelinde tek** (`project.json.executor`) — her persona/adım aynı CLI'yi kullanıyor. Eray'ın istediği model: onboarding'de seçilen executor **sadece operation-manager (orkestratör) içindir**; sonrasında **birden çok model eşzamanlı** çalışabilmeli (persona/görev bazında farklı executor — örn. analiz adımları agy, kritik kodlama claude, vb.).

- [ ] **Onboarding semantiği:** "AI Executor" alanını "operation-manager modeli" olarak çerçevele (etiket + yardım metni). Bu seçim orkestratörün modeli olur.
- [ ] **Settings/Agents:** her persona için model/executor override edilebilir alan (v3.2 yazma kapsamıyla uyumlu).

---

## 🚀 v3.1 release + CLI follow-up (2026-06-06)

> v3.1 CLI per-project-daemon **tamam** (11 görev, 835 test, paketlenmiş smoke test geçti). Kalan:

- [ ] **PUBLISH:** Eray "push" → `git push origin main`, ardından `npm publish` (kasıtlı manuel adım). Yayın sonrası mevcut global `/opt/homebrew/bin/kortext` eski → `kortext update` veya yeniden global install.

---

## 🔧 Faz-3 + Motor dilimleri follow-up (2026-06-06)

> Motor/şema epic §5.9 ana iş **bitti + main'de**. Kalan:

- [ ] **Prod push (CI) substratı:** `git push origin main`/CI tetikleme; gerçek prod altyapısı gelince.
- [ ] **Full planning pipeline canlı dayanıklılık:** `dev:run planning-pipeline --executor=claude` step-1'i ürtti ama bir sonraki zenginleştirme adımında askıda kaldı (~70dk, kill). Adım-zaman aşımı / hung-claude tespiti + full 9-adım uçtan uca canlı koşu (auto-approve poller ile) ayrı teyit.

---

## 🔍 UAT bulguları — canlı koşu UI incelemesi (2026-06-06, TaskFlow sandbox)

> Eray `kortext-live-uat-v2` verisini gerçek UI'da gezdi. Aşağısı kalan boşluklar.

**A. Board (`src/routes/board.tsx`)**
- [ ] **Dependency gösterilmiyor** — drawer'da blocks/blocked_by yok.
- [ ] **item-id'ler slug** — `init-nextjs-project` gibi slug'lar var; proje-kodlu kısa id konvansiyonu (`TF-001`) yok → persona/workflow kalibrasyonu (D) gerek.

**B. Dashboard (`src/routes/dashboard.tsx`)**
- [ ] **Active work / For review boş** — koşu bittiği için boş (beklenen). Netleştir: bitmiş koşu geçmişi gösterilmeli mi, yoksa "boş = doğru" mu.

**D. İçerik / persona kalibrasyonu**
- [ ] **⚠️ Dependency üretimi (içerik) — KALAN BOŞLUK** — sertleştirilmiş talimata rağmen ajan faz-3 koşusunda **0 dependency** üretti (büyük step-1'de alt-madde gözden kaçtı). Şu an **yalnız görsel** boşluk: motor `blocked_on`'a göre iş sıralamıyor. Daha güvenilir çözüm: planning'e **yalnız dependency atayan ayrı bir adım**. Eray kararı: şimdilik ertele.
- [ ] **⚠️ Epic-id konvansiyonu — KALAN BOŞLUK** — ajan task'lara `TF-NNN` uyguladı ama epic'lere `<CODE>-E01` uygulamadı; epic'ler hâlâ slug (`epic-seo-legal`). Eray kararı: şimdilik ertele.

---

## ⭐ Sırada

- [ ] **İçerik kalibrasyonu (ölçüldü, ayrı karar):** `rules/behavior.md` 16 KB (~4K token, her adımda — ama claude'da cache'li, codex/gemini'de stable prefix'te) · en büyük persona `engineering-manager.md` 13.8 KB. Kırpma davranış riski taşır (hangi kural hangi UAT fix'ine bağlı) → Eray onayıyla ayrı tur.
- [ ] **Concurrency knob'ları (opsiyonel)** — workflow-içi `concurrency=3` (`worker-pool`/`commands.ts`) ve `maxConcurrentWorktrees=10` ayarlanabilir tavanlar. Eray "daha fazla paralel" isterse yükselt; gerçek ajanlarda kaynak/maliyet ödünleşimi var.
- [ ] **Standalone CLI'a ingester bağla** — `kortext start` (commands.ts) `safetyGuards` almıyor → ingester sadece backend (onboarding/drive) yolunda ateşleniyor. CLI yolunu da besle.
- [ ] **`/api/backlog` gerçek sayfalama** — faz-1'de Board+Dashboard `?limit=500` ile band-aid yapıldı. Gerçek sayfalama/sonsuz-kaydırma >500 item'lı projeler için açık kalır.
- [ ] **Transient retry — codex/gemini executor** — `spawnCliWithRetry` paylaşımlı helper hazır; codex/gemini executor'ları hâlâ `spawnCli`'ı doğrudan çağırıyor.
- [ ] **Manuel UAT (paketlenmiş)** — clean klasör + `npm pack` + `npm install -g ./kortext-3.X.X.tgz` + `kortext init` + `kortext serve` ile **paketlenmiş** akışın doğrulaması (bu oturum kaynak-modda UAT yaptı; tgz akışı ayrı).
- [ ] **v3.1.0 release flow** — `package.json` 3.0.0→3.1.0, CHANGELOG `[Unreleased]`→`[3.1.0]` + yeni `[Unreleased]`, `git tag v3.1.0`, npm publish. Sıralama: paketlenmiş UAT pass + CLI redesign kuyruğu + v3.0.1 EADDRINUSE fix sonrası.

---

## Motor — ertelenen backend dilimleri

> Motor/şema epic §5.9 ana iş **bitti + main'de** (lifecycle + capstone + son montaj + driver + `POST /api/drive` + scheduler). Tarihçe [DECISIONS §5](./DECISIONS.md). Aşağısı = dilim-içi ertelenen alt-işler.

- [ ] **blocker-temizle (§5.9 #6)** — closure'da `clearBlockedDependents` var ama `blocked` status-flip modeli ayrı; UAT #9 #1 fix'i bağımlılığı scheduler'da (`selectBuildableItems`) çözüyor. (Eray: şema-tabanlı blocked modeli ertelendi.)
- [ ] **Board "sıra kimde" rozetini bağla (src/)** — `whoseTurn(item)` türetimi hazır (`server/orchestrator/whose-turn.ts`) ama tüketen UI yok. Kart üstüne dönen persona rozetleri (test→paralel, review→+prime, in_progress→owner).

---

## UI — açık parçalar

- [ ] **#9 global arama** — header ⌘K paleti var ama gerçek arama backend'ine bağlı değil ("SOON").
- [ ] **#10 terminal = komut girişi** — şu an salt-okunur run-history timeline; gerçek komut girişi.
- [ ] **Canlı gate pass/fail** — `gate_runs` panelde (şu an gate'ler `itemGates` ile statik; UI gate_runs'ı tüketmiyor — `board-drawer.ts:433` notu). **Artık gerçek verdict verisi var** (UAT #9 #4 → gate_runs gerçek pass/fail + findings) → API'de expose + drawer'da göster bekliyor.
- [ ] **Global parçaları gerçek veriye bağla** — v6'da ⌘K/bildirim/terminal kabuk-seviyesinde çalışıyor, gerçek veri akışına tam bağlanması.
- [ ] **Version selector semantiği** — proje sürümü / snapshot / release? netleştir.

---

## v3.1.x follow-up (release sonrası, blocker değil)

| Madde | Yer | Durum |
|---|---|---|
| Reports SQL UI revamp | `src/routes/reports.tsx` | `/api/docs/reports` (fs) → `/api/reports` (SQL `reports_index`); filter/tags/status |
| Memory archive dropdown | `src/routes/memory.tsx` | Decisions/Learned TOC; Handovers eski `handover-<ts>.md` dropdown |
| `POST /api/backlog` integration test | `tests/` | route-level test eksik |
| Footer canlı stats wiring | `src/components/Footer.tsx` | `tkn/s`, `$today`, branch chip'leri partial hardcoded |
| Inline markdown save endpoint | `server/routes/docs.ts` | PUT `/api/docs/:scope/:file` — Rules/Workflows/References "Save" |
| Decisions cards author+quote | Schema + UI | Decision schema'da `author`/`quote` yok |
| TimelinePanel.tsx cleanup | `src/components/TimelinePanel.tsx` | orphan — sil veya yeniden bağla |
| Eski `/api/docs/reports` kaldır | `server/routes/docs.ts` | UI `/api/reports`'a çevrildikten sonra |

---

## İçerik review turu (Faz 13 kalibrasyon)

`development/` cleanup bitince çekirdek akış dosyalarının içeriği gözden geçirilecek:

- [ ] `templates/AGENTS.md` (AI bootstrap) · `agents/*.md` (14 persona) · `rules/*.md` (6 rule) · `workflows/*.md` (10 workflow) · `templates/{foundation,references,reports,memory,backlogs}/*.md` (iskelet).
- [ ] Bilinen risk: `existing-project-analysis.md` (hızlı yazıldı, kalibre), `spike-pipeline.md` (dinamik persona oversimplification).
- [ ] **Stale `.py` komut katmanı (geniş Faz 13)** — backlog-dışı v2 script atıfları hâlâ var: `kortext-session-start.py`, `kortext-item-start.py`, `kortext-item-transition.py`, `kortext-handover.py`, `kortext-lock.py`, `kortext-consistency-check.py`, `kortext-context-check.py`, `kortext-item-check.py`, `kortext-backlog-{done,health,sync}.py` (rules/commands.md "Çağrılan Script" sütunu + agents/workflows/templates). v3 TS runtime'da bu script'ler yok → komut katmanını gerçek mekanizmaya (engine/UI tetikleme) göre baştan kalibre et.

---

## v3.2.0 — bilinçli ertelenmiş

**Tasarım/UI:** mobile responsive (şu an 1280px+) · a11y (focus var, aria yok) · i18n (Settings seçimi statik; gerçek tr/en) · LocalStorage persistence.

**Engine + workflow:** reviewer-as-step runtime (Faz 13'te kaldırıldı; "agent code review pattern") · Settings/Agents YAZMA editor (şu an readonly; paket immutability) · `+prime` synthetic persona (`agents/prime.md` mi registry'de mi).

**Refactor:** `scripts/` rename (tek dosya `copy-migrations.mjs` → `tools/`/`build/`?) · workflow gate hint syntax (`parallel_with_json` parser doldurmuyor) · `learned.md` topical split (50KB+ olunca).

**Dosya:** `UAT-GUIDE.md` içerik güncelleme (foundation/ + ALL-CAPS + güncel test sayısı).

---

## Açık sorular (Eray ile)

- `scripts/` rename tutalım mı (yanıltıcı ad ama tek dosya, marjinal fayda).
