# Kortext — Handover

> Yeni Claude Code oturumu için bootstrap pusulası. Açar açmaz şu prompt'u yaz:
> **"HANDOVER.md'yi oku, devam edelim."**
>
> Bu dosya = **pusula** (son 2-3 devir + açık işler + linkler). Tüm tarihçe [DECISIONS.md](./DECISIONS.md)'de, açık iş listesi [TODO.md](./TODO.md)'de.

---

## ⭐ Şu an (2026-06-09 #10e) — Çıplak `kortext start` artık HER ZAMAN sihirbazı açar + mevcut projeleri listeler (GUI-first)

Yalnızca kod oturumu (UAT değil). Mevcut proje varken çıplak `kortext start` terminalde metin liste basıyordu (GUI-first değil). Artık her durumda **sihirbazı açar**; sihirbaz mevcut projeleri listeler. TDD ile yapıldı. **1184 test yeşil** (1178→+6), typecheck + build temiz. **PUSH EDİLMEDİ** — Eray "push" diyene dek local.

- **bin dispatch (`bin/kortext.ts`):** bare `start` + proje var (`action==='list'`) → terminal listesi yerine `launchWizardAndOpen()`. Terminal listesi `--no-open`/headless (CI) **fallback**'i olarak kaldı.
- **Yeni route (`server/routes/projects.ts`):** `GET /api/projects` → kayıtlı projeler (slug/name/path/port/status/url, `serializeProjects` saf+testli); `POST /api/projects/:slug/start` → `startProject(slug)` → `{handoffUrl}` + `onHandoff` (wizard self-exit). 404 bilinmeyen slug, 502 start fail. index.ts'te bootstrap wiring ile mount.
- **Wizard UI (`OnboardingScreen`):** kartın başında "Open an existing project" — `/api/projects`'ten çeker, satıra tıkla → `POST .../start` → `window.location = handoffUrl`. Altında "or create a new project" ayracı + mevcut yeni-proje formu. `ExistingProject` tipi api-types'ta.

**KANIT:** route testleri (GET list / POST start / 404 / 502) + uçtan-uca harness (gerçek `projectsRouter` + örnek registry): 2 proje listelenir, "Acme"ye tıkla → daemon başlar (`startProject` çağrıldı) + `handoffUrl` döner + wizard kapanmayı planlar (onHandoff:1); bilinmeyen slug → 404. Harness commit edilmedi.

**SIRADAKİ:** Eray "push" derse commit + push. Sonra rebuild + UAT: terminalden `kortext start` (proje varken) → tarayıcıda sihirbaz açılmalı, "Open an existing project" altında projeler görünmeli; birine tıkla → o proje açılmalı; "yeni proje" ile onboarding.

**Rebuild (Eray çalıştırır):**
```bash
cd /Users/erayendes/Documents/_codebase/kortext
npm run build && npm pack && npm install -g ./kortext-3.1.0.tgz
kortext stop not && kortext purge not --yes
```

---

## ⭐ Önceki (2026-06-09 #10d) — Gate-fail SONSUZ bounce döngüsü → 3. fail'de +prime'a (gerekçeyle) tırmandırma

Yalnızca kod oturumu (UAT değil). UAT-build'de çıkan 🔴 KRİTİK bulgu (design_review 8× fail → sonsuz churn, escalation yok) TDD ile çözüldü. **1178 test yeşil** (1162→+16), typecheck + build temiz. **PUSH EDİLDİ** (`13b131f..2338327`, tek commit) — `main == origin/main`.

- **Sayaç (yeni altyapı YOK):** `gateFailCount(repos, itemId, gate)` — `gate_runs`'taki `fail` satırlarını item+gate başına sayar, **son reset baseline'ından** sonrakileri (monotonik `gate_runs.id` üzerinden — ms çakışması yok). Eşik `MAX_GATE_FAILS = 3` (2 retry).
- **Escalation (`server/orchestrator/gate-escalation.ts`):** 3. fail'de `runTestCycle` artık **bounce ETMİYOR** → item `test`'te DURAKLAR + +prime'a Inbox sorusu (`pending_questions`, phase `gate-escalation`). Açık escalation varken `runTestCycle` gate'leri **yeniden koşmuyor** (`paused` — churn yok).
- **GEREKÇE zorunlu:** soru gövdesi gate'in **somut bulgularını** (verdict findings: "contrast 2.1:1, focus ring yok") + **karşılanmamış AC'leri** taşır. Kuru "fail" değil.
- **+prime cevabı (`consumeGateEscalation`, approvals route'ta dispatch):** `approve` → override-pass → `review`'e ilerle · `revise: <talimat>` → talimatı item'a yaz (`frontmatter.revision_directive` + comment) + **sayacı SIFIRLA** + `in_progress`'e yönlü bounce · `drop` → `cancelled` (epic'i tıkamaz).
- **UI (Inbox):** `gate-escalation` sorusu için 3 buton (Approve / Revise / Drop) + Revise talimat metin kutusu (`buildEscalationAnswer` saf yardımcı, testli). Diğer sorular eskisi gibi binary.

**KANIT (deterministik uçtan-uca harness — gerçek runTestCycle + ApprovalQueue + consumer):** design_review 1.→bounce, 2.→bounce, **3.→escalated** (item `test`'te duraklar, Inbox'ta TEK soru, gerçek findings + unmet AC içerir, 3 seçenek). 4. pass `paused` (gate yeniden koşmaz). +prime'ın 3 cevabı: approve→`review`, revise→`in_progress`+sayaç 0+directive yazılı, drop→`cancelled`. Escalation `gate_runs`'ı okur → mock-vs-gerçek-LLM aynı; gerçek +designer'ın 8× fail'i zaten canlı UAT'ta görüldü (bu bug). Harness commit edilmedi.

**SIRADAKİ:** Eray "push" derse commit + push. Sonra rebuild + UAT baştan: kötü UI item'ı 2 retry sonra Inbox'ta gerekçeli soruya düşmeli; +prime revize/onayla/bırak seçebilmeli — sonsuz churn olmamalı.

**Rebuild (Eray çalıştırır):**
```bash
cd /Users/erayendes/Documents/_codebase/kortext
npm run build && npm pack && npm install -g ./kortext-3.1.0.tgz
kortext stop not && kortext purge not --yes
```

---

## ⭐ Önceki (2026-06-09 UAT-build) — Build fazı CANLI: 3 fix kanıtlandı + 1 yeni KRİTİK bulgu (bounce döngüsü)

Eray temiz UAT koştu (antigravity, executors chain `[antigravity, codex]`). Build fazı uçtan uca izlendi. **3 fix canlı kanıtlandı:**
- ✅ **#10 FK/epic enrichment:** epic auto-create çalıştı — epic 1, owner 11/11, version 11/11, model 10/10, parent_id 10/10, **FK/dropped YOK** (önceki Claude turunda 14 FK fail'di).
- ✅ **#9c sıralı build:** T01 (blocker'sız) tek başına başladı; done olunca bağımlıları (T02/T03/T04/T09) açıldı — UAT #9'daki "hepsi aynı anda → merge conflict" stall'ı YOK. T01 gerçek git merge → done.
- ✅ **#4 gerçek gate + #2 bounce-retry:** T01 `quality_control` **fail → re-implement → pass (attempt 2) → merged → done**; AC kutucukları gate'çe işaretlendi; preview_url `localhost:5173` geldi.
- ✅ **#10 fallback:** agy kotası ortada **yine doldu (429, boş çıktı)** → motor recoverable algılayıp **codex'e fallback** etti (daemon log kanıtlı) → pipeline durmadı.

**🔴 YENİ KRİTİK BULGU (TODO "KRİTİK UAT #10 — bounce döngüsü"):** T03/T04 `design_review`'i **8 kez fail** etti → sonsuz bounce churn (17 koşu, 15+ dk ilerleme yok). Gate-fail bounce'ında **max-retry/escalation yok**. **Eray kararı:** 3. fail'de (2 retry) item'ı duraklat → **+prime'a Inbox'tan tırmandır**, soru **fail gerekçesini** (verdict bulguları + başarısız AC) taşısın; +prime [onayla/revize+talimat/bırak]. Detay TODO. **UAT Eray tarafından durduruldu** (churn boşa yakmasın) — `kortext stop not`.

**SIRADAKİ (yeni fix oturumu):** TODO "KRİTİK UAT #10 — bounce döngüsü" uygula (3-fail eşik + Inbox escalation + gerekçe + +prime cevabı + sayaç reset). Sonra UAT baştan.

---

## ⭐ Önceki (2026-06-09 #10c) — `blocked` ayrı status/sütun OLMAKTAN TAMAMEN ÇIKARILDI → türetilen KİLİT bayrağı

Yalnızca kod oturumu (UAT değil). Eray'ın modeli kuruldu: `blocked` bir lane/status değil — bağımlılıktan **türetilen** bir kilit bayrağı, item'ın asıl status'ünün (genelde `to_do`) ÜSTÜNE biner. **AskUserQuestion kararı: `blocked` durumunu + manuel "Mark blocked" özelliğini TAMAMEN KALDIR.** TDD ile yapıldı, **1162 test yeşil** (1168→−6: block/blocker-clear testleri silindi, isBlocked + migration-011 testleri eklendi), typecheck + build temiz. **PUSH EDİLDİ** (`ecc5553..29f5519`, tek commit) — `main == origin/main`.

- **Türetilen kilit:** yeni `isBlocked(item, byId)` (`server/orchestrator/build-order.ts`) — `blocked_by` dolu + blocker terminal (done/cancelled) değilse kilitli; dangling = çözülmüş. UI aynası `isLocked`/`lockedBlockers` (`src/lib/board-drawer.ts`).
- **Auto-block SİLİNDİ:** `backlog-ingest.ts` A5 artık status'e dokunmuyor → kilitli item `to_do`'da KALIR (çıkmaz). `backlog.auto_blocked` audit'i gitti.
- **`blocked` enum'dan + DB'den silindi:** Zod `BacklogStatusSchema` + `api-types.ts` + DB CHECK (**migration 011** tablo rebuild, mevcut `blocked`→`to_do` dönüşümü, `blocked_by` korunur).
- **Lifecycle:** `block`/`unblock` transition'ları + `cancel.from`'daki `blocked` kaldırıldı. Route `TRANSITION_ACTIONS`'tan da çıktı.
- **Manuel block özelliği komple silindi:** `server/orchestrator/block.ts` + `blocker-clear.ts` + `closure` çağrısı + `tests/block.test.ts` + `tests/blocker-clear.test.ts`. Dependents türev olarak kendiliğinden açılır (yazma yok).
- **Board:** ayrı "Blocked" sütunu YOK → 5 sütun. Kilitli item kendi status sütununda **🔒 rozet + soluk (opacity 0.6)**; drawer'da "🔒 Locked · waiting on T01" banner + Status satırında "· 🔒 locked". `whose-turn`/`doctor`/`agents-panel` türev kilide geçti (doctor "N locked item(s)").

**KANIT (deterministik uçtan-uca harness — gerçek-LLM gereksiz, çünkü saf status/scheduling mekaniği):** gerçek DB + ingest + scheduler + closure ile T01→T02→T03 `blocked_by` zinciri: ingest sonrası **3'ü de `to_do`**, T02/T03 **🔒 türev-kilitli**, `selectBuildableItems`=[T01]. T01 `done` → T02 **hâlâ `to_do`** ama kilit AÇILDI (yazma yok), buildable=[T02]. T02 `done` → T03 açıldı, buildable=[T03]. Zincir sırayla aktı. Harness commit edilmedi.

**SIRADAKİ:** Eray "push" derse commit + push. Sonra rebuild + temiz UAT: bağımlılıklı item To Do'da 🔒 ile durur, sırası gelince başlar; ayrı Blocked sütunu yok.

**Rebuild (Eray çalıştırır):**
```bash
cd /Users/erayendes/Documents/_codebase/kortext
npm run build && npm pack && npm install -g ./kortext-3.1.0.tgz
kortext stop not && kortext purge not --yes
```

---

## ⭐ Önceki (2026-06-09 #10b) — UAT #10'un 3 BULGUSU DA ÇÖZÜLDÜ: çıplak parent_epic FK + Board blocked sütunu + çok-executor fallback

Yalnızca kod oturumu. UAT #10'un kritik (çıplak `parent_epic` → FK → enrichment kaybı) + iki 🟠 bulgusu (Board blocked sütunu, çok-executor fallback) TDD ile çözüldü; kritik bulgu gerçek Claude koşusuyla doğrulandı. **1168 test yeşil** (1124→+44), typecheck + build temiz. **PUSH EDİLDİ** (`03196ca..c44d514`, tek commit) — `main == origin/main`. 🟠 bulgular paralel ajanlarla (Stream A board, Stream B fallback).

- **Kök neden:** Claude step-1'de hiç `type:epic` item üretmedi, sonra 14 task'a **çıplak `parent_epic: E01`** yazdı; E01 container hiç yok → FK fail → atomik → owner/version/model 0. #6 auto-create yalnız patch'te `type:epic` item olarak bildirilen epic'i kapsıyordu, çıplak referansı değil.
- **Fix 1 (motor — çıplak ref auto-create):** `patchBacklogItems` 2. ön-geçişi — parse edilen item'ların `parent_id`'lerinden karşılığı olmayan her id için **eksik `type:epic` container'ı önce yaratır** (id=başlık; `backlog.patch.epic_synthesized` audit). FK hedefi hep var.
- **Fix 2 (alan-bazlı dayanıklılık):** update-pass `parent_id`'yi güvenli çözer — çözülemezse linki atlar ama version/owner/model'i yazar (`backlog.patch.dangling_parent`); tek geçersiz FK tüm enrichment'i atomik düşürmez. (+2 test)
- **Fix 3 (workflow ikincil):** `planning-pipeline.md` step-1: "her `parent_epic: X` için `id: X, type: epic` satırı OLMALI" sertleştirmesi.
- **🟠 Board blocked sütunu:** `board-drawer.ts`'e ayrı `🔒 Blocked` sütunu; `columnKeyForStatus('blocked')` → `'blocked'` (in_progress DEĞİL). Kilitli işler "In Progress" gibi görünmüyor.
- **🟠 Çok-executor fallback + 429:** `project.json.executors[]` öncelik zinciri + `FallbackExecutor` (recoverable/429/boş-çıktı → sıradakine düş); `cli-spawn` 429/quota/empty-exit-0 tanır; `buildMissingOutputResult` net mesaj verir. Onboarding'de primary+fallback seçimi. Tek-executor = zero-cost.

**GERÇEK-LLM KANITI (Claude):** planning **succeeded**, 11 item (8 task + 3 epic), **owner/parent_id/version/model 8/8 dolu** — UAT #10'un regresyonu (0/0/0) gitti; patch'ler `8/7/11 updated, 0 skipped` (önceki `0 updated, 14 skipped FK` değil). **Nüans:** bu koşuda Claude gerçek `type:epic` item üretti (3 epic) → çıplak-ref auto-create yolu (synthEpics=0) tetiklenmedi; canlı koşu **sonucu** (enrichment persist), yeni bare-ref-synthesis yolu ise **unit testlerle** (deterministik) kanıtlı. İkisi birlikte her ajan varyasyonunu kapsar.

**SIRADAKİ:** Rebuild (`npm run build && npm pack && npm install -g ./kortext-3.1.0.tgz`) + Eray temiz UAT (baştan): planning enrichment dolu, Board blocked ayrı sütunda, executor fail edince fallback. agy kotası açılınca antigravity de denenir.

---

## ⭐ Önceki (2026-06-09 #10) — UAT (Claude): enrichment YİNE düştü (çıplak parent_epic → FK) + 3 ek bulgu

Eray temiz UAT koştu (Claude executor — agy **kota doldu**, 429, bu yüzden Claude'a geçildi). Analiz uçtan uca koştu (LEGAL/GROWTH/PRD/TRD/PFD gerçek dosyalar, boş-çıktı yok). Planning'e geçildi (14 item — ≤8 tavanı yine aşıldı, Eray "etme" dedi, not yok). **Bu turda kod düzeltmesi YOK** (sadece TODO/HANDOVER); başka oturumda fixlenecek, sonra UAT baştan.

**🔴 KRİTİK — Enrichment yine kayboldu (UAT #5'in varyantı, #6 fix kapsamıyor):** Planning epic-link + version patch'leri **0 updated, 14 skipped → DROPPED**; `skipped_detail` = 14× `FOREIGN KEY constraint failed`. Kök neden: Claude step-1'de **hiç `type:epic` item üretmedi**, sonra 14 task'a **çıplak `parent_epic: E01` referansı** yazdı; E01 container hiç yok → FK fail → atomik → version de düştü. #6 auto-create yalnız patch'te `type:epic` item olarak bildirilen epic'i yaratıyor, çıplak referansı kapsamıyor. → epic/parent_id/version/model **0** (gate'ler tuttu, ayrı/FK'siz). Detay [TODO.md](./TODO.md) "KRİTİK UAT #10".

**🟠 Ek bulgular (TODO'da):**
- **Çok-executor öncelik sıralı fallback** (Eray özelliği): onboarding'de birden çok executor + öncelik; biri fail/kota → sıradakine düş. + agy 429/boş-çıktı **sessiz fail** → görünür mesaj + fallback/retry tetikle.
- **Board `blocked` item'ları "IN PROGRESS" sütununda gösteriyor** (yanıltıcı): 13 blocked item In Progress'te göründü, gerçek in_progress 0. Ayrı "Blocked" sütunu / "🔒 kilitli" rozeti gerek.
- **≤8 kapsam tavanı executor-bağımsız tutmuyor** (Claude 14, codex 16 üretmişti) — Eray "not alma" dedi, kayıt yok; bilgi olarak burada.

**Pozitif:** auto-block çalıştı (13 blocked/1 to_do — bağımlılık kapılaması aktif); analiz Claude'la temiz (boş-çıktı yok); gate-marking patch'leri uygulandı (upd 10/11/13).

**SIRADAKİ (yeni fix oturumu):** TODO "KRİTİK UAT #10" — çıplak `parent_epic` referansından epic auto-create + FK ihlalinde alan-bazlı dayanıklılık (tek geçersiz FK tüm item enrichment'ini çöpe atmasın); gerçek **Claude** koşusuyla doğrula (epic+owner+version+model dolu). Sonra Eray UAT'ı **baştan** alacak. **UAT ortamı ayakta:** `not` → :3200 (planning enrichment düşük). Fix sonrası `kortext stop not && kortext purge not --yes`.

---

## ⭐ Önceki (2026-06-09 #9c) — UAT #9'un 8 BULGUSU DA ÇÖZÜLDÜ ✅ (gate verdict + deploy + build sıralama)

Yalnızca kod oturumu. UAT #9'un 8 build-fazı bulgusu (sıralama, retry, UI sebep, gate-verdict, design, prime, temp dosya, deploy zinciri) TDD ile çözüldü; **gerçek antigravity BUILD koşusuyla canlı doğrulandı.** **1124 test yeşil**, typecheck + build temiz. **PUSH EDİLDİ** (`651f0d3..ee3da45`, tek commit) — `main == origin/main`. Plan onaylı, paralel ajanlarla yürütüldü (Stream A gate, Stream B preview).

- **#1 🔴 Build sıralaması (stall kökü):** yeni `server/orchestrator/build-order.ts` `selectBuildableItems` — en erken version → dependency-ready (blocker'lar `done`) item'lar; `runReadyItems` bunu kullanıyor. **#2 🔴 bounced retry:** `in_progress` item'lar da aday. (+7 test)
- **#3 🟠 UI sebep:** `describeActivity` artık bounce sebebini gösteriyor (`… Review → In progress — merge conflict: …`).
- **#4 🔴 Gate-verdict (KATI):** `AgentGateExecutor` gate adımını AC + "verdict raporu yaz" ile zenginleştirir; ajan `verdict: pass|fail` + `ac_results` yazar; yeni `gate-verdict.ts` parse eder; rapor/verdict yok → strict fail; `test-cycle` AC kutucuklarını işaretler. Fail → bounce. **#5 🔴 design:** `designer.md` gerçek tasarım-review + kalite kriterleri (WCAG AA, hiyerarşi, …) → kötü UI FAIL.
- **#6 🟠 +prime gate:** `planning-pipeline.md` insan-döngü (uat gate + +prime item) talimatı.
- **#7 🟠 temp dosya:** `sweepSignalMarkers` bare-token sinyal dosyalarını `.kortext/temp/`'e taşır (4 executor).
- **#8 ⚠️ deploy zinciri (bounded):** preview URL `/api/backlog`'ta + drawer'da "Canlı önizleme" linki; `frontmatter.preview` kapısı kalktı → her zaman persist. Staging→preprod→prod (gerçek git merge+tag) build stall gidince ulaşılır. Prod push YOK (gerçek hedef yok).

**⭐ GERÇEK-LLM BUILD KANITI (antigravity, harness, epic + NOT-001→NOT-002 blocked_by zinciri + quality_control gate):**
- **Serileştirme (#1/#2):** NOT-001 done@pass-1, NOT-002 started@pass-2 → **SERIAL OK**. NOT-002 (blocked_by NOT-001) blocker bitene kadar **başlamadı** (pass-1 impl=1, paralel-aynı-tabandan YOK). Final: NOT-001/002/E01 hepsi **done**.
- **Strict gate (#4) GERÇEK kanıt:** `gate_runs` → NOT-001 quality_control `status: pass`, persona `+qa-engineer`, findings = **gerçek qa raporu** ("Karar: PASS (Geçti)", her AC tek tek değerlendirilmiş + smoke test koşulmuş). Gate artık mekanik DEĞİL — ajan `verdict: pass` yazdı, `parseGateVerdict` okudu.
- **AC kutucukları (#4):** NOT-001 AC'lerin **ikisi de `done: true`** → gate ajanının `ac_results`'ı motor tarafından işaretlendi (Eray'ın "AC gerçekten kontrol edilsin" isteği canlı kanıtlandı).
- **Gerçek git merge:** development log → `Merge kortext/run-1 into development` + gerçek kod commit'leri ("implement note-taking functionality", "add index.html structure and styles"), **conflict YOK**.
- **TAM DEPLOY ZİNCİRİ (#8) UÇTAN UCA:** epic done → **staging deploy → staging onayı → version tamamlanması → preprod deploy → preprod onayı → prod release**. DB+git ile kanıtlandı: epic `staging_approved=true` + `preprod_approved=true`; **git tag `v0.1`**; main log `Release v0.1: merge development into main` (gerçek dev→main merge). Kronik kırık nokta artık uçtan uca çalışıyor. (Prod push kapsam dışı — gerçek remote yok.)

**SIRADAKİ:** Rebuild (`npm run build && npm pack && npm install -g ./kortext-3.1.0.tgz`) + Eray temiz build UAT (sıralı yürütme, gate'ler gerçekten yargılıyor mu + AC kutucukları, preview linki, kötü tasarım bounce, staging→...→release zinciri). İstenirse `npm publish`. Docs güncel.

---

## ⭐ Önceki (2026-06-08 #9) — UAT: planning→build→KOD ilk kez çalıştı 🎉 ama build/merge/sıralama/kalite kırık (8 bulgu)

Eray temiz UAT koştu (antigravity, #8 fixleri kurulu, "Notlarım"). **Büyük kilometre taşı:** analiz→planning→**build→gerçek kod** ilk kez uçtan uca koştu — not uygulaması üretildi (`index.html`, `css/main.css`, `js/{app,storage,utils}.js` + vitest testleri). #6/#8 fixleri **tuttu** (planning succeeded, 5 item ≤8, owner/version/model dolu, epic var). **Bu turda kod düzeltmesi YOK** (sadece TODO/HANDOVER); Eray "bulguları yaz, başka oturumda fixlenecek" dedi.

**🔴 Build fazı 8 bulgu (detay [TODO.md](./TODO.md) "UAT #9"):**
1. **Build sıralaması yok (stall kök nedeni):** 5 item aynı ms'de paralel başladı, `blocked_by` zinciri (T01→T02→T03→T04) yok sayıldı → hepsi aynı `development` tabanından kodlandı → ilki temiz merge (done), diğer 4'ü **merge conflict** → `review→in_progress`. Eray'ın istediği sıra: **version → epic → item-bağımlılığı**.
2. **Geri dönen görev START almıyor:** conflict sonrası item `in_progress`'te asılı, yeni dev-cycle tetiklenmiyor → kalıcı stall (motor boşta).
3. **Geri-gönderme sebebi UI'da yok:** sebep veride var (`merge conflict: ...`) ama Board göstermiyor.
4. **AC mekanik geçiyor:** `test→review` `reason=gates passed` otomatik; review_gates (quality/security/design) gerçek doğrulama yapmıyor → AC kutucukları işaretsiz.
5. **Tasarım berbat:** designer/`design_review` gerçekten devreye girmemiş (madde 4 ile bağlantılı).
6. **+prime görevi/kapısı yok:** insan-döngü kapısı (uat gate / prime task) hiç üretilmedi.
7. **Sinyal-marker dosyaları proje kökünü kirletiyor (KABUL EDİLEMEZ):** `backlog-drafted` vb. + `item-in-test` köke yazılmış → `.kortext/temp/`'e taşınmalı.
8. **local URL / staging / preprod:** kronik kırık nokta; build stall yüzünden bu turda da ulaşılamadı.

**SIRADAKİ (yeni fix oturumu):** TODO "UAT #9" 8 maddesini ele al — öncelik: #1 (version→epic→dep sıralı yürütme) + #2 (geri-dönen görev restart) → bunlar stall'ı çözer; sonra #4/#5 (gerçek gate/review + design kalite), #7 (temp dosya), #3/#6 (görünürlük + prime), #8 (staging/preprod zinciri). Her fix gerçek-LLM koşusuyla doğrulanmalı. **UAT ortamı ayakta:** `not` → :3200 (build merge-conflict'te takılı). Fix sonrası `kortext stop not && kortext purge not --yes` ile temiz başlanır.

---

## ⭐ Önceki (2026-06-08 #8) — UAT #7'nin 3 kod bulgusu TDD ile ÇÖZÜLDÜ + GERÇEK-LLM KANITI ✅ (codex+antigravity)

Yalnızca kod oturumu. UAT #7'nin üç bulgusu (sinyal-çıktı, rules-enjeksiyon, codex ≤8) düzeltildi, **gerçek koşularla kanıtlandı.** **1093 test yeşil** (1083→+10), typecheck + build temiz. Ayrı bir iş: **multi-model routing branch'i `main`'e merge edildi** (`cbe45b8`). **PUSH EDİLDİ** (`8f5ba2a..75a6167`, 8 commit: routing + UAT #5–#8 fix'leri + routing plan) — `main == origin/main`.

- **#1 🔴 Sinyal-çıktı bug'ı:** `output-resolver` her çıktıyı dosya sanıyordu → `backlog-drafted` gibi bare-token sinyaller "not produced" → planning step-1 codex'te çöküyor (backlog yazıldığı halde DB 0). **Fix:** yeni `isFileOutput` (`/` veya `.` → dosya; aksi → sinyal) + `findMissingFileOutputs` ortak helper; 4 executor de bunu kullanıyor → sinyaller dosya doğrulamasından muaf. (+12 test)
- **#2 🔴 rules/ enjekte edilmiyordu:** behavior.md/models.md ajan prompt'una hiç girmiyordu. **Fix:** yeni `rules-injection.ts` `buildRulesBlock` — **behavior.md her adıma** (evrensel) + adımın `inputs`'unda bildirdiği `rules/*.md` (model-atama adımı `rules/models.md`'i input bildiriyor → o adıma iner). Persona'dan sonra enjekte (cache-dostu). 4 executor + factory + 3 caller thread'lendi. (+10 test)
- **#3 🟡 codex ≤8 yok sayıyordu (16 üretti):** `planning-pipeline.md` step-1'e granularite/kapsam-tavanı talimatı ("bir özellik=bir task; FE/BE/test ayrı item'a bölme; PRD/BRD sayı sınırı tavan").

**⭐ GERÇEK-LLM KANITI:**
- **Codex koşusu (#1+#3):** `succeeded`, **8 item** (16 değil), owner/parent_id/version/model **8/8**, epic 1. Step-1 artık çökmüyor (backlog ingest oldu). #2 kanıtı: codex `exec` aldığı prompt'u stdout'a yansıtıyor → step-1 logunda **behavior.md kuralları gerçek prompt'ta görünür**.
- **Antigravity birleşik koşu (üçü bir arada, rules enjeksiyonu aktif):** `succeeded`, 8 item (7 task+1 epic), owner/parent_id/version/model **7/7** → regresyon yok, enrichment persist ediyor.

**Not (ortam):** codex headless koşusu `~/.codex/config.toml`'daki **cloudflare MCP expired OAuth token**'da asılıyor (1 koşu 37dk boşa yandı, kill) — kod sorunu değil; o MCP girdisini kaldır/yenile.

**SIRADAKİ:** (1) **Rebuild:** `npm run build && npm pack && npm install -g ./kortext-3.1.0.tgz`. (2) Eray temiz UAT (codex MCP düzeltildi → codex ya da antigravity) → planning Board'da owner/epic/version/model dolu + ≤8. (3) `npm publish` (kasıtlı manuel adım). Her şey push edildi; bekleyen lokal commit yok.

---

## ⭐ Önceki (2026-06-08 #7) — UAT (codex) → planning step-1 ÇÖKTÜ: sinyal-çıktı bug'ı (yeni oturum çözecek)

Eray temiz UAT koştu (rebuild #6 kurulu → `kortext start` sihirbazı → "Notlarım", **codex** executor, BRD ≤8 notlu). **Codex fix'i #2 canlıda doğrulandı** (anında çökme yok, analiz 12 adım uçtan uca koştu, ~176s/adım — claude'un ~2 katı yavaş). AMA **planning ilk adımda çöktü**, enrichment hiç test edilemedi. **Bu turda kod düzeltmesi YOK** (sadece TODO/HANDOVER); Eray "başka oturumda çözeceğim, UAT'a birlikte devam" dedi.

**🔴 Kök neden (TODO "KRİTİK UAT #7"):** Workflow adımları dosya + **sinyal/marker** çıktıları tanımlıyor (`backlog-drafted`, `backlog-assignees-set`, …). `output-resolver.findActualOutputFiles` **her çıktıyı dosya sanıyor** → `backlog-drafted` dosyası bulunamayınca `backlog-tanm.1` fail → `backlog.yaml` (16 item) yazıldığı halde **ingest edilmedi** (DB 0). 4 executor de sinyali dosya gibi doğruluyor; filtre yok. **#6 antigravity geçti çünkü marker dosyası yarattı; codex yaratmadı → patladı** (ajan davranışına bağlı kırılgan akış).

**🔴 Ek bulgu (UAT #7):** `rules/` dosyaları (behavior.md/models.md/…) ajan prompt'una **hiç enjekte edilmiyor** — sadece dashboard/insan için. Ajan yalnız persona gövdesi + workflow adım talimatı + input **yolları** görüyor. "rules ajanları yönetir" beklentisi gerçekleşmiyor; `models.md` mapping'i ajana ulaşmıyor. (TODO "rules enjekte edilmiyor".) Workflows ise motor tarafından sadık takip ediliyor (adım adım besleniyor).

**🟡 İkincil (UAT #7):** codex BRD "≤8 item" notunu yok saydı → **16 item** (antigravity 8 üretmişti). Kapsam kaldıracı executor-bağımlı. (Not: ≤8 BRD içinde = input dosyası; ajan kendi okumalı, enjekte edilmiyor — rules bulgusuyla bağlantılı.)

**SIRADAKİ (yeni fix oturumu):** (1) Sinyal vs dosya çıktı ayrımı — bare-token (`/`/`.` yok) çıktılar dosya olarak doğrulanmasın; ortak helper. (2) **Gerçek codex koşusuyla** doğrula (planning step-1 geç → backlog ingest → enrichment dolu → planning succeeded). (3) codex ≤8 yok sayma. Sonra Eray ile UAT'a devam. **UAT ortamı ayakta:** `not` → :3200 (planning failed, backlog DB 0). Fix sonrası `kortext stop not && kortext purge not --yes` ile temiz başlanır.

---

## ⭐ Önceki (2026-06-08 #6) — Planning enrichment KÖKTEN ÇÖZÜLDÜ + GERÇEK-LLM KANITI ✅ (antigravity)

Yalnızca kod oturumu (UAT değil). UAT #5 bulguları (planning çökmesi + enrichment kaybı) TDD ile düzeltildi, **gerçek antigravity koşusuyla uçtan uca kanıtlandı.** **1061 test yeşil** (1054→+7), typecheck + build temiz. **Push EDİLMEDİ.**

**İki kök neden bulundu — ikincisi YALNIZ gerçek-LLM koşusunun gösterebildiği:**
1. **Naming/çökme (planning failed):** konsolidasyon adımı `planning-reports_<slug>_<ts>.md` (olmayan tür) + output-resolver'ın ts regex'i antigravity'nin ayraç varyasyonunu (`_174649`) eşleştiremiyordu → adım fail → patch ingest olmadı. **Fix:** tek kanonik ts `YYYY-MM-DD_HH-MM-SS`; `output-resolver` TIMESTAMP/SLUG pattern'leri her ayraç (`-`/`_`/`:`/`T`/boşluk) + UPPERCASE project-id'yi tolere eder; `markdown-sync` aynı format (eski back-compat); `planning-reports`→`status-reports`.
2. **🔴 FK cascade (enrichment kaybı — gerçek-LLM açığa çıkardı):** antigravity **step-1'de hiç epic üretmedi (0 epic)**, epic'leri sonraki patch'te tanımladı. `patchBacklogItems` yalnız güncellediği için epic'ler skip → task'ların `parent_epic` FK'i `FOREIGN KEY constraint failed` → 4 adım `0 updated` → owner/version/parent_id düştü. **Fix:** `patchBacklogItems` ön-geçişi eksik `type:epic` container'ları **önce yaratır** (FK hedefi olur).
3. **Görünürlük:** `backlog.patch.dropped` artık `updated:0 && (parse_error VEYA hepsi-skipped)` durumunda da ateşlenir.

**⭐ GERÇEK-LLM KANITI (harness, antigravity, "Notlarım" 8 item):**
- **1. koşu (sadece naming fix):** planning **succeeded** ✓ ama FK bug'ı → owner/version/parent_id **0/8**, epics 0.
- **2. koşu (FK fix dahil):** **owner 8/8, version 8/8, parent_id 8/8, model 8/8, epic 1, planning succeeded** ✅ — senin kriterin tam karşılandı. Ajan `status-reports_notlarim_<ts>` raporunu ayraçsız ts ile yazdı, robust resolver yine eşleştirdi (çökme yok).

**Kapsam (Eray onayı):** odaklı = planning + resolver; diğer workflow'ların statik rapor adları (`test-reports.md` vb.) dokunulmadı (ayrı follow-up). **Bilgi:** antigravity bazı adımlarda epic üretmiyor + ara patch'lerde parse hatası veriyor (2/9) — motor artık ikisini de telafi ediyor (epic auto-create + dropped görünürlük), ama workflow talimatı epic-üretimini sertleştirmek ayrı bir kalite turu olabilir.

**SIRADAKİ:** (1) **Rebuild:** `npm run build && npm pack && npm install -g ./kortext-3.1.0.tgz`. (2) Eray temiz UAT (antigravity) → onboarding→planning → Board'da owner/epic/version/model dolu görünmeli. (3) İstersen commit (push'u sen söyle).

---

## ⭐ Önceki (2026-06-08 #5) — UAT (antigravity, "Notlarım") → #1 PRATİKTE YENİDEN AÇIK + adlandırma kararı

Eray temiz UAT koştu: rebuild (#1–#4 kurulu) → `kortext start <path>` → onboarding (**antigravity**, BRD'ye "≤8 item" kapsam notu) → analiz+planning. **Kapsam kaldıracı tuttu (8 item, 70 değil).** AMA enrichment **yine persist olmadı:** owner/parent_id/version/model **8/8 boş, 0 epic, planning-pipeline = failed.**

**Neden #4 "çözüldü" ama yine patladı (nüans):** #4 fix'i Claude'la doğrulanmıştı (DECISIONS §917: kortext-v1, 127 item, hepsi dolu, step-8 succeeded). Bu UAT **antigravity** ile koştu ve ajan tarafı DOĞRU üretti (`backlog.patch.yaml` → `items:` + `parent_epic`+`version`+`assignee`+`model`+`blocks`), ama:
- **Konsolidasyon adımı çöktü** → doğru patch **ingest edilmedi** → enrichment uçtu. Hata: `declared outputs not produced: planning-reports_<slug>_<ts>.md`. Antigravity raporu `planning-reports_notlarim_20260608_174649.md` (ts `_174649` = alt-çizgi + 6-haneli saat) yazdı; output-resolver'ın gevşetilmiş `<ts>` regex'i (DECISIONS §890: `-` ayraç + 4-haneli saat) bunu **hâlâ eşleştiremedi**. Executor/format kırılganlığı: bir ajanın yazdığı ts varyasyonu adımı çökertiyor.
- Ara adımlar (`atama.1/2`) "succeeded" ama `updated: 0` → `assignee→owner` alias veya sessiz-başarısızlık şüphesi (canlıda doğrula).

**Eray kararı (kök çözüm — DECISIONS §7'ye işlendi):** tüm rapor/dosya adları **tek desen** `report-type_project-id_<ts>` (örn. `status-reports_NOT_2026-06-08_17-46-49.md`), `<slug>`→**project-id (`code`)**, **tek ts formatı**; **`planning-reports` türü kaldırılır → `status-reports`'a indirgenir** (zaten template'i yok, çökme sebebi buydu). Detay [TODO.md](./TODO.md) "YENİDEN AÇIK #5" + "Rapor/dosya adlandırma standardı".

**SIRADAKİ (yeni fix oturumu):** TODO'daki #5 + adlandırma standardını uygula (workflow ↔ template ↔ output-resolver hizala, tek ts deseni, planning-reports→status-reports, assignee alias + sessiz-başarısızlık görünürlüğü). **Gerçek-LLM (tercihen antigravity) koşusuyla doğrula** — "owner/epic/version/model dolu + planning succeeded" görülmeden kapatma. Sonra Eray UAT'ı **baştan** alacak. UAT ortamı kapatıldı (Eray durdurdu).

---

## ⭐ Önceki (2026-06-08 #4) — UAT bulguları #1–#4 TDD ile DÜZELTİLDİ ✅ (rebuild + UAT'a devam)

Önceki turun (#3) 4 düzeltilebilir bulgusu uçtan uca düzeltildi (TDD, **1054 test yeşil** [1027→+27], typecheck + build temiz). **Push EDİLMEDİ** (lokal commit'ler de henüz yok — working tree). Detay [TODO.md](./TODO.md)'de madde-madde.

- **#1 🔴 KRİTİK — Planning enrichment sessizce kayboluyordu (A–F):** Kök neden doğrulandı (canlı `notlarim/.kortext/foundation/backlog.patch.yaml` tepe anahtarı `dependency_patches:` → parser yalnız `items:` kabul ediyordu → tüm patch atlanıyordu). **A:** yeni `findItemArray` — `items:` yoksa ilk `id`-taşıyan obje listesini kabul eder (skaler dizi reddedilir). **B:** `assignee`→`owner` alias + guarded `setOwner` (asla null'lamaz, re-ingest atamayı silmez). **C:** AC zaten frontmatter+`acChecklist`'te; A parse edince iniyor. **D:** tam-kayıpta görünür `backlog.patch.dropped` audit olayı. **E:** A+D ile kapandı (motor her adımı yazıldığı an ingest+reserialize). **F:** `planning-pipeline.md` "tepe anahtar `items:` OLMALI" sertleştirmesi + örnek. (+10 test)
- **#2 🐛 Codex executor:** `args = ['exec','--sandbox','workspace-write','--skip-git-repo-check',...]` (flag'ler codex-cli 0.137.0 ile doğrulandı). (+1 test)
- **#3 🧰 UX env:** yeni `binary-resolver.ts` (`resolveExecutorBinary` — PATH+bilinen dizinlerde mutlak-yol keşfi) → `KORTEXT_CLAUDE_BIN` gerekmez; `buildDaemonEnv` driver'ı `kortext start` daemon'unda **varsayılan armed** yapar → `KORTEXT_DRIVE_ENABLED` gerekmez (prod node yolu OFF kalır). (+12 test)
- **#4 🧙 Home kirletme:** `resolveStartTarget`'a `isRegistryHome` guard'ı — home'un `.kortext`'i = global registry, asla proje değil → `onboard`/`list`. (+4 test)

**SIRADAKİ:** (1) İstersen tek/dörtlü **commit** (push değil). (2) **Rebuild:** `npm run build && npm pack && npm install -g ./kortext-3.1.0.tgz` → #1–#4 kurulu kortext'e iner. (3) **UAT'a devam:** `kortext purge not --yes` ile sıfırla → temiz onboarding (Claude) → bu sefer enrichment Board'a iner (owner/version/epic/gate/deps dolu), bare `kortext start` env'siz çalışır. **Kalan UAT bulgusu:** #5 çok-modelli executor (özellik, [TODO](./TODO.md)). **Not:** canlı `not` (:3200) eski 70 item geriye dönük düzelmez (eski patch dosyaları üzerine yazıldı) — temiz koşu gerekir.

---

## ⭐ Önceki (2026-06-08 #3) — UAT turu (Claude executor, "Notlarım") → bulgular kaydedildi, düzeltme yeni oturuma

Eray yeni bir uçtan-uca UAT koştu (temiz rebuild 3.1.0 → `kortext start` sihirbazı → "Notlarım" not-uygulaması, BRD `~/Downloads/BRDTEST.md`). **Analiz + planning gerçek Claude ile uçtan uca koştu**, +prime onay/revize kapıları çalıştı, **70 item** üretildi. 4 bulgu çıktı; Eray "bulguları kaydet + dosyaları güncelle, düzeltmeyi ayrı oturumda yaptıracağım, sonra UAT'a devam" dedi. **Bu turda kod düzeltmesi YAPILMADI** (sadece TODO/HANDOVER).

**Bulgular (hepsi [TODO.md](./TODO.md)'de detaylı):**
1. 🔴 **KRİTİK — Planning enrichment sessizce kayboluyor:** owner/epic/version/gates/blocked_by hepsi null, 70 item düz `to_do`. Kök neden: patch parser (`server/engine/backlog-ingest.ts`) yalnız `items:` kabul ediyor, ajan `dependency_patches:` (vb.) tepe-anahtar yazıyor → "no items array found" → patch atlanıyor. + `assignee`→`owner` alias yok, AC için kolon/UI yok, sessiz başarısızlık, tek paylaşılan patch dosyası 8+ adımda overwrite. (Alt-maddeler A-F.)
2. 🐛 **Codex executor kırık:** `exec` alt-komutu hiç geçilmiyor → ham `codex` interaktif → "stdin is not a terminal". (UAT bu yüzden Claude'a geçti.)
3. 🧰 **UX — çıplak `kortext start` yetmiyor:** `KORTEXT_CLAUDE_BIN` + `KORTEXT_DRIVE_ENABLED` env'i elle gerekiyor.
4. 🧙 **Home dizininden `kortext start` sihirbazı kirletiyor:** cwd=home iken bootstrap sihirbazı `~/.kortext` oluşturup kendini `erayendes` projesi sandı + auto-handoff tetiklenmedi → "elle cd && serve" fallback. (Kurtarma: `kortext start <path>` ile doğrudan başlatıldı.)
5. 🤖 **Çok-modelli executor vizyonu (Eray, özellik):** onboarding seçimi = operation-manager modeli; sonrası persona/görev bazında çok-model paralel.

**SIRADAKİ:** Yeni oturum #1 (kritik, A-F) + #2 + #3 + #4'ü TDD ile düzeltsin → rebuild → Eray UAT'a kaldığı yerden (build / "Auto") devam edecek. **UAT ortamı ayakta:** proje `not` → `:3200`, 70 item `to_do`, build başlamadı. Düzeltme öncesi `kortext stop not && kortext purge not --yes` ile sıfırlanabilir.

---

## ⭐ Önceki (2026-06-08 #2) — UAT turu + 4 UAT-güdümlü düzeltme TAMAM ✅

Eray gerçek bir **"ilk kez son kullanıcı"** UAT'ı koştu (temiz uninstall → paketten kurulum → `kortext start` sihirbazı → onboarding, **Antigravity/agy** executor ile). Bu turda kurulan **iş bölümü** ([[uat-division-of-labor]] hafızası): UAT operasyonlarını (install/start/onboarding/terminal) **Eray çalıştırır**; Claude sadece komut verir + bulunan bug'lar için **kod düzeltir**. 4 bulgu → 4 düzeltme (3 kod commit'i + docs), **1027 test yeşil**, typecheck + build temiz, **push EDİLDİ**.

**Düzeltmeler:**
1. **Onboarding'den GitHub Repository alanı kaldırıldı** (`OnboardingScreen.tsx`) — sandbox akışında kafa karıştırıyordu.
2. **OS-farkında port seçimi + hazırlık doğrulaması** (yeni `server/registry/port-probe.ts` + `health-wait.ts`) — **ana bug:** bir dev/preview sunucusu `:3200`'ü işgal etmişti; `allocatePort` sadece registry'ye baktığı için (gerçek OS portunu değil) yeni daemon'a dolu portu verdi → EADDRINUSE → daemon öldü → tarayıcı "Cannot GET /". Artık port gerçekten boş mu diye probe edilir + handoff'tan önce daemon sağlığı doğrulanır (değilse 503 + net mesaj). Disiplinli teşhisle bulundu (log: "dashboard mounted" doğruydu, sorun port çakışmasıydı).
3. **Aktivite mesajları insanlaştırıldı** (`dashboard.tsx` + `worker-pool.ts`) — `started product-analysis.1` → `compliance-expert started product-analysis step 1` (persona zaten payload'daydı, kullanılmıyordu).
4. **Self-dir guard** (yeni `server/registry/self-guard.ts`) — Kortext kendi paket dizinini proje yapmayı reddeder (`kortext start` → 'self', onboarding → 422). Eray'ın gereksinimi: "kortext dizininde proje olmasın ve kurulamasın". Sinyal: `package.json` adı `"kortext"`.

**Detay:** [DECISIONS §7.12](./DECISIONS.md).

**SIRADAKİ (yeni oturum + temiz rebuild):**
- **Temiz rebuild:** uninstall + `npm run build && npm pack && npm install -g ./kortext-3.1.0.tgz` → 4 düzeltme kurulu `kortext`'e iner. ([UAT-SESSION-PROMPT](./UAT-SESSION-PROMPT.md) güncel.)
- **Ortam temizliği (yeni oturumdan önce):** `kortext stop demo && kortext purge demo --yes` (repo'da yanlışlıkla açılmış demo daemon'u + bayat `.kortext`'i kaldırır — guard sonrası bir daha olmaz). `pass` (Milowda Pass, :3201, stopped) kayıtlı — UAT'a devam için `kortext purge pass --yes` ile sıfırla ya da `kortext start pass` ile sürdür. Stray preview sunucusu `:3200`/`:5173`'ü kapabilir → harness yönetiyor (preview_stop).
- **UAT'a devam:** rebuild sonrası temiz onboarding turu (Antigravity), build fazına kadar git.

---

## ⭐ Şu an (2026-06-08) — Onboarding-driven directory + otomatik git TAMAM ✅

Eray UAT'tan sonra: "dizini niye iki kez soruyorsun, daha projem yok ki — onu onboarding'de seçiyorum." → tam bir tasarım turu (brainstorming → spec → plan → subagent-driven 9 görev). **Yeni akış:** non-coder herhangi bir yerde **`kortext start`** yazar → tarayıcıda sihirbaz açılır → proje bilgisi + BRD + **proje dizinini sihirbazda seç** → Kortext o klasörü iskeler, **git'i otomatik kurar** (init+commit+`development`), gerçek daemon'u doğurur, tarayıcı oraya geçer, **analiz kendiliğinden başlar**. Elle `cd`/`git` YOK.

**Mimari (1 daemon:1 klasör:1 port kısıtı):** çıplak `kortext start` → geçici **bootstrap sihirbaz daemon'u** (`KORTEXT_BOOTSTRAP=1`, scratch home, `:3199`, kayıtsız) → submit'te blueprint route'un bootstrap dalı `createProjectAndLaunch` (iskele→`bootstrapGit`→BRD/meta→gerçek daemon doğur) → `handoffUrl` → tarayıcı yönlenir → gerçek daemon boot'ta `autoStartPendingAnalysis` (idempotent). Detay [DECISIONS §7.11](./DECISIONS.md) · [spec](../docs/superpowers/specs/2026-06-07-onboarding-driven-directory-design.md) · [plan](../docs/superpowers/plans/2026-06-07-onboarding-driven-directory.md).

**⭐ Final review KRİTİK bug yakaladı:** `KORTEXT_BOOTSTRAP=1` `spawnDaemon`'un `{...process.env}` mirası ile gerçek daemon'a sızıyordu → gerçek daemon kendini wizard sanıp **analizi hiç başlatmıyordu** (özellik sessizce ölü; unit testler spawn'ı mock'ladığı için kaçırmıştı). Fix: env'de `KORTEXT_BOOTSTRAP: ''` ile temizle (wizard'ın `cmd.env`'i korunur) + regresyon testi.

**Durum:** **1003 test yeşil**, typecheck + build temiz. Feature `main`'e lokal merge + bellboy self-shutdown (commit `0cd736d`) + docs, hepsi lokal, **push EDİLMEDİ.** postinstall + UAT-GUIDE + UAT-SESSION-PROMPT yeni akışa güncellendi. **SIRADAKİ:** push (sen "push" deyince) + `npm publish` + senin GUI-UAT turun.

---

## Önceki bu-devir (2026-06-07 #2) — Gerçek prod merge + tam sayfalama + vocab TAMAM ✅

Eray "3,5,6,8,9'u yap" dedi → sonuç: **#3 gerçek git prod release** (`deployProd` artık gerçek `development→main` merge + version tag; çakışma→bug; idempotent; sunucu orijinal branch'e döner; prod-push CI hâlâ mock). **#5 tam sayfalama** (`GET /api/backlog/aggregate` — roll-up/facet/per-version açık-iş sunucu-tarafı + "Daha fazla yükle" kart sayfalaması). **#8 vocab toleransı belgelendi**. **#6 (dashboard boş-durum) + #9 (CLI nüansları) zaten bitmişti** — Eray onayıyla ek yapılmadı. Final review 4 bulgu buldu+düzeltildi (branch-restore, conflict-flag scope, drawer-progress aggregate, version-flicker). Detay [DECISIONS §7.10](./DECISIONS.md).

**Durum:** **977 test yeşil**, typecheck + build temiz. Bu blok +4 commit (`f2fb20c`..`bab0c77`), **push EDİLMEDİ** (toplam bekleyen: bu blok). **SIRADAKİ:** push (sen "push" deyince) + `npm publish`.

---

## Önceki bu-devir (2026-06-07) — Preprod substratı + CANLI KOŞU TEYİDİ TAMAM ✅

**Preprod substratı:** §5.11 zinciri tamamlandı — `deployPreprod` + `deployProd` (mock-first) Deployer'a eklendi; version staging-onaylanınca `deployPreprod`→`preprod-approval` sorusu; `consumePreprodApproval` (onay→epic'ler `preprod_approved` + `deployProd` mekanik release; red→bug; idempotent) + route. Zincir preprod-onayında biter (prod gate'i yok, §5.11). Gerçek git main-merge/tag mock `deployProd`'a foldlandı (follow-up).

**⭐ CANLI KOŞU TEYİDİ — gerçek claude ajanı, izole sandbox (DevVault, code DV):** Gerçek planning ajanı 39 item + 6 epic üretti. **Sonuç:**
- ✅ Kodlu id'ler kusursuz: `DV-001`…`DV-039` + sentetik epic'ler `DV-E01`…`DV-E06`.
- ✅ **Bağımlılıklar GERÇEKTEN üretildi** (39 item, mantıksal zincirler) — A2 talimat pekiştirmesi tuttu, esas belirsizlik çözüldü.
- 🐛 **Canlı koşu gerçek bir kalibrasyon boşluğu yakaladı** (unit-test'in yakalayamayacağı): ajan `depends_on` yazdı (motorun beklediği `blocked_by` değil). **Fix: ingester `depends_on`'u `blocked_by` alias'ı kabul ediyor** ("LLM'i olduğu yerde karşıla"). Tip (`feature/chore`→`task`), status (`todo`→`to_do`), epic-etiketi→sentetik-epic normalizasyonları zaten çalışıyordu.
- ✅ **Fix sonrası gerçek veride uçtan uca:** 39'un **38'i auto-block**, simetri türetildi, DV-001 kapanınca bağımlıları `to_do`'ya döndü ama **çoklu-blocker'lı DV-005 `blocked` kaldı** (doğru semantik). Bağımlılık-sıralı yürütme gerçek LLM çıktısında çalışıyor.

**Not (kazı):** `dev:run --executor=claude` için `--binary`/`KORTEXT_CLAUDE_BIN` şart. Full pipeline (9 adım gerçek-LLM) bir sonraki zenginleştirme adımında ~70 dk askıda kaldı (kill); step-1 backlog'u (esas artefakt) erkenden üretmişti.

**Durum:** **951 test yeşil**, typecheck temiz. Bu blok (preprod + alias) +2 commit → bu oturum toplam **bekleyen 10 commit** (`710a0df`..`6a9d683`), push EDİLMEDİ. **SIRADAKİ:** push (sen "push" deyince) + `npm publish`. Kalan follow-up'lar aşağıda + [TODO](./TODO.md).

---

## Önceki bu-devir — Motor takibi + CLI sertleştirme + sayfalama TAMAM ✅

Eray'ın seçtiği 3 blok ([plan](../docs/superpowers/plans/2026-06-07-motor-cli-pagination.md), 3 paralel keşif → karar → TDD subagent'ları). **Hiç yeni migration gerekmedi** — biri hariç: staging metadata için `010` (nullable ADD COLUMN, güvenli).

**🔧 Motor takibi:**
- ✅ **Blocker-clear** (kararın: otomatik 'blocked' — dürüst board): ingest'te bağımlılığı bitmemiş item'lar oto-`blocked`; kapanışta bağlı item'lar oto-`to_do` (driver tekrar alır — `in_progress` DEĞİL, yoksa takılırdı). Frontmatter tabanlı, DB kolonu yok. Bu, **bağımlılık-sıralı yürütmeyi uçtan uca işler hale getirdi.** (Eski Slice 2 ertelemesi — migration gerekmeden çözüldü.)
- ✅ **Staging-onay tüketicisi** (kararın: tam zincir): prime onay→epic raporları 'approved' + epic `staging_approved` + **version-tamamlama** (bir version'ın tüm epic'leri onaylanınca `preprod-approval` sorusu); red→motor gerekçeyle **bug açar**. Cevap route'ta işleniyor. Staging raporları artık **gerçek dosya** (`writeReport`), epicId/version soru `metadata`'sında.
- ⚠️ **Preprod DEPLOY substratı yok** — sadece preprod-onay sorusu açılıyor (preprod ortam hedefi ayrı follow-up, [TODO](./TODO.md)).

**🖥️ CLI sertleştirme:**
- ✅ Paralel-`start` yarış kilidi (`server/registry/lock.ts`, sync O_EXCL + stale-reclaim; allocate+write kilit içinde, taze re-read). ✅ `allocatePort` tükenme mesajına kurtarma ipucu. ✅ Yeni-proje kaydı spawn'dan önce persist edilir.

**📐 Teknik borç:**
- ✅ Sayfalama küçük adım: `/api/backlog` `total` + `offset` döner, cap 2000'e çıktı, board "N / M gösteriliyor" der. Epic roll-up korundu (filtre-öncelikli model, full fetch kalıyor). Tam sayfalama (~500+ item olunca) hâlâ TODO.

**Final inceleme 2 bulgu buldu+düzeltildi:** (1) route consumer'ı fire-and-forget'ti → `await` edildi (yan etkiler 200'den önce durable); (2) `checkVersionCompletion` idempotent değildi → çift `preprod-approval` engellendi (+ regresyon testi).

**Durum:** **929 test yeşil** (807→929, +122 TDD bu oturum), typecheck temiz, build başarılı. Bu blokta 7 yeni commit (`710a0df`..`2537c12`). v3.1 + tüm fazlar dahil **toplam 25 commit push edildi `origin/main`'e (1971b1b'e kadar)**; bu blok (`1971b1b`..`2537c12`, 7 commit) **henüz push EDİLMEDİ.**

**SIRADAKİ:** push (sen "push" deyince). Açık follow-up'lar [TODO](./TODO.md): preprod deploy substratı, bağımlılık üretimi canlı-koşu teyidi, tam sayfalama (gerekince). Sonra `npm publish` + senin GUI-UAT turun.

---

## Önceki devir (2026-06-06) — Faz-3 boşlukları + Motor dilimleri + İçerik kalibrasyonu TAMAM ✅

Eray'ın seçtiği 3 alan ([plan](../docs/superpowers/plans/2026-06-06-phase3-engine-content.md), 3 paralel keşif ajanıyla haritalandı, TDD subagent'larıyla koşturuldu):

**A — Bağımlılık üretimi + epic-id** (motor enforcement; ajan-yazar + motor-doğrular kararı):
- ✅ Kodlu epic id'leri `<CODE>-E0N` — `deriveSyntheticEpics`'e `code` `server/index.ts` hook'undan geçirildi. **Entegrasyon bug'ı yakalandı+düzeltildi:** hook proje kökünü `dirname×2` ile çözüyordu (`.kortext` veriyordu) → `dirname×3` (gerçek kök) — yoksa `code` çözülmez, epic-id slug'a düşerdi.
- ✅ Motor simetri zorlaması (`enforceSymmetricDeps`, additive) + dangling-ref audit uyarısı. Workflow talimatı (planning-pipeline) zaten güçlüydü, pekiştirildi.

**B — Motor ertelenen dilimleri** (Slice 2/blocker-clear hariç — şema migrasyonu gerek, yine ertelendi):
- ✅ **Slice 3:** UAT verdict artık `gate_runs` satırı (attempt = önceki uat + 1, UNIQUE çakışması çözüldü).
- ✅ **Slice 4:** epic'in tüm çocukları bitince epic board'da `done` (direct write + audit, idempotent).
- ✅ **Slice 1:** handover-on-close — `HandoverEngine` closure'a bağlandı. **Final inceleme 2 boşluk buldu+düzeltildi:** driver `handoverEngine`'i `runClosure`'a geçirmiyordu (sessiz no-op) + `record()` sentetik `+prime` handle'ını reddediyordu (prod'da hiç yazılmazdı). Driver thread + `SYNTHETIC_PERSONA_HANDLES` izni + driver-e2e guard test eklendi.
- ✅ **Slice 6:** preview URL kalıcılığı — migration `009`, `backlog_items.preview_url`, `frontmatter.preview` flag ile gate'li, API'de açık.
- ✅ **Slice 5:** staging raporları (`reports_index` gate-persona başına) + prime staging-onay sorusu (`run_id=null`; `ApprovalQueue.enqueue` gevşetildi). Yeni `staging-approval.ts`.

**C — İçerik kalibrasyonu** (tam):
- ✅ Ölü MCP tool refs (`write_learned`/`write_decision`/`get_backlog_item`) → gerçek dosya-yazım/tool. ✅ Tüm `kortext-*.py` script refs (`commands.md`, `behavior.md`, dev-agent'lar) → gerçek v3 MCP tool'ları (`transition_item`/`handover`/`get_acceptance_criteria`/`get_runtime_status`) ya da "motor-otomatik". Doctor yeşil, içerikte hiç ölü ref kalmadı.

**Durum:** **874 test yeşil** (807→874, +67 TDD), typecheck temiz, build başarılı. **24 yeni lokal commit** (v3.1'in 12'si + bu fazın 12'si: `0dce640`..`c7acc53`), **origin'e PUSH EDİLMEDİ.**

**SIRADAKİ:** push (sen "push" deyince) → publish. Ertelenen follow-up'lar [TODO](./TODO.md): staging-onay tüketicisi (prime onay→version ilerle / red→bug), staging `reports_index` sentetik `file_path` (gerçek özet dosyası yazımı), + v3.1 nitleri (paralel-start kilidi, allocatePort mesajı). Blocker-clear (Slice 2) hâlâ ertelendi.

---

## Önceki devir (2026-06-06) — v3.1 CLI per-project-daemon TAMAM ✅ (11 görev) + paketlenmiş smoke test geçti

**v3.1 CLI yeniden tasarımı bitti.** [Plan](../docs/superpowers/plans/2026-06-06-cli-per-project-daemon.md)'ın 11 görevi `subagent-driven-development` ile koşturuldu (TDD). Sonuç: **proje-başına port** mimarisi — global registry (`~/.kortext/projects.json`, atomik yazım) + daemon launcher (detached spawn / pid-liveness / kill) + 9-komutluk CLI yüzeyi. Sunucu/API/React dokunulmadı.

- ✅ **9 komut:** `start / stop / pause / list / remove / purge / update / doctor / help`. Eski mock-executor workflow runner → `kortext dev:run <id>` (testler için korundu); `serve`/`init` dev komutu olarak kaldı.
- ✅ **Registry core** (slug `<CODE>`→lowercase, çakışmada `-N`; stabil port 3200+; atomik temp+rename). **Daemon** (prod-mode `node dist/server/index.js`, log → `<proj>/.kortext/data/logs/daemon.log`).
- ✅ **EADDRINUSE handler** (v3.0.1 borcu kapandı): çakışan port artık net mesaj + exit 1, sessiz "Cannot GET /" değil. Canlı doğrulandı.
- ✅ **Paketlenmiş smoke test** (Task 11) uçtan uca geçti — `npm pack` → izole temp-prefix kurulum → iki paralel daemon gerçek portlarda (3201/3202, HTTP 200) → stop / aynı-port restart / remove (.kortext korundu) / purge (.kortext silindi). Senin global kortext'ine ve canlı `:3200` UAT sunucuna **dokunulmadı** (izole HOME + temp prefix).
- 🐛 **Smoke test + final review 2 defect yakaladı, ikisi de düzeltildi:** (1) `js-yaml` runtime'da import ediliyordu ama `dependencies`'te yoktu → paketlenmiş daemon `ERR_MODULE_NOT_FOUND` ile çöküyordu (artık deklare edildi); (2) `spawnDaemon` parent log fd'sini kapatmıyordu (fd sızıntısı → `closeSync` eklendi).
- **Durum:** **835 test yeşil** (807→835, +28 TDD), typecheck temiz, build başarılı, version **3.1.0**, CHANGELOG `[3.1.0]`. **12 yeni lokal commit (`672f06c`..`681302e`), origin'e PUSH EDİLMEDİ** (senin onayını bekliyor).

**SIRADAKİ:** (1) **push** (sen "push" deyince) → ardından **`npm publish`** (kasıtlı manuel adım, otomatik değil). (2) Final-inceleme ertelenen nitler [TODO](./TODO.md)'da: paralel-`start` yarış kilidi (EADDRINUSE hafifletiyor), `allocatePort` tükenme mesajına `kortext list/remove` ipucu. (3) Ertelenen faz-3 boşlukları: dependency üretimi + epic-id (`TF-E01`).

**⚠️ Not:** Mevcut global `kortext` (`/opt/homebrew/bin/kortext`) eski sürüm — yayın sonrası `kortext update` veya yeniden global install ile tazelenir. Canlı UAT sunucusu hâlâ `:3200`'de ayakta (dokunulmadı).

---

## Önceki devir (2026-06-06) — UI fazlarının TAMAMI (1+2+4+3) BİTTİ ✅; faz-3 canlı koşuyla doğrulandı

**Faz 3 (persona kalibrasyonu) — taze canlı koşu `kortext-live-uat-v3` ile doğrulandı.** Yeni sandbox sıfırdan koştu (onboarding TaskFlow BRD → analiz → planning, iki run da `succeeded`, 102 item / 86 task + 16 epic). Auto-approve poller +prime gate'lerini sürdü. Sonuç **kısmi ama ana hedefler tuttu:**
- ✅ **item-id:** 86 task hepsi `TF-001`…`TF-086` (slug→`<CODE>-NNN` çözüldü).
- ✅ **memory:** `.kortext/memory/decisions.md` 15KB gerçek ADR günlüğü (analiz+planning yazdı).
- ✅ **dependency UI:** `dependenciesOf` frontmatter okuyor + drawer Dependencies bölümü (synthetic dep ile kanıtlandı).
- ⚠️ **KALAN:** dependency ÜRETİMİ (ajan 0 üretti — yalnız görsel boşluk, motor kullanmıyor) + epic-id (ajan `TF-E01` uygulamadı, slug kaldı). Eray: şimdilik ertele ([TODO §D](./TODO.md)).
- **Bonus:** inşaat-fazı paralelliği 6 görev / 12 worktree'ye çıkarıldı (Eray "orta", `server-drive.ts`).

**⚠️ Backend artık v3'ü gösteriyor:** port `:3200` cwd=`kortext-live-uat-v3` (v2 değil). v2 verisi diskte duruyor. Eski UI bulguları v2'de keşfedildi; v3 = kalibre koşu.

---

## Önceki bu-devir özeti — UI fazı 1+2+4 (UAT bulguları)

**Bağlam:** Tam zincir kesintisiz canlı koştu (§14.7–14.9, sandbox `kortext-live-uat-v2`, 127 item/18 epic — detay [DECISIONS §14.7–14.9](./DECISIONS.md)). Eray canlı veriyi gerçek UI'da gezip ~18 UAT bulgusu verdi; sıra **1→2→4→3**. **1, 2, 4 tamamlandı ve canlı tarayıcıda doğrulandı.** Hepsi "veri doğru, UI bağlı değil" türündendi — motorda değişiklik gerekmedi.

**Bu devirde yapılanlar (4 yeni lokal commit `2f0cbf6`..`96be236`):**
- **Faz 1 — veriyi bağla:** epic kolonu (`?limit=500`), assignee (`assigneeOf` owner→frontmatter), versiyon filtresi (`VersionSelect` + en-küçük-bitmemiş varsayılan, semver sort), Dashboard activity timeline (yeni `GET /api/activity` küratörlü audit feed + `describeAuditEvent`).
- **Faz 2 — eksik özellikler:** doküman scroll (`.fb-view min-height:0`), "New" görev gerçek in-app form (prompt→form, POST `version` kabul eder), item yorumu (`POST .../comment`→audit_log, drawer+timeline aynı feed), çalışan Assignee filtresi (+ per-item feed küratörü; "Group:Epic" pill kaldırıldı).
- **Faz 4 — agents/ikonlar:** Agents paneli `deriveActiveAgents` (yalnız açık-görevli ajan + statü, açıklamasız); persona ikon seti Eray'ın seçimiyle güncellendi (`persona-colors.ts`).

**Durum (tüm fazlar):** **807 test yeşil** (767→807, +40 TDD), typecheck temiz, konsol hatasız. Yeni saf-mantık modülleri: `agents-panel.ts` + board-drawer'a `assigneeOf`/`assigneesOf`/`compareVersions`/`sortedVersions`/`defaultActiveVersion`/`dependenciesOf`. **Bu oturumda main'e ~19 lokal commit (`28f3b65`..`6e71a39` + bu docs commit'i), origin'e PUSH EDİLMEDİ.**

**SIRADAKİ — v3.1 CLI yeniden tasarımı (plan hazır).** Eray mimariyi seçti: **A = proje-başına port** (tek-daemon-URL değil — frontend/API/backend dokunulmaz; iş = registry + CLI + daemon yaşam döngüsü). Tam, no-placeholder TDD planı: **[docs/superpowers/plans/2026-06-06-cli-per-project-daemon.md](../docs/superpowers/plans/2026-06-06-cli-per-project-daemon.md)** — 11 görev, dalga-paralel (Wave1: registry+daemon sıralı → Wave2: 6 komut paralel → Wave3: bin wiring → Wave4: release). **Uygulama YENİ oturumda** (bu oturum bağlamı dolu): `subagent-driven-development` ile planı task-task koştur. Önce push (Eray onayladı, bu oturumda yapıldı). Sonra faz-3 boşlukları (dependency üretimi + epic-id, ertelendi) istenirse.

**Canlı sandbox + sunucular AYAKTA:** Backend `:3200` cwd=`kortext-live-uat-v3` (kalibre koşu, 102 item / 86 task `TF-NNN` + 16 epic + `memory/decisions.md`). Eski v2 (127 item) diskte duruyor. vite önizleme `:5173` (preview MCP `kortext-uat-web`) /api'yi 3200'e proxy'ler. (Düşerse: `cd kortext-live-uat-v3 && KORTEXT_PORT=3200 npx --prefix <repo> tsx <repo>/server/index.ts &`; server dosyası düzenlenince elle restart — `tsx watch` değil.)

---

## Önceki devir (2026-06-05) — Backlog enrichment + step-8 bulgusu kapandı ✅

**Bağlam:** Canlı koşunun (§14.2) çıkardığı iki gerçek bulgu giderildi. Önceki devrin üç yıldızlı işinin tamamı (kapı Faz 2, ekran bug'ları, canlı koşu) + bu bulgular artık kapalı. Detay [DECISIONS §14.7](./DECISIONS.md).

**Kök neden (ortak):** headless Claude ajanı Kortext'in iç yardımcılarını (`writeReport`, MCP) değil **düz Write tool'unu** kullanıyor → kendi format/anahtarlarını uyduruyor. İki cepheli çözüm (Eray onayı: "ikisi birden" workflow+motor, "var olanı güncelle" upsert).

**(A) Epic/versiyon/model Board'a inmiyordu — 3 katman:**
1. **Upsert ingester** (`server/engine/backlog-ingest.ts` + `server/db/repositories/backlog.ts`): `ingestBacklogItems` artık var olan id'yi atlamıyor — planning kolonlarını **günceller** (yeni `updatePlanningFields`, `status`/`owner`'a dokunmaz), `updated[]` döner. Çok-adımlı pipeline her adımda backlog.yaml'i baştan yazınca uzman katkıları (gate/versiyon/model) birikiyor.
2. **Synthetic epic** (`deriveSyntheticEpics`): ajan düz `epic: "X"` etiketi (id değil) yazarsa gerçek `type: epic` türetir + bağlar (kemer+askı; düzgün `parent_epic`'te tetiklenmez).
3. **Workflow** (`workflows/planning-pipeline.md` yeniden yazıldı): ölü `update_backlog_item` MCP temizlendi; her adım "oku→uygula→bütün dosyayı yeniden yaz" + backlog.yaml'i **ek output** verir (token zinciri sıralar, backlog.yaml input'a girmez → DAG döngüsüz, `buildGraph` lineer 1→9 doğrular). Step-0 `type: epic`+`parent_epic` zorunlu.

**(B) Step-8 rapor FAILED — `server/engine/output-resolver.ts`:** `<ts>` pattern'i yalnız canonical `2026-06-05-1959` eşliyordu; ajan `…_20260605.md` yazınca dosya diskte olduğu halde "üretilmedi" dedi. Pattern gevşetildi (compact/date-only/with-time eşler, çöp reddedilir; canonical regresyonsuz).

**Kanıt:** **751 test yeşil** (745→751, +6 TDD test), typecheck temiz. Uçtan uca in-memory: skeleton→enriched ingest → 0 yaratım/3 güncelleme, Board **1 epic / 2 child / 3 version / 3 model** (canlı koşuda 0/0/0'dı). Fallback: düz `epic: Payments` → `epic-payments` türetildi.

**Durum:** Değişiklikler **henüz commit edilmedi** (working tree'de). Önceki 5 commit (`7e56755`, `575ca49`, `0620832`, `9ad605c`, `70080df`) main'de, **origin'e PUSH EDİLMEDİ.** **SIRADAKİ:** (1) bu işi commit et; (2) kesintisiz canlı koşu ile §14.7'yi gerçek-Claude'da doğrula (sandbox `kortext-live-uat` runbook'u TODO'da); (3) diğer workflow/persona dosyalarındaki ölü araç atıflarını temizle (deployment-cycle, hotfix, rollback, operation-manager, qa-engineer, engineering-manager — TODO'da).

---

## Önceki devir (özet) — backlog köprüsü + v6 hi-fi app + otonomi + motor

- **Canlı UAT + backlog file-ingestion köprüsü (2026-06-05, [DECISIONS §13](./DECISIONS.md)):** MCP yaklaşımı canlı testte çöktü (headless ajan Write-tool kullanıyor) → Eray "dosya köprüsü" seçti. Planning agent `.kortext/foundation/backlog.yaml` yazar → `backlog-ingest.ts` parse eder. Gerçek ajan BRD'den 83 item yazdı → Board'da 83 görev. main'e push edildi.
- **v6 hi-fi gerçek app'e indi (2026-06-04→05):** 14 ekranın tamamı React'te (`src/`) — Dashboard/Board/References/Memory/Reports + 4 project + 7 kortext settings + onboarding wizard + ⌘K + bildirim + terminal + light/dark tema. Paylaşılan primitifler: `FileBrowser`/`AnnotatableDoc`/`SettingsPane`/`Drawer`. Tasarım kaynağı `concepts/wireframe-v6-hifi.html`. Kararlar [DECISIONS §11–§12](./DECISIONS.md).
- **Üretim otonomisi (2026-06-04, `e209ac0`):** dashboard "Run once" + "Auto" toggle + `DriveScheduler` (60sn). Ana env kilidi (`KORTEXT_DRIVE_ENABLED`, varsayılan kapalı) üstünde ikinci toggle. Canlı kanıtlandı.
- **Motor/şema epic §5.9 TAMAM:** tek-item lifecycle + epic→staging + capstone + son montaj + `driveReadyItems` ("başlat düğmesi") + `POST /api/drive` (kilitli). Gerçek git ile to_do→done kanıtlı (`driver-e2e.test.ts`). Detay [DECISIONS §5](./DECISIONS.md).

---

## Açık işler (KALAN — tam liste + detay [TODO.md](./TODO.md))

> Bu oturumda biten her şey [DECISIONS Bölüm 7](./DECISIONS.md)'de. Aşağısı = **gerçekten kalan**.

**🚀 Yayın**
- [ ] **push** — bu oturumun işi dahil tüm lokal commit'ler `origin/main`'e gönderilmedi (sen "push" deyince). `main` origin'den ~18 commit ileride.
- [ ] **`npm publish`** — push sonrası son kasıtlı manuel adım. Yayın sonrası mevcut global `/opt/homebrew/bin/kortext` eski → `kortext update`.
- [ ] **Senin GUI-UAT turun** — yeni `kortext start` → sihirbaz → dizin-seç → otomatik git → analiz akışını tarayıcıda gez ([UAT-SESSION-PROMPT](./UAT-SESSION-PROMPT.md) güncel).

**🧙 Bootstrap sihirbazı**
- [x] ~~**Sihirbaz ("bellboy") daemon self-shutdown**~~ ✅ (2026-06-08, commit `0cd736d`). `scheduleBootstrapSelfExit` — `KORTEXT_BOOTSTRAP=1` guard'lı unref'li 2sn timer; blueprint bootstrap dalı handoff 201'ini flush edince wizard `process.exit(0)` yapar → `:3199` boşalır, sıradaki `kortext start` çakışmaz. +4 test (1003 yeşil). Elle kill gerekmez.

**🔧 Motor follow-up'ları**
- [ ] **Prod push (CI) substratı** — `deployProd` artık gerçek `development→main` merge + tag yapıyor ✅; ama `git push origin main`/CI tetikleme hâlâ yok (gerçek prod hedefi yok). Gerçek prod altyapısı gelince ekle.
- [ ] **Full planning pipeline canlı dayanıklılık** — 9-adım gerçek-LLM koşusunda adım-zaman-aşımı + hung-claude tespiti (canlı teyitte bir zenginleştirme adımı ~70dk askıda kaldı, kill). + auto-approve poller ile uçtan-uca canlı koşu.

**🧹 Küçük / opsiyonel**
- [ ] Concurrency tavanları (`DRIVE_MAX_ITEMS=6`, `DRIVE_MAX_WORKTREES=12`) — Eray isterse ayarlanır.
- [ ] İçerik kalibrasyonu (persona/workflow ince ayar) — ölü ref'ler temizlendi + vocab toleransı belgelendi; gerçek koşularda davranış gözlemiyle süren bir tur.
- [ ] Sayfalama: EpicDrawer çocuk LİSTESİ hâlâ yüklü sayfadan (ilerleme sayısı aggregate'ten doğru; liste "Daha fazla yükle" ile tamamlanır) — büyük epic'lerde tam liste için ufak follow-up.

> **Biten (2026-06-08):** onboarding-driven directory + otomatik git (9 TDD görevi, sihirbaz daemon → gerçek daemon devri → boot auto-start; kritik env-leak bug'ı final review'da yakalandı). [DECISIONS §7.11](./DECISIONS.md).
> **Biten (önceki blok):** gerçek git prod merge+tag (#3), tam sayfalama/aggregate (#5), vocab (#8); dashboard boş-durum (#6) + CLI nüansları (#9) zaten yeterliydi.

---

## Sabitler (her oturum)

- **Eray:** non-coder, Türkçe konuşur, kod+commit+yorum İngilizce, GUI-first, somut artefakt ister (screenshot/dosya yolu/çalışan önizleme).
- **Mimari/UX kararları:** `AskUserQuestion` ile **sade dille** (jargon değil, öneri başa). Büyük kararları Eray onaylar.
- **Push kuralı:** `origin/main`'e Eray **açıkça "push"/"merge" demeden** push YOK. Lokal commit serbest.
- **Önizleme tuzakları (kayıtlı):** `tsx watch` server dosyası düzenlenince restart olur → düşerse `preview_start`. `preview_eval` reload/animasyonda flaky → reload AYRI çağrıda, kısa senkron eval tercih et. `preview_screenshot` 1-2 kare geride olabilir → ölçü/durum için `getComputedStyle`/DOM teyidi (screenshot ikincil).

## Linkler

- Mimari: [ARCHITECTURE.md](./ARCHITECTURE.md) · Kararlar: [DECISIONS.md](./DECISIONS.md) · Tasarım: [DESIGN.md](./DESIGN.md) · Açık iş: [TODO.md](./TODO.md) · UAT: [UAT-GUIDE.md](./UAT-GUIDE.md) · Davranış+dosya haritası: [../CLAUDE.md](../CLAUDE.md)
