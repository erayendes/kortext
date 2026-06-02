# Kortext — Handover

> Yeni Claude Code oturumu için bootstrap pusulası. Açar açmaz şu prompt'u yaz:
> **"HANDOVER.md'yi oku, devam edelim."**

---

## 1. Şu an (2026-06-02)

**UI TRACK — Ekran 3 BOARD bu oturumda büyük ölçüde bitti (5 commit, hepsi origin/main'e PUSH edildi).** Eray'ın ekran incelemesindeki **10 maddenin 7'si kapandı**, tümü canlı doğrulandı. Commit'ler: `0ac2d83` **Task + Epic detay panelleri** (480px sağ-slide drawer; header id+durum rozeti, KV grid, açıklama, AC checklist, child items, footer; wireframe-v4 birebir) · `67ca9b2` **r1 temizlik** (Status filtresi + boş "Filter" butonu + header +p avatar kaldırıldı, +prime atanabilir owner) · `b01cc05` **r2 çalışan duruma-duyarlı footer butonları** (`POST /api/backlog/:id/transition` → mevcut `ItemLifecycle` motoru; "ajanlar yürütür + ben override" kararı) · `243bd83` **r3a gerçek aktivite akışı** (`GET /api/backlog/:id/activity`, audit_log'dan "kim ne yaptı") · `aac2b4d` **r3b Review gates** (body `## Review Gates`'ten checklist) + boş KV satırlarını gizle. **590/590 test yeşil, typecheck temiz.** Yeni saf mantık `src/lib/board-drawer.ts` (statusBadge/acChecklist/childrenOf/epicProgress/formatDate/descriptionFromBody/availableTransitions/describeActivity/checklistFromSection) tamamı TDD'li. Yeni bileşenler: `src/components/BoardDrawers.tsx` + kanonik `src/components/Badge.tsx`.

**#4 AC madde-madde işaretleme ✅ BİTTİ (2026-06-02 #2 oturum, 4 katman, her biri TDD + ayrı LOKAL commit — PUSH YOK).** K1 veri modeli `996cf6f` · K2 endpoint `5086373` · K3 tıklanabilir checkbox `8ffd061` · K4 ajan MCP yolu `953b6e9`. 590 → **612 test yeşil**, typecheck temiz. İnsan (panelde tıkla → `POST /api/backlog/:id/ac`, +prime) ve ajan (MCP `mark_acceptance_criterion`, +persona) AYNI `item_ac_toggle` audit'ini yazar (ortak `applyCriterionToggle` servisi) → tek aktivite akışında "+actor checked/unchecked …". AC artık `[{text,done}]`, geriye-uyumlu okur (eski `string[]+ac_done` → ilk N done), eski item işaretlenince yeni şekle göç eder. Detay [DECISIONS §10.6](./DECISIONS.md). Canlı doğrulandı (T08 fixture: tıkla→işaretle/geri-al, kart `AC X/Y` ↔ panel sayacı, aktivite "+prime checked …"). **Bu 4 commit henüz origin'de DEĞİL — Eray "push" deyince gider. SIRADAKİ = Ekran 4 (Memory) → 5+ (TODO sırası).** **Ertelenen (Eray'ın sözüyle, hâlâ açık):** #9 global arama (header "SOON"), #10 terminal = komut girişi (salt-okunur run-history), canlı gate pass/fail (`gate_runs`). **Paused (uygulama-geneli):** gerçek font (Inter/JetBrains Mono yüklenmiyor — sistem fontu Inter'in önünde) + ortak PageHeader 22px/items-end — **Dashboard'u da etkiler → sonra yeniden screenshot.**

**Öncesi (bağlam, hepsi origin/main'de):** Motor/şema epic §5.9 (capstone + son montaj + `POST /api/drive`, varsayılan kilitli) + Ekran 1 Onboarding + Ekran 2 Dashboard. "BACKEND'E DOKUNMA" Eray-onayıyla esnetilebilir — bu oturumda da öyle: transition + activity endpoint'leri TDD'yle eklendi. Demo: Demo CRM yüklü; test için bu oturumda API'den **T06** (priority/points/AC dolu) ve Eray'ın **T07 "DENEME"** item'ları eklendi (gitignored demo DB'de, daemon restart'ında reconcile).

> **Süreç dersi (kayıtlı):** (1) önizleme dev sunucusu (`tsx watch`) **server dosyası her düzenlendiğinde restart** olur, birkaç kez düştü → `preview_start` ile geri kaldır. (2) preview `eval`'leri **reload/animasyon sırasında flaky** ("promise collected"/timeout) → reload'u AYRI çağrıda yap, kısa **senkron** eval'leri tercih et. (3) `preview_screenshot` slide animasyonunu/stale kareyi yakalayabilir → mid-slide görürsen ikinci kez çek; ölçü/font için screenshot'a güvenme, `getComputedStyle` kullan.

**Branch:** `main`. Motor/şema epic §5.9 **CAPSTONE + SON MONTAJ + DRIVER GİRİŞE BAĞLANDI.** Capstone (9 TDD adapter/keystone dilimi `39953ad`→`c692223`) + son montaj (4 kompozisyon dilimi `8cbd5e1`→`86ddaeb`, `driveReadyItems` = "başlat düğmesi", `driver-e2e.test.ts` gerçek git'le to_do→done kanıtlıyor) **artık origin/main'de — bu oturumda PUSH edildi (6 commit).** Bu oturumda ayrıca **§5.16 indi: driver bir HTTP girişine bağlandı** — `POST /api/drive` `driveReadyItems`'i tek-tur sürüyor, **ama varsayılan KAPALI bir güvenlik anahtarının (`KORTEXT_DRIVE_ENABLED`) arkasında.** **Mimari karar: Eray sade-dille "kilitli dursun, anahtarla açılır" seçti.** 3 parça, her biri TDD: env fail-safe anahtar (`server/config/env.ts`, yalnız `"1"`/`"true"` açar) · `driveRouter` (`server/routes/drive.ts`, 403 kapalı / 409 uçuşta / 202 başladı, fire-and-forget) · `makeServerDrive` (`server/orchestrator/server-drive.ts`, runtime lazy-once montaj). **521→535 test**, typecheck + lint temiz. Gerçek-sunucu smoke İKİ yön: KAPALI→403, AÇIK+boş backlog→202 temiz no-op (repo kirlenmedi). Detay [DECISIONS §5.16](./DECISIONS.md). **Blast-radius:** bu, etkiyi sıfırdan çıkarabilecek **İLK** slice — ama anahtar varsayılan kapalı → merge'de etki **pratikte hâlâ sıfır**; Eray `KORTEXT_DRIVE_ENABLED=1` set edip (yeniden) başlatana kadar düğme atıl. ✅ **Bu slice (`de653f5`) origin/main'e PUSH edildi** (2026-06-01) — motor track'inin tamamı artık uzakta. **Sıradaki = UI track** (ekran-ekran, ilk ekrandan; aşağıdaki kopyala-yapıştır prompt). Backend ertelenenleri (§5.16) UI'a paralel, sonraki iş.

> **Süreç dersi (kayıtlı):** son montaj 4. diliminde, worktree'ye yazan bir test executor'ının guard'ı (`worktreePath !== repoRoot`) deployment adımında host repo'ya düşüp 2 stray commit + 1 çöp dosya yarattı. `--mixed reset` (reflog ile sıfır kayıp) + guard'ı pozitif/dar yaptım (`workflowId==='development-cycle' && path.startsWith(...)`). Ders: worktree-mutasyonlu test executor'ı asla `process.cwd()`'e düşebilecek negatif guard kullanmamalı.

**Bu oturumda inen (6 slice, hepsi TDD + mock-first, ayrı commit):** `uat review-cycle` (review→done/bounce, prime onayı) · `whose-turn` (board "sıra kimde" türetimi) · `closure` (review→merge→done/bounce iskelet) · `epic-completion` (item done→epic bitti→staging tetik) · `block` (block→run cancel, `RunRegistry`) · `local test-URL` (`PreviewManager`). Detay [DECISIONS §5.13](./DECISIONS.md). **Beş mock-first arayüz** (`gate-executor`/`review-approver`/`merger`/`deployer`/`preview-server`) + `RunRegistry` + `PreviewManager` hazır; tümü Madde 10'da gerçeğe bağlanır. Üretim blast-radius **sıfır** (yalnız testler sürüyor — lifecycle henüz orchestrator'dan sürülmüyor).

| Test | Typecheck | Push |
|---|---|---|
| 590/590 ✅ | 0 hata | origin/main (bu oturum: 8 commit) |

**npm registry:** `kortext@3.0.0` broken (EADDRINUSE silent fail bug). v3.1.0 release (devasa sürüm: Faz 11-13 + CLI redesign) lokal tgz UAT geçtikten sonra yapılacak.

## 🟢 Son montaj BİTTİ — sade anlatım (Eray için)

**Benzetme:** Arabanın tüm parçalarını tek tek yapıp ayrı ayrı test etmiştim (motor, fren, direksiyon). Bu oturumda parçaları **arabaya monte edip anahtarı çevirdim** — araba ilk kez baştan sona, kendi kendine yürüdü. 4 adımın **dördü de bitti:**

1. ✅ **Her işe gerçek çalışma alanı verildi** — sistem artık her işi gerçek (git) bir çalışma alanında yürütüyor + "hangi iş nerede" defterini tutuyor.
2. ✅ **Gerçek parçalar taklitlerin yerine takıldı** — 5 gerçek parça (git birleştirme · AI denetçi · insan onayı · önizleme · deploy) tek yerde (`composition`) kuruldu.
3. ✅ **Önizleme otomatik açılıp kapanıyor** — iş test aşamasına gelince URL açılıyor, iş bitince/geri dönünce kapanıyor.
4. ✅ **Ana düğme eklendi + tam test** — "başlat" (`driveReadyItems`) bir işi yapılacak → test → onay → **bitti**'ye kadar yürütüyor; uçtan-uca test **gerçek git ile** kanıtlıyor (gerçek birleştirme commit'i dahil). **Mimari karar:** sana sade dille sordum, "ayrı, temiz, yeni parça"yı seçtin — öyle yapıldı.

> **Önemli (güncel — §5.16):** "Başlat" düğmesi artık uygulamaya bağlı (`POST /api/drive`) — **ama varsayılan KİLİTLİ.** Sen `KORTEXT_DRIVE_ENABLED=1` ile anahtarı açana kadar basınca "kapalı (403)" der; o yüzden üretim etkisi hâlâ **pratikte sıfır.** Periyodik otomatik çalıştırma (zamanlayıcı) + dashboard'a görsel "başlat" düğmesi **ayrı, sonraki işler** (zamanlayıcıyı henüz seçmedin).

**Şu an mümkün olan:** Bir iş listesi verildiğinde sistem o işi **baştan sona, insan müdahalesi olmadan** yürütebiliyor (testte + gerçek-sunucu smoke'unda kanıtlandı). Anahtarı (`KORTEXT_DRIVE_ENABLED=1`) açıp `POST /api/drive`'a basmak yeterli. Sıradaki: dashboard'a görsel "başlat" düğmesi + (istersen) periyodik otomatik tetik.

---

## ▶ Sonraki oturum — Board #4 (AC) → Ekran 4+ (kopyala-yapıştır prompt)

> **Ekran 3 Board büyük ölçüde bitti + origin/main'de** (5 commit; Eray incelemesinin 7/10 maddesi). Kalan tek aktif iş Board'da **#4 (AC madde-madde işaretleme)**, sonra **Ekran 4+ (Memory onward)**. Yeni oturumda şunu yaz:

```
KORTEXT — UI OTURUMU (Ekran 3 BOARD: #4 AC işaretleme → sonra Ekran 4+)

DURUM: Motor + Onboarding(1) + Dashboard(2) + Board(3) BÜYÜK ÖLÇÜDE BİTTİ, hepsi
origin/main'de. Board incelemesindeki 10 maddenin 7'si kapandı (5 commit: 0ac2d83
paneller · 67ca9b2 temizlik · b01cc05 çalışan butonlar · 243bd83 aktivite · aac2b4d
gate'ler+KV). 590 test yeşil, typecheck temiz. main'e SORMADAN push YOK.

SIRADAKİ TEK AKTİF İŞ = #4 AC madde-madde işaretleme (Board, en büyük parça). Eray
[{text, done}] modelini onayladı. 4 katman, her biri TDD + Eray'a göstererek + ayrı commit:
1) VERİ MODELİ — AC'yi "sayı" yerine madde-madde sakla. ŞU AN: frontmatter.acceptance_criteria
   = string[] + ac_done(sayı), NewItemModal böyle yazıyor; body'de de "## Acceptance Criteria"
   var. YENİ: [{text, done}] (geriye-uyumlu OKU: eski string[]+ac_done → ilk N done; yeni şekil
   → doğrudan). board-drawer.ts acChecklist + NewItemModal güncellenir.
2) ENDPOINT — bir kriteri işaretle/kaldır (insan override). server/routes/backlog.ts'e yeni
   route + TDD (tests/routes.test.ts deseni; transition/activity endpoint'leri örnek).
3) UI — panelde AC satırları tıklanabilir checkbox (şu an salt-okunur AcRow, BoardDrawers.tsx).
   Tıkla → endpoint → paneli+board'u tazele (transition'daki onChanged deseni).
4) AJAN YOLU — ajanlar MCP'den AC işaretlesin (mcp/ dizini; ajan sözleşmesi). En derin
   katman; kapsamı Eray'a sade-dille sor.

#4 bitince EKRAN 4+: ✅1.Onboarding ✅2.Dashboard ✅3.Board → 4.Memory → 5.Reports →
6.References → 7.Project settings → 8.Agents → 9.Rules → 10.Workflows → 11.Hooks →
12.Integrations → 13.Environment → 14.Danger zone.

ERTELENEN (Eray'ın sözüyle, Board): #9 global arama (header "SOON"); #10 terminal = komut
girişi (şu an salt-okunur run-history timeline). PAUSED (uygulama-geneli, fırsatta): gerçek
font yükleme (Inter/JetBrains Mono — UI stack'inde sistem fontu Inter'in ÖNÜNDE, devreye
girmiyor) + ortak PageHeader 22px/items-end — Dashboard'u da etkiler → sonra yeniden screenshot.

GÖRSEL SPEC — TEK KAYNAK: development/concepts/wireframe-v4-final.html (showRoute ile ekran
değiştirir; Board/Memory/Reports/References + settings pane'leri içerir; onboarding'i KAPSAMAZ).
Renk/tipografi: development/DESIGN.md. UI: src/ (React + TanStack Router hash-history +
Tailwind v4). Kanonik Badge: src/components/Badge.tsx (wireframe .badge: 11px, kenarlıklı, 7
ton — sonraki ekranlar buna geçsin; settings/memory/references'taki eski 9px-büyükharf
Badge'ler tech-debt).

CANLI GÖRMEK: preview_start "kortext-dev" (5173) → /#/board. Demo CRM yüklü. Spec yan yana:
preview_start "kortext-wireframe" (8092) → /wireframe-v4-final.html. Viewport ≥1280px
(DESIGN.md §14). Backlog seed: `npx tsx .kortext/seed.ts`; dolu dashboard:
`npx tsx .kortext/seed-dashboard.ts`. Test verisi (bu oturumdan): T06 (AC+gate dolu), T07 "DENEME".

YÖNTEM (her iş, sırayla): (1) canlı + wireframe yan yana (screenshot). (2) ESAS: Eray
ekran-ekran KENDİ yorumlarını verir; sade-dille konuş (öneri başa, AskUserQuestion). (3) onay
→ src/'de uygula (saf görsel screenshot'la; MANTIK varsa TDD). (4) preview screenshot ile
doğrula. (5) ayrı LOCAL commit (push YOK, Eray "push"/"origin merge" deyince).

ÖNİZLEME TUZAKLARI (kayıtlı): server dosyası düzenleyince tsx watch RESTART → düşerse
preview_start. eval reload/animasyon sırasında flaky ("promise collected"/timeout) → reload'u
AYRI çağrıda, kısa SENKRON eval tercih et. screenshot mid-slide yakalar → ikinci çek; ölçü/font
için getComputedStyle (screenshot'a güvenme).

BOARD KOD HARİTASI: src/routes/board.tsx (kolon/kart/filtre/modal) · src/components/
BoardDrawers.tsx (Task/Epic drawer + footer) · src/lib/board-drawer.ts (saf mantık + testler
tests/board-drawer.test.ts) · server/routes/backlog.ts (GET/POST + transition + activity) ·
server/engine/item-lifecycle.ts (yasal geçişler — frontend availableTransitions BUNU aynalar) ·
server/db/schemas.ts (Gate/GateRun).

SABİT: Eray non-coder/Türkçe, kod+commit İngilizce, GUI-first, somut artefakt (screenshot).
Mimari/UX kararı AskUserQuestion ile SADE-DİLLE (öneri başa). main'e SORMADAN push YOK.

PARALEL TRACK (sonra): backend ertelenenleri — handover-on-close, gate_runs UAT verdict +
canlı gate pass/fail (şu an gate'ler statik body'den, hep boş/unchecked), blocker-temizle,
epic-status-flip, staging raporları, periyodik zamanlayıcı (DECISIONS §5.16). Gerçek AI
ajanıyla canlı UAT henüz yapılmadı.
```

## 2. Geçmiş özet

Faz 13 tamamlandı: engine output-resolver, callout → approver-based gate, `.kortext/foundation/` kategorisi, 13 reference ALL-CAPS rename, 12 workflow rewrite (AI-odaklı imperative ton), `docs/ → development/` konsolidasyon. Detaylar [DECISIONS.md Bölüm 1](./DECISIONS.md).

## 3. Aktif iş — Development + Test lifecycle redesign

Spec: [DECISIONS.md Bölüm 5](./DECISIONS.md) (design level, Eray onayladı). Süreç §5.10: **önce tüm workflow dizini, sonra motor** — markdown ucuz, motor kodu tasarım donunca yazılır. Bitmiş workflow dizini + Bölüm 5 = motorun donmuş spec'i.

**Karar özeti:** kolonlar `to_do → in_progress → test → review → done` (`merge` kolonu YOK). 5 planning-seçimli gate; `test`'tekiler PARALEL, join motorun. Sahip (assignee=developer) sabit, "sıra kimde" kolon+bayraktan türetilir. Deployment = ortam merdiveni (item→dev, epic→staging, version→preprod, onay→prod). spike otonom+her-zaman-gate. maintenance silindi. rollback + hotfix AYRI düz akışlar (§5.12 deadlock dersi).

**Workflow turu TAMAMLANDI + adversarial doğrulandı (2026-05-30)** — 10 workflow (rakamsız), 382/382 test + typecheck yeşil. 15-ajan adversarial doğrulama 2 gerçek kırık buldu, ikisi de düzeltildi: (1) zincir-dikiş — 4 workflow'un "Sonraki akış" satırı parser'a uymuyordu → dürüst `**Sonraki:**` biçimine çevrildi; (2) incident deadlock — birleşik incident-pipeline'da koşullu-dal motorca ifade edilemiyordu → `rollback-pipeline` + `hotfix-pipeline` olarak AYRILDI.

| Workflow | Durum |
|---|---|
| `development-cycle` | ✅ implement → `test`'e taşı, orada biter |
| `test-cycle` | ✅ 5 gate paralel + UAT fan-in; gate-run kaydı (rapor yazmaz); code-review SECURITY okumaz |
| `planning-pipeline` | ✅ gate seçimi (`code_review`+`uat`, `security_check→security_control`) |
| `deployment-cycle` | ✅ ortam merdiveni (epic→staging 5 paralel rapor, version→preprod, onay→main+prod); red→bug |
| `rollback-pipeline` | ✅ AYRI düz akış (triaj→kod+migration rollback→kapanış); fan-in yok |
| `hotfix-pipeline` | ✅ AYRI düz akış (triaj→minimal fix+test→kapanış); fan-in yok |
| `spike-pipeline` | ✅ otonom tetik + her-zaman prime gate + sade rapor |
| `environment-setup` | ✅ ACCESS "Ortamlar" bölümü (§5.6/§5.11) |
| `new/existing-project-analysis` | ✅ tutarlı (foundation üretici, dokunulmadı) |
| ~~`incident-pipeline`~~ | ✅ AYRILDI → rollback + hotfix (§5.12 — deadlock) |
| ~~`maintenance-cycle`~~ | ✅ SİLİNDİ (§5.12 — çıktısı planning/backlog'a eriyor) |
| Motor/şema epic (§5.9) | ✅ **TÜM dilimler + capstone + son montaj + driver girişe bağlandı** — tek-item lifecycle + epic→staging + block→cancel + capstone (9 adapter/keystone) + son montaj (composition root + resolution registry + preview dikişi + driver) + **§5.16 driver→`POST /api/drive` (varsayılan kilitli)**, 535/535 yeşil. KALAN: ürün-katmanı (dashboard düğmesi, zamanlayıcı, §5.14 listesi). Detay §5.14–§5.16. |

**Disipline:** workflow markdown'ları ev-stilinde (normal cümle, `## Faz`+`1. **+persona:**`), parser'a dokunma; `inputs:` tam path (`.kortext/references/X.md`), prose'da çıplak rozet (`STACK`); foundation OKUMA (analiz hariç).

**Motor disiplini (§5.13, sabit):** koşullu mantık **orchestrator katmanında** (DB durumu üzerinde düz TS), DAG (`dag.ts`/`worker-pool.ts`) **saf AND-join** kalır — §5.12 deadlock'unun çözümü. Gate'ler `gate_runs` satırı (DAG fan-in DEĞİL); join = satırlar üzerinde TS fold. Doğrulama: gerçek `transition()`/`readyKeys()` çalıştır, paralel kopya yazma; `npm test`+`typecheck` yeşil olmadan "tamam" deme.

## 4. Bekleyen — content review turu

`development/` cleanup'ı bitince Kortext'in **çekirdek akış dosyalarının** içeriği gözden geçirilecek (Faz 13'te baştan yazıldı ama kalibrasyon lazım):

1. `templates/AGENTS.md` — kullanıcının ilk gördüğü AI bootstrap
2. `agents/*.md` — 14 persona
3. `rules/*.md` — 6 rule (behavior, branching, commands, emergency, mcp, models)
4. `workflows/*.md` — 10 workflow (rakamsız)
5. `templates/{foundation,references,reports,memory,backlogs}/*.md` — kullanıcı projesine kopyalanan iskelet
6. **`agents/` ve `workflows/` artık `_codebase` tarafında düzenlenir** (eski `_docbase` sync mekanizması kaldırıldı; tek kaynak burası).

Bilinen risk noktaları (Faz 13 hızlı yazımdan):
- `existing-project-analysis.md` — pattern apply (~30 sn yazıldı), kalibre gerek
- `02b-spike-workflow.md` — dinamik persona oversimplification
- `development-cycle.md` + `test-cycle.md` — lifecycle redesign aktif turu, bkz. §3 (DECISIONS Bölüm 5 spec). Motor/şema desteği §5.9'da listeli, en sona bırakıldı
- ~~`07-rollback-pipeline.md` / `09-maintenance-cycle.md`~~ — çözüldü (§5.12: rollback ayrı düz akış; maintenance silindi)

## 5. Bekleyen — v3.1 CLI/onboarding redesign (devasa sürüm parçası)

[DECISIONS.md Bölüm 0](./DECISIONS.md)'da yön belirlendi: multi-project daemon, postinstall otomatik onboard, native folder picker, 9 komutluk yeni CLI (`start/stop/pause/list/remove/purge/update/doctor/help`), `remove` ve `purge` ayrı komut. Implementation [TODO.md](./TODO.md)'deki sıralı 11 adımlı kuyrukta. v3.0 `init/serve` modeli implementation tamamlanana kadar mevcut kalacak; v3.1.0 release ile tek atışta clean break.

## 6. Açık konular

Detaylı liste [TODO.md](./TODO.md)'de. Kritik üçü:
- Manuel UAT (Eray makinesinde clean `kortext-uat/` üzerinde tgz + init + serve + analysis çalıştır)
- v3.0.1 borç: `app.listen()` EADDRINUSE silent-fail handler
- v3.1 CLI redesign implementation (DECISIONS Bölüm 0, TODO sıralı kuyruk)

## 7. Linkler

- Mimari: [ARCHITECTURE.md](./ARCHITECTURE.md) (gotcha'lar §16'da)
- Kararlar: [DECISIONS.md](./DECISIONS.md) (Bölüm 0 = CLI redesign, Bölüm 1 = Faz 13, Bölüm 2 = v3.1 refactor, Bölüm 5 = Development + Test Lifecycle redesign, Bölüm 6 = Faz 0-12 özeti, Bölüm 7 = tasarım, Bölüm 8 = tarihçe, Bölüm 9 = reddedilenler)
- Tasarım: [DESIGN.md](./DESIGN.md)
- UAT rehberi: [UAT-GUIDE.md](./UAT-GUIDE.md)
- Açık iş listesi: [TODO.md](./TODO.md)
- Claude için davranış: [../CLAUDE.md](../CLAUDE.md) (dosya haritası dahil)
