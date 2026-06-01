# Kortext — Handover

> Yeni Claude Code oturumu için bootstrap pusulası. Açar açmaz şu prompt'u yaz:
> **"HANDOVER.md'yi oku, devam edelim."**

---

## 1. Şu an (2026-06-01)

**UI TRACK — bu oturumda ilerledi:** ✅ Ekran 1 **Onboarding** + ✅ Ekran 2 **Dashboard** bitti. 2 ayrı LOCAL commit `main`'de (**HENÜZ PUSH EDİLMEDİ** — Eray "push" deyince): `8712b43` dashboard tam-birebir (gerçek persona/iş-başlığı/adım-ilerlemesi, header +p avatar) · `fc707e8` onboarding (dizin seçimi yaz/Browse + Model A "başka klasöre kur" + Codex executor + platform Desktop/ön-seçimsiz + executor Antigravity-alfabetik-2×2 ızgara + Mock netleşti/ön-seçimsiz). **554/554 test yeşil**, typecheck temiz, demo geri yüklendi (Demo CRM). Onboarding'de Eray onayıyla **backend de genişletildi** (`normalizeExecutor`+codex, `resolveBlueprintTarget`+`projectDir`, `POST /api/pick-directory`) — yani "BACKEND'E DOKUNMA" Eray-onaylı esnetilebilir (gerekirse sor, onaylarsa TDD ile yap). **Sıradaki = Ekran 3 Board** (güncel kopyala-yapıştır prompt aşağıda). Açık izler: (a) native Browse osascript önizlemede çalışmaz → Eray terminalde test etmeli; (b) success-panel "kortext serve" komutu teyit edilmeli; (c) dashboard fixture'ı (`.kortext/seed-dashboard.ts`) daemon restart'ında reconcile olur → dolu görünüm için yeniden çalıştır.

**Branch:** `main`. Motor/şema epic §5.9 **CAPSTONE + SON MONTAJ + DRIVER GİRİŞE BAĞLANDI.** Capstone (9 TDD adapter/keystone dilimi `39953ad`→`c692223`) + son montaj (4 kompozisyon dilimi `8cbd5e1`→`86ddaeb`, `driveReadyItems` = "başlat düğmesi", `driver-e2e.test.ts` gerçek git'le to_do→done kanıtlıyor) **artık origin/main'de — bu oturumda PUSH edildi (6 commit).** Bu oturumda ayrıca **§5.16 indi: driver bir HTTP girişine bağlandı** — `POST /api/drive` `driveReadyItems`'i tek-tur sürüyor, **ama varsayılan KAPALI bir güvenlik anahtarının (`KORTEXT_DRIVE_ENABLED`) arkasında.** **Mimari karar: Eray sade-dille "kilitli dursun, anahtarla açılır" seçti.** 3 parça, her biri TDD: env fail-safe anahtar (`server/config/env.ts`, yalnız `"1"`/`"true"` açar) · `driveRouter` (`server/routes/drive.ts`, 403 kapalı / 409 uçuşta / 202 başladı, fire-and-forget) · `makeServerDrive` (`server/orchestrator/server-drive.ts`, runtime lazy-once montaj). **521→535 test**, typecheck + lint temiz. Gerçek-sunucu smoke İKİ yön: KAPALI→403, AÇIK+boş backlog→202 temiz no-op (repo kirlenmedi). Detay [DECISIONS §5.16](./DECISIONS.md). **Blast-radius:** bu, etkiyi sıfırdan çıkarabilecek **İLK** slice — ama anahtar varsayılan kapalı → merge'de etki **pratikte hâlâ sıfır**; Eray `KORTEXT_DRIVE_ENABLED=1` set edip (yeniden) başlatana kadar düğme atıl. ✅ **Bu slice (`de653f5`) origin/main'e PUSH edildi** (2026-06-01) — motor track'inin tamamı artık uzakta. **Sıradaki = UI track** (ekran-ekran, ilk ekrandan; aşağıdaki kopyala-yapıştır prompt). Backend ertelenenleri (§5.16) UI'a paralel, sonraki iş.

> **Süreç dersi (kayıtlı):** son montaj 4. diliminde, worktree'ye yazan bir test executor'ının guard'ı (`worktreePath !== repoRoot`) deployment adımında host repo'ya düşüp 2 stray commit + 1 çöp dosya yarattı. `--mixed reset` (reflog ile sıfır kayıp) + guard'ı pozitif/dar yaptım (`workflowId==='development-cycle' && path.startsWith(...)`). Ders: worktree-mutasyonlu test executor'ı asla `process.cwd()`'e düşebilecek negatif guard kullanmamalı.

**Bu oturumda inen (6 slice, hepsi TDD + mock-first, ayrı commit):** `uat review-cycle` (review→done/bounce, prime onayı) · `whose-turn` (board "sıra kimde" türetimi) · `closure` (review→merge→done/bounce iskelet) · `epic-completion` (item done→epic bitti→staging tetik) · `block` (block→run cancel, `RunRegistry`) · `local test-URL` (`PreviewManager`). Detay [DECISIONS §5.13](./DECISIONS.md). **Beş mock-first arayüz** (`gate-executor`/`review-approver`/`merger`/`deployer`/`preview-server`) + `RunRegistry` + `PreviewManager` hazır; tümü Madde 10'da gerçeğe bağlanır. Üretim blast-radius **sıfır** (yalnız testler sürüyor — lifecycle henüz orchestrator'dan sürülmüyor).

| Test | Lint | Typecheck | Build |
|---|---|---|---|
| 535/535 ✅ | 0 hata · 4 pre-existing warning | 0 hata | temiz |

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

## ▶ Sonraki oturum — UI track (kopyala-yapıştır prompt)

> **Motor track BİTTİ + tamamı origin/main'de** (capstone+montaj+§5.16 driver tetiği, `de653f5` dahil). Sıradaki oturum **UI** — ekran-ekran, ilk ekrandan. Yeni oturumda şunu yaz:

```
KORTEXT — UI OTURUMU (ekran-ekran, BOARD'DAN devam)

DURUM: Backend/motor BİTTİ (origin/main). UI track BAŞLADI — bu oturumda ✅ Ekran 1
(Onboarding) + ✅ Ekran 2 (Dashboard) bitti, 2 LOCAL commit main'de (8712b43 dashboard,
fc707e8 onboarding) — HENÜZ PUSH EDİLMEDİ (Eray "push" deyince). 554 test yeşil. Sıradaki:
EKRAN 3 = Board. BACKEND'E DOKUNMA prensibi sürer AMA Eray onayıyla esnetilebilir
(onboarding'de öyle yaptık: Codex executor + projectDir + POST /api/pick-directory, hepsi
TDD'li). Gerekirse Eray'a sade-dille sor, onaylarsa TDD ile yap. Detay: DECISIONS §5.16.

GÖRSEL SPEC — TEK KAYNAK, BİREBİR UY: development/concepts/wireframe-v4-final.html.
Her ekranı buna birebir uydur. mockup-v3-palette-preview.html ARTIK referans DEĞİL.
Renk/tipografi: development/DESIGN.md. UI kodu: src/ (React + TanStack Router +
Tailwind v4).

CANLI GÖRMEK:
- Dashboard: preview_start "kortext-dev" (5173). Demo yüklü (Demo CRM, backlog + dashboard
  fixture). Backlog seed: `npx tsx .kortext/seed.ts`. Dolu dashboard ("aktif iş" tablosu):
  `npx tsx .kortext/seed-dashboard.ts` (gitignored; daemon restart'ında reconcile olur →
  yeniden çalıştır).
- Spec yan yana: preview_start "kortext-wireframe" (8092) → /wireframe-v4-final.html
  (launch.json düzeltildi: development/concepts/ servis edilir).

YÖNTEM (her ekran için, sırayla): (1) canlı UI + wireframe-v4 spec'i yan yana göster
(screenshot), (2) fark/eksikleri Eray'la SADE-DİLLE konuş (brainstorming/frontend-design
skill), (3) onay alınca src/'de uygula, (4) preview screenshot ile doğrula, (5)
ekran-başına ayrı commit. Bir ekran bitmeden diğerine geçme.

EKRAN SIRASI: ✅1.Onboarding ✅2.Dashboard → 3.Board → 4.Memory → 5.Reports →
6.References → 7.Project settings → 8.Agents → 9.Rules → 10.Workflows → 11.Hooks →
12.Integrations → 13.Environment → 14.Danger zone.

İLK ADIM: DESIGN.md oku + wireframe-v4-final.html'i preview'da aç + dashboard'ı başlat.
Sonra 3. EKRAN'dan (Board) başla: canlı /#/board vs wireframe Board'u yan yana karşılaştır,
Eray'ın ekran-ekran KENDİ yorumlarını al (bu yöntem iyi işledi). Açık izler: onboarding native
Browse dialog (osascript) önizlemede çalışmaz — Eray terminalde test etmeli; "created elsewhere"
ekranındaki "kortext serve" komutu teyit edilmeli.

SABİT: Eray non-coder/Türkçe, kod+commit İngilizce, GUI-first, somut artefakt
(screenshot). UX/mimari kararı AskUserQuestion ile sade-dille sor (öneri başa). main'e
SORMADAN push YOK. Saf görsel iterasyon screenshot'la doğrulanır; component mantığı
varsa TDD.

PARALEL TRACK (sonraya, UI öncelikli): backend ertelenenleri — handover-on-close,
gate_runs uat verdict, blocker-temizle, epic-status-flip, staging raporları, periyodik
zamanlayıcı (DECISIONS §5.16). Ayrıca: gerçek AI ajanıyla canlı UAT henüz yapılmadı.
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
