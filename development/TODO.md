# Kortext — TODO

Açık iş listesi. **Bitmiş işler buradan çıkarılır** → tarihçe [DECISIONS.md](./DECISIONS.md)'de, son durum [HANDOVER.md](./HANDOVER.md)'de.

---

## 🔍 UAT bulguları — canlı koşu UI incelemesi (2026-06-06, TaskFlow sandbox)

> Eray `kortext-live-uat-v2` verisini gerçek UI'da gezdi. Her madde **gördüğü + doğrulanmış gerçek durum + dosya**. Çoğu "veri doğru, UI bağlı değil". (Project + Kortext settings ekranları bu turda incelenmedi — ertelendi.)

**A. Board (`src/routes/board.tsx`)**
- [x] ~~**Epic kolonu boş**~~ ✅ (2026-06-06, faz-1). Board+Dashboard artık `/api/backlog?limit=500` çekiyor (board kolonları + epic roll-up tüm seti gerektirir; varsayılan 100 en eski olan epic'leri kesiyordu). Canlı: Board epic-rail 18 epic gösteriyor, Dashboard epic-progress 18 satır. **Gerçek sayfalama** ayrı follow-up (aşağıda).
- [x] ~~**Versiyon filtresi yok**~~ ✅ (2026-06-06, faz-1). Board page-h'a `VersionSelect` (pill+native select) eklendi; `defaultActiveVersion` = en küçük bitmemiş versiyon varsayılan-aktif (canlı: v0.1, 9 item), "All versions" → 109 item. Saf helper'lar `compareVersions`/`sortedVersions`/`defaultActiveVersion` (semver-doğru sıralama, v0.10 > v0.2) — 13 unit-test.
- [x] ~~**Assignee görünmüyor**~~ ✅ (2026-06-06, faz-1). `assigneeOf(item)` = `owner` → `frontmatter.assignee` fallback. Kart avatar + drawer Assignee/Owner satırı + Dashboard PrimeRow buna bağlandı. Canlı: kartlar `+engineering-manager`/`+frontend-developer` gösteriyor, drawer "frontend-developer".
- [ ] **Dependency gösterilmiyor** — drawer'da blocks/blocked_by yok. (Ayrıca bu koşuda ajan **hiç dependency üretmedi** — content gap, aşağıda D.)
- [x] ~~**Comment alanı yok**~~ ✅ (2026-06-06, faz-2). Item drawer'a yorum kutusu (input+Send) eklendi; `POST /api/backlog/:id/comment` yorumu `audit_log`'a (`item_comment`) yazıyor → drawer + Dashboard timeline aynı feed'de gösteriyor (ayrı store yok). Per-item activity feed de küratörlendi (gürültülü `backlog.patch` elenir) + `backlog.ingest` "added this item from planning" olarak okunur. Canlı doğrulandı.
- [x] ~~**Filtreler çalışmıyor**~~ ✅ (2026-06-06, faz-2). "Assignee" statik pill → `AssigneeSelect` dropdown (`assigneesOf` helper, owner/frontmatter çözer); versiyon+epik+assignee filtreleri birleşiyor, page-sub temizlenebilir chip gösteriyor. Canlı: backend-developer → 37 item hepsi doğru. **"Group: Epic" pill kaldırıldı** — epic-rail zaten epik gruplama/filtre işlevini görüyor, pill gereksizdi (Eray gerçek "group by" kontrolü isterse ayrı iş — soruldu).
- [x] ~~**"New" (yeni görev) çalışmıyor**~~ ✅ (2026-06-06, faz-2). `window.prompt` (önizleme/bazı tarayıcılarda bloklu) → gerçek in-app form (Drawer içinde): type pill'leri + title + epic select + version select (board filtresinden seed). `POST /api/backlog` artık `version` kabul ediyor. Canlı: form → kart board'da. +route testleri.
- [ ] **item-id'ler slug** — `init-nextjs-project`, `write-component-tests-task-form`. Proje-kodlu kısa id konvansiyonu (`TF-001`) yok → persona/workflow kalibrasyonu (D).

**B. Dashboard (`src/routes/dashboard.tsx`)**
- [x] ~~**Epic progress 0**~~ ✅ (2026-06-06, faz-1). Aynı limit fix (A) — Dashboard `?limit=500`; epic-progress 18 satır, hepsi gerçek child-tamamlanma yüzdesiyle.
- [x] ~~**Activity timeline boş**~~ ✅ (2026-06-06, faz-1). Yeni `GET /api/activity` (küratörlü audit feed — gürültülü per-item `backlog.patch` SQL'de elenir, `AuditLogRepository.listFeed`/`FEED_EXCLUDED_ACTIONS`). Timeline `buildActivityFeed(audit, handovers, decisions)` ile besleniyor; `describeAuditEvent` pipeline/gate/transition olaylarını okunur metne çeviriyor. Canlı: 40 olay ("advanced to planning-pipeline", "gate answered", "paused for your approval"…), `backlog.patch` gürültüsü 0.
- [ ] **Active work / For review boş** — koşu bittiği için boş (beklenen). Netleştir: bitmiş koşu geçmişi gösterilmeli mi, yoksa "boş = doğru" mu.

**C. Doküman görünümü (`FileBrowser`/`AnnotatableDoc`)**
- [x] ~~**Scroll olmuyor**~~ ✅ (2026-06-06, faz-2). `.fb-view` grid-hücresinde `min-height: 0` eksikti → içindeki `.fb-md`'nin `overflow-y:auto`'su devreye giremiyordu. Tek satır CSS. Canlı: API.md (34k px) scroll'lanıyor.

**D. İçerik / persona kalibrasyonu** (yeni canlı koşu ile doğrulanır)
- [ ] **item-id konvansiyonu** — planning persona'ları slug yerine `<PROJE_KODU>-NNN` üretmeli.
- [ ] **Dependency üretimi** — planning `blocks`/`blocked_by` neredeyse hiç üretmedi (DB'de 0). Persona talimatını güçlendir.
- [ ] **Memory boş** — `kortext-live-uat-v2/.kortext/memory/` yok; onboarding decisions/learned yazmıyor. Karar: analiz/planning memory üretmeli mi (EM persona "decisions.md yaz" diyor ama workflow output declare etmiyor) yoksa normal mi.

**E. Global / agents (`Footer` agents paneli, persona ikonları)**
- [x] ~~**Agents paneli**~~ ✅ (2026-06-06, faz-4). `/api/personas` (tüm persona'lar yeşil) → `deriveActiveAgents(items)` (saf helper, TDD): yalnız tamamlanmamış (done/cancelled/epic hariç) görevi olan ajanlar; her satır lead item + statü + kalan-sayı; tone renkli nokta (working=yeşil, blocked=kırmızı, queued=amber); açıklama metni kaldırıldı. Canlı: 5 ajan, hepsi queued (tüm item to_do), openCount'a göre sıralı.
- [x] ~~**Persona ikonları**~~ ✅ (2026-06-06, faz-4). Eray'ın belirlediği lucide seti `persona-colors.ts`'e uygulandı: operation-manager→Bot, product-manager→Rocket, engineering-manager→DraftingCompass, backend-developer→SquareChevronRight, frontend-developer→SquareCode, qa-engineer→FlaskConical, devops-engineer→GitMerge, copywriter→Pencil, growth-expert→Sprout (prime/Compass, delivery/Package, db/Database, security/Shield, designer/Palette, compliance/Scale değişmedi). Tüm yüzeyler (kart/drawer/dashboard/agents) ortak palette okuyor → tek yerde değişti. Canlı render doğrulandı.

**F. Açıklama (bug değil)**
- `planning-reports_<slug>_<ts>.md` **meşru** — planning-pipeline step-8 konsolidasyon raporu (workflow declared output). Başıboş dosya değil; istenirse scope-adı (`planning-reports`) gözden geçirilir.

---

## ⭐ Sırada

- [x] ~~**"Proje hazırlanıyor" ekranı — etkileşim bug'ları**~~ ✅ (2026-06-05, commit `575ca49`). Dört bug da çözüldü + tarayıcıda kanıtlandı: (1) hash deep-link normalizer (`main.tsx`) — çıplak `/initializing` artık `/#/initializing`'e yazılıp doğru ekrana iniyor; (2) satırdaki Onayla gerçek `<button>` + `stopPropagation` → drawer açmadan inline onaylıyor (DB'de `answered`/`approve` doğrulandı); (3) satırdaki Revize drawer'ı doğrudan revize modunda açıyor; (4) <560px sidebar ikon-moduna iniyor, satır butonları kırpılmıyor, drawer tam-genişlik.
- [x] ~~**Kapı Faz 2 — "revize tek başına döner"**~~ ✅ (2026-06-05, commit `7e56755`, DECISIONS Bölüm 14.2). `reject` artık run'ı abort ETMİYOR — sadece reddedilen adımı yerinde yeniden üretiyor (`done`'dan düşür + fire-marker temizle → scheduler yeniden başlatır), onaylanan kardeşler durur, run yaşar. `reviseFeedback` revize nedenini re-execution'a taşır (claude prompt'una girer). `retryRun` artık yalnız crash-recovery (`orphaned:`) için. Yeni paralel test LEGAL∥GROWTH'ta GROWTH revize→onay'ı kanıtlıyor. **745 test yeşil.**
- [x] ~~**Canlı koşu — kapı revize semantiği (§14.2)**~~ ✅ (2026-06-05). Gerçek Claude ile sandbox `kortext-live-uat`'ta tam zincir koştu: onboarding (TaskFlow BRD) → analysis (12 adım, +prime kapıları) → planning-pipeline → Board. **§14.2 canlı kanıtlandı:** LEGAL ∥ GROWTH iki kapı aynı anda açıldı; LEGAL onaylandı (durdu), GROWTH revize edildi → **tek başına yeniden üretildi** (251→184 satır), Claude revize geri-bildirimini prompt'tan aldı (frontmatter'a `revision_note: …ASO and paid channels removed; KPIs limited to 3` yazdı — birebir benim feedback'im), `gate.rejected → regenerate_step: product-analysis.2`, run `running` kaldı (abort YOK). Board'a 100 item ingest edildi.
- [x] ~~**⚠️ Canlı koşu BULGUSU — backlog enrichment + step-8 raporu**~~ ✅ (2026-06-05, DECISIONS §14.7). İki bulgu da giderildi (Eray: "ikisi birden" + "var olanı güncelle"). **(A) epic/version/model:** (1) ingester artık **upsert** — var olan id'yi atlamak yerine planning kolonlarını günceller (`updatePlanningFields`, status/owner'a dokunmaz), `updated[]` döner → her enrichment adımı backlog.yaml'i baştan yazınca katkılar birikiyor; (2) `deriveSyntheticEpics` — düz `epic:` etiketinden gerçek `type: epic` türetir (kemer+askı); (3) `workflows/planning-pipeline.md` yeniden yazıldı — ölü `update_backlog_item` MCP atıfları temizlendi, her adım "oku→uygula→bütün dosyayı yeniden yaz", her adım backlog.yaml'i **ek output** olarak verir (token zinciri sıralamayı sürdürür, DAG döngüsüz — `buildGraph` lineer 1→9 doğrular), step-0 `type: epic`+`parent_epic` zorunlu. **(B) step-8:** `output-resolver` `<ts>` pattern'i gevşetildi (compact `20260605` / date-only `2026-06-05` / `20260605-1959` eşler, çöp reddedilir). **+6 test, 751 yeşil.** Uçtan uca kanıt (in-memory): skeleton→enriched ingest → Board 1 epic/2 child/3 version/3 model (eskiden 0/0/0).
- [ ] **Concurrency knob'ları (opsiyonel)** — workflow-içi `concurrency=3` (`worker-pool`/`commands.ts`) ve `maxConcurrentWorktrees=10` ayarlanabilir tavanlar. Eray "daha fazla paralel" isterse yükselt; gerçek ajanlarda kaynak/maliyet ödünleşimi var. Ayrıca `run-item.ts` dev-cycle adımları caller concurrency'sini almıyor (default 3) — istenirse thread'le.
- [x] ~~**Backlog köprüsü — zenginleştirme**~~ ✅ (2026-06-05, DECISIONS §14.7). Çözüldü: "id'ye göre güncelle" köprüsü = **upsert** (`updatePlanningFields`) eklendi + her enrichment adımı backlog.yaml'i baştan yazıp ek-output verir → qa/security/designer/version/model katkıları artık DB'ye iniyor. Açık soru (step-1 güçlendir mi / update köprüsü mü) **ikisi birden** ile yanıtlandı.
- [ ] **Standalone CLI'a ingester bağla** — `kortext start` (commands.ts) `safetyGuards` almıyor → ingester sadece backend (onboarding/drive) yolunda ateşleniyor. CLI yolunu da besle.
- [x] ~~**Performans — delta (patch) köprüsü**~~ ✅ (2026-06-05, DECISIONS §14.9). Canlı koşu planning'in **patolojik yavaş** olduğunu gösterdi (her enrichment adımı 100 item'lı 80KB backlog.yaml'i yeniden yazıyor → ~22 dk/adım, ~3 saat). Çözüm (Eray: delta köprüsü): patch parse modu + `patchBacklogItems` (alan-birleştirme, gate union) + `backlog.patch.yaml` köprüsü + DB→yaml serializer (motor her patch'ten sonra dosyayı tazeler → personalar güncel okur). Workflow: step 1 tam yazar, adım 2-9 patch yazar. **+8 test, 767 yeşil.**
- [x] ~~**Tek-seferlik kesintisiz canlı koşu**~~ ✅ (2026-06-06, DECISIONS §14.9 canlı kanıt). `kortext-live-uat-v2`'de onboarding → analiz (30dk) → planning (56dk) → Board **kesintisiz tamamlandı**. İki run `succeeded`; 5/5 sütun dolu (epics=18, parent=109, version=127, model=127, gates=97 / 127 item); §14.9 hız 3-7×; serializer + synthetic epic + step-8 hepsi canlı doğrulandı.
- [ ] **`/api/backlog` gerçek sayfalama** (faz-1 sonrası kalan) — faz-1'de Board+Dashboard `?limit=500` ile **band-aid** yapıldı (127 item rahat sığar, epic kesilmesi giderildi). Gerçek sayfalama/sonsuz-kaydırma >500 item'lı projeler için açık kalır (kanban'da kolon-bazlı lazy-load anlamlı). Şimdilik blocker değil.
- [ ] **Transient retry — codex/gemini executor** — `spawnCliWithRetry` paylaşımlı helper hazır; codex/gemini executor'ları hâlâ `spawnCli`'ı doğrudan çağırıyor. Kullanılan executor claude (sarılı); diğerlerini de geçir.
- [x] ~~**⚠️ Dayanıklılık — adım-seviyesi transient retry**~~ ✅ (2026-06-05, DECISIONS §14.8). `cli-spawn.ts`'e `isTransientCliFailure` (dar marker seti: socket closed / API Error / ECONNRESET / overload / rate-limit / 5xx-429) + `spawnCliWithRetry` (exponential backoff) eklendi; `claude-cli-executor` varsayılan `maxAttempts: 3` ile sarmalandı. Deterministik hatalar (bad-model / ENOENT / declared-output-missing) + `aborted` retry edilmez. **+8 test, 759 yeşil.** **Kalan (opsiyonel):** codex/gemini executor'ları da `spawnCliWithRetry`'a geçir (şu an yalnız claude sarılı; kullanılan executor o).
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
- [x] ~~**Persona/workflow tutarlılık — backlog araç atıfları**~~ ✅ (2026-06-05, §14.7). Tüm `add_backlog_item` / `update_backlog_item` / `kortext-backlog-add.py` / `kortext-bulk-plan.py` atıfları dosya köprüsüne (`backlog.yaml` → `type:` + `parent_epic:`) çevrildi: `planning-pipeline.md`, `deployment-cycle.md`, `hotfix-pipeline.md`, `rollback-pipeline.md`, `operation-manager.md`, `qa-engineer.md`, `engineering-manager.md`, `rules/commands.md`, `rules/behavior.md`. (planning-pipeline'da kalan tek atıf kasıtlı "MCP YOKTUR" notu.)
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
- v3.0.1 borç (app.listen) — v3.1 release öncesi şart, sıraya ne zaman.
- ~~Backlog köprüsü zenginleştirme — step-1 güçlendir mi / "id'ye göre güncelle" köprüsü mü~~ → **yanıtlandı** (2026-06-05): ikisi birden, upsert eklendi (DECISIONS §14.7).
