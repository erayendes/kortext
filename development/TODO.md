# Kortext — TODO

Açık iş listesi. **Bitmiş işler buradan çıkarılır** → tarihçe [DECISIONS.md](./DECISIONS.md)'de, son durum [HANDOVER.md](./HANDOVER.md)'de.

---

## ⭐ Sırada

- [x] ~~**"Proje hazırlanıyor" ekranı — etkileşim bug'ları**~~ ✅ (2026-06-05, commit `575ca49`). Dört bug da çözüldü + tarayıcıda kanıtlandı: (1) hash deep-link normalizer (`main.tsx`) — çıplak `/initializing` artık `/#/initializing`'e yazılıp doğru ekrana iniyor; (2) satırdaki Onayla gerçek `<button>` + `stopPropagation` → drawer açmadan inline onaylıyor (DB'de `answered`/`approve` doğrulandı); (3) satırdaki Revize drawer'ı doğrudan revize modunda açıyor; (4) <560px sidebar ikon-moduna iniyor, satır butonları kırpılmıyor, drawer tam-genişlik.
- [x] ~~**Kapı Faz 2 — "revize tek başına döner"**~~ ✅ (2026-06-05, commit `7e56755`, DECISIONS Bölüm 14.2). `reject` artık run'ı abort ETMİYOR — sadece reddedilen adımı yerinde yeniden üretiyor (`done`'dan düşür + fire-marker temizle → scheduler yeniden başlatır), onaylanan kardeşler durur, run yaşar. `reviseFeedback` revize nedenini re-execution'a taşır (claude prompt'una girer). `retryRun` artık yalnız crash-recovery (`orphaned:`) için. Yeni paralel test LEGAL∥GROWTH'ta GROWTH revize→onay'ı kanıtlıyor. **745 test yeşil.**
- [x] ~~**Canlı koşu — kapı revize semantiği (§14.2)**~~ ✅ (2026-06-05). Gerçek Claude ile sandbox `kortext-live-uat`'ta tam zincir koştu: onboarding (TaskFlow BRD) → analysis (12 adım, +prime kapıları) → planning-pipeline → Board. **§14.2 canlı kanıtlandı:** LEGAL ∥ GROWTH iki kapı aynı anda açıldı; LEGAL onaylandı (durdu), GROWTH revize edildi → **tek başına yeniden üretildi** (251→184 satır), Claude revize geri-bildirimini prompt'tan aldı (frontmatter'a `revision_note: …ASO and paid channels removed; KPIs limited to 3` yazdı — birebir benim feedback'im), `gate.rejected → regenerate_step: product-analysis.2`, run `running` kaldı (abort YOK). Board'a 100 item ingest edildi.
- [x] ~~**⚠️ Canlı koşu BULGUSU — backlog enrichment + step-8 raporu**~~ ✅ (2026-06-05, DECISIONS §14.7). İki bulgu da giderildi (Eray: "ikisi birden" + "var olanı güncelle"). **(A) epic/version/model:** (1) ingester artık **upsert** — var olan id'yi atlamak yerine planning kolonlarını günceller (`updatePlanningFields`, status/owner'a dokunmaz), `updated[]` döner → her enrichment adımı backlog.yaml'i baştan yazınca katkılar birikiyor; (2) `deriveSyntheticEpics` — düz `epic:` etiketinden gerçek `type: epic` türetir (kemer+askı); (3) `workflows/planning-pipeline.md` yeniden yazıldı — ölü `update_backlog_item` MCP atıfları temizlendi, her adım "oku→uygula→bütün dosyayı yeniden yaz", her adım backlog.yaml'i **ek output** olarak verir (token zinciri sıralamayı sürdürür, DAG döngüsüz — `buildGraph` lineer 1→9 doğrular), step-0 `type: epic`+`parent_epic` zorunlu. **(B) step-8:** `output-resolver` `<ts>` pattern'i gevşetildi (compact `20260605` / date-only `2026-06-05` / `20260605-1959` eşler, çöp reddedilir). **+6 test, 751 yeşil.** Uçtan uca kanıt (in-memory): skeleton→enriched ingest → Board 1 epic/2 child/3 version/3 model (eskiden 0/0/0).
- [ ] **Concurrency knob'ları (opsiyonel)** — workflow-içi `concurrency=3` (`worker-pool`/`commands.ts`) ve `maxConcurrentWorktrees=10` ayarlanabilir tavanlar. Eray "daha fazla paralel" isterse yükselt; gerçek ajanlarda kaynak/maliyet ödünleşimi var. Ayrıca `run-item.ts` dev-cycle adımları caller concurrency'sini almıyor (default 3) — istenirse thread'le.
- [x] ~~**Backlog köprüsü — zenginleştirme**~~ ✅ (2026-06-05, DECISIONS §14.7). Çözüldü: "id'ye göre güncelle" köprüsü = **upsert** (`updatePlanningFields`) eklendi + her enrichment adımı backlog.yaml'i baştan yazıp ek-output verir → qa/security/designer/version/model katkıları artık DB'ye iniyor. Açık soru (step-1 güçlendir mi / update köprüsü mü) **ikisi birden** ile yanıtlandı.
- [ ] **Standalone CLI'a ingester bağla** — `kortext start` (commands.ts) `safetyGuards` almıyor → ingester sadece backend (onboarding/drive) yolunda ateşleniyor. CLI yolunu da besle.
- [ ] **Tek-seferlik kesintisiz canlı koşu** — sıfırdan onboarding → analiz → planning → Board (~25dk, executor=claude, UAT kum havuzu). Her halka ayrı kanıtlandı; kesintisiz tam zincir koşulmadı.
- [ ] **Manuel UAT (paketlenmiş)** — clean klasör + `npm pack` + `npm install -g ./kortext-3.X.X.tgz` + `kortext init` + `kortext serve` ile **paketlenmiş** akışın doğrulaması (bu oturum kaynak-modda UAT yaptı; tgz akışı ayrı).
- [ ] **v3.1.0 release flow** — `package.json` 3.0.0→3.1.0, CHANGELOG `[Unreleased]`→`[3.1.0]` + yeni `[Unreleased]`, `git tag v3.1.0`, npm publish. Sıralama: paketlenmiş UAT pass + CLI redesign kuyruğu + v3.0.1 EADDRINUSE fix sonrası.

---

## Motor — ertelenen backend dilimleri

> Motor/şema epic §5.9 ana iş **bitti + main'de** (lifecycle + capstone + son montaj + driver + `POST /api/drive` + scheduler). Tarihçe [DECISIONS §5](./DECISIONS.md). Aşağısı = dilim-içi ertelenen, numaralı maddeye girmeyen alt-işler.

- [ ] **`gate_runs` uat verdict** — uat red sebebi şu an `audit_log`'da; `gate_runs` satırına yazmak için `attempt` tuzağı çözülmeli (0-test-gate + tekrarlı-bounce'ta `UNIQUE(item_id, attempt, gate='uat')` çakışır → `attempt`'i item alanı yap veya test-cycle marker üretsin).
- [ ] **Handover-on-close** — kapanış başarılıysa (merge ok) `HandoverEngine.record()` ile kapanış handover'ı (developer→prime, completed/next).
- [ ] **blocker-temizle (§5.9 #6)** — KARŞILIKSIZ: item bağımlılık modeli (`blocked_on`/`blocks`) şemada yok. Bağımlılık modeli tasarlanırsa kapanışta downstream item'ları unblock et. (Eray: şimdilik ertele.)
- [ ] **Gate-persona staging raporları (§5.11)** — epic'te gate koşmuş personalar (qa/security/designer/EM/devops) tek-dosya rapor yazar (paralel), motor toplar.
- [ ] **Prime staging onayı (§5.11)** — staging deploy sonrası motor prime'a "staging onayı" sorar; onay→version ilerler, red→bug açılır.
- [ ] **Epic-status-flip** — epic bittiğinde epic item'ını board'da `done` göster (epic'ler review→done yolundan geçmiyor → container-completion için ayrı geçiş/türetilmiş done).
- [ ] **Board "sıra kimde" rozetini bağla (src/)** — `whoseTurn(item)` türetimi hazır (`server/orchestrator/whose-turn.ts`) ama tüketen UI yok. Kart üstüne dönen persona rozetleri (test→paralel, review→+prime, in_progress→owner).
- [ ] **Preview wiring + persistence** — item `test`'e girince `previewManager.startFor`; closure'da `stopFor`. "Çalıştırılabilir/UI görev mi?" koşulu (§5.7, flag ile gate'le). Preview URL'i gate'ler + prime UAT'a sun (`runtime_artifacts`'a `preview` kind'ı veya item-merkezli sakla).

---

## UI — açık parçalar

- [ ] **#9 global arama** — header ⌘K paleti var ama gerçek arama backend'ine bağlı değil ("SOON").
- [ ] **#10 terminal = komut girişi** — şu an salt-okunur run-history timeline; gerçek komut girişi.
- [ ] **Canlı gate pass/fail** — `gate_runs` panelde (şu an gate'ler body `## Review Gates`'ten statik).
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

## v3.0.1 borç

- [ ] **`app.listen()` error handler** — EADDRINUSE'da Express sessizce listening callback'i atlayıp exit ediyor; kullanıcı "Cannot GET /" görüyor. UAT'ta zombie process yanılttı.

---

## CLI/Onboarding redesign — implementation kuyruğu

Yön [DECISIONS Bölüm 0](./DECISIONS.md)'da onaylı. Sıralı adımlar:

- [ ] **`bin/kortext.ts` argv parser** — 9 komut: `start [proje]`/`stop`/`pause [proje]`/`list`/`remove [proje]`/`purge [proje]`/`update`/`doctor`/`help`. `init`+`serve` → `start` içine konsolide.
- [ ] **Global registry servisi** — `~/.kortext/projects.json` oku/yaz + lock; `server/registry/`.
- [ ] **Postinstall script** — `scripts/postinstall.mjs`; `detached:true`+`stdio:'ignore'`+`unref()` daemon spawn + tarayıcı. Fallback: "Kortext kuruldu — `kortext start` yaz."
- [ ] **Native folder picker endpoint** — `POST /api/system/pick-folder`; macOS `osascript`, Windows PowerShell, Linux `zenity`/`kdialog`. (Not: onboarding'de `pick-directory` zaten var — bununla birleştir/genişlet.)
- [ ] **Onboard + proje listesi route** — registry doluysa proje listesi + "Yeni proje başlat".
- [ ] **Multi-project routing** — engine `projectId`-aware (her proje kendi `.kortext/data/kortext.db`); `/[proje]/dashboard` vb.
- [ ] **Daemon lifecycle** — `stop` clean shutdown, `pause [proje]` worker pool sinyali.
- [ ] **`purge` confirmation** — interactive `[y/N]` + `.kortext/` rm.
- [ ] **`kortext update`** — `npm update -g kortext` + daemon restart.
- [ ] **Migration kararı** — v3.1 clean break (DECISIONS Bölüm 2.9), migration tooling yok.

---

## İçerik review turu (Faz 13 kalibrasyon)

`development/` cleanup bitince çekirdek akış dosyalarının içeriği gözden geçirilecek:

- [ ] `templates/AGENTS.md` (AI bootstrap) · `agents/*.md` (14 persona) · `rules/*.md` (6 rule) · `workflows/*.md` (10 workflow) · `templates/{foundation,references,reports,memory,backlogs}/*.md` (iskelet).
- [ ] Bilinen risk: `existing-project-analysis.md` (hızlı yazıldı, kalibre), `spike-pipeline.md` (dinamik persona oversimplification).
- [ ] **Persona/workflow tutarlılık** — personalar eski araçlara atıf yapıyor (örn. `kortext-backlog-add.py`, `add_backlog_item` MCP) ama gerçek yol artık dosya köprüsü. ✅ `planning-pipeline.md` köprüye göre kalibre edildi (2026-06-05, §14.7 — `update_backlog_item` atıfları temizlendi, "bütün dosyayı yeniden yaz" deseni). **Kalan:** diğer workflow/persona dosyalarında ölü araç atıflarını tara (`add_backlog_item`, `kortext-backlog-add.py`, `update_backlog_item`).

---

## v3.2.0 — bilinçli ertelenmiş

**Tasarım/UI:** mobile responsive (şu an 1280px+) · a11y (focus var, aria yok) · i18n (Settings seçimi statik; gerçek tr/en) · LocalStorage persistence.

**Engine + workflow:** reviewer-as-step runtime (Faz 13'te kaldırıldı; "agent code review pattern") · Settings/Agents YAZMA editor (şu an readonly; paket immutability) · `+prime` synthetic persona (`agents/prime.md` mi registry'de mi).

**Refactor:** `scripts/` rename (tek dosya `copy-migrations.mjs` → `tools/`/`build/`?) · workflow gate hint syntax (`parallel_with_json` parser doldurmuyor) · `learned.md` topical split (50KB+ olunca).

**Dosya:** `UAT-GUIDE.md` içerik güncelleme (foundation/ + ALL-CAPS + güncel test sayısı).

---

## Açık sorular (Eray ile)

- `scripts/` rename tutalım mı (yanıltıcı ad ama tek dosya, marjinal fayda).
- v3.0.1 borç (app.listen) — v3.1 release öncesi şart, sıraya ne zaman.
- ~~Backlog köprüsü zenginleştirme — step-1 güçlendir mi / "id'ye göre güncelle" köprüsü mü~~ → **yanıtlandı** (2026-06-05): ikisi birden, upsert eklendi (DECISIONS §14.7).
